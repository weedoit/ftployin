var REMOTE_LAST_COMMIT_FILE = '.ftployin-last-commit';

var ftp = require('ftp');
var ftpClient = new ftp();
var git = require("ggit");
var fs = require('fs');


var envOpts;
var allOpts;

var excludeRules;
var tmp = require('tmp');

var getExcludeRules = function () {
    var exclude = envOpts.exclude || [];

    if (excludeRules) {
        return excludeRules;
    }

    if (typeof exclude === 'string') {
        exclude = [exclude];
    }

    excludeRules = exclude.map((rule) => new RegExp(rule));
    return excludeRules;
}

var parseCommitHash = function (line) {
    var hash = line.split(' ')[0] || null;

    if (hash && hash.length === 40) {
        return Promise.resolve(hash);
    } else {
        return Promise.reject(new Error('Invalid git log response'));
    }
}

var getFirstCommit = function () {
    return new Promise(function (resolve, reject) {
        var path = getRemotePath(REMOTE_LAST_COMMIT_FILE);

        ftpClient.get(path, function (err, file) {
            if (err) return resolve(null);

            var buffer = '';

            file.on('data', function (chunk) {
                buffer += chunk;
            });

            file.on('end', function () {
                resolve(buffer.trim() || null);
            });
        });
    });
}

var getCurrentCommit = function () {
    return new Promise(function (resolve, reject) {
        var cmd = 'git log --oneline --no-abbrev-commit --reverse | tail -1';

        git.exec(cmd, false)
            .then(parseCommitHash)
            .then(resolve)
            .catch(reject);
    });
}

var getDirPath = function (file) {
    var parts = file.split('/');

    if (parts.length > 1) {
        return parts.slice(0, -1).join('/');
    } else {
        return null;
    }
}

var dirExists = function (dir) {
    return fs.existsSync(dir);
}

var checkIsExcluded = function (path) {
    var rules = getExcludeRules(),
        matchs = rules.filter((rule) => rule.test(path));

    return matchs.length > 0;
}

var parseQueue = function (files) {
    return new Promise(function (resolve, reject) {
        var queue = [],
            mkdirQueue = [],
            len = files.length,
            file,
            dir,
            x;

        for (x = 0; x < len; x += 1) {
            file = files[x];

            if (checkIsExcluded(file.name)) {
                continue;
            }

            if (file.mode === 'A') {
                dir = getDirPath(file.name);

                if (dir !== null && mkdirQueue.indexOf(dir) === -1) {
                    mkdirQueue.push(dir);

                    queue.push({
                        mode: 'mkdir',
                        path: dir
                    });
                }

                queue.push({
                    mode: 'upload',
                    path: file.name
                });
            } else if (file.mode === 'M') {
                queue.push({
                    mode: 'upload',
                    path: file.name
                });
            } else if (file.mode === 'D') {
                dir = getDirPath(file.name);

                queue.push({
                    mode: 'delete',
                    path: file.name
                });

                if (dir !== null && mkdirQueue.indexOf(dir) === -1 && !dirExists(dir)) {
                    mkdirQueue.push(dir);

                    queue.push({
                        mode: 'rmdir',
                        path: dir
                    });
                }
            }
        }

        return resolve(queue);
    });
}

var diffParser = function (stdout) {
    return stdout.split('\n')
        .filter(function (curLine) {
            return curLine.trim() !== '';
        })
        .map(function (curLine) {
            var pieces = curLine.split('\t');

            return {
                mode: pieces[0],
                name: pieces[1]
            };
        });
}

var arr2iterator = function (array) {
    var nextIndex = 0;

    return {
        next: function () {
            return nextIndex < array.length ? array[nextIndex++] : false;
        }
    }
}

var getRemotePath = function (path) {
    return (envOpts.remoteDir !== '' && envOpts.remoteDir !== null)
        ? envOpts.remoteDir + '/' + path
        : path;
}

var processQueue (queue) {
    var _queue = arr2iterator(queue),
        doItemJob;

    doItemJob = function (item) {
        return new Promise(function (resolve, reject) {
            switch (item.mode) {
                case 'upload':
                    fs.lstat(item.path, function (err, stats) {
                        var path = item.path;

                        if (stats.isSymbolicLink()) {
                            path = fs.readFileSync(item.path).toString();
                        }

                        ftpClient.put(path, getRemotePath(item.path), function (err) {
                            return (err) ? reject(err) : resolve();
                        });
                    })

                    return;

                case 'delete':
                    return ftpClient.delete(getRemotePath(item.path), function (err, files) {
                        return (err) ? reject(err) : resolve();
                    });
                case 'mkdir':
                    return ftpClient.mkdir(getRemotePath(item.path), true, function (err, files) {
                        return (err) ? reject(err) : resolve();
                    });
                case 'rmdir':
                    return ftpClient.rmdir(getRemotePath(item.path), true, function (err, files) {
                        return (err) ? reject(err) : resolve();
                    });
                default:
                    return reject(new Error('Invalid job mode "' + item.mode + '"'));
            }
        });
    };

    return new Promise(function (resolve, reject) {
        var processNext,
            doneItens = [];

        processNext = function () {
            var item = _queue.next();

            if (item === false) {
                console.log(ui.drawBoxEdges('').green);
                return resolve(doneItens);
            }

            doItemJob(item).then(function () {
                doneItens.push(item);
                processNext();
            }).catch(reject);
        };

        processNext();
    });
}

var connectRemoteServer = function () {
    return new Promise(function (resolve, reject) {
        ftpClient.on('ready', resolve);
        ftpClient.on('error', reject);
        ftpClient.connect(envOpts);
    });
}

var disconnectRemoteServer = function () {
    ftpClient.end();
    return Promise.resolve();
}

var getDiff = function (initialCommit) {
    return new Promise(function (resolve, reject) {
        if (initialCommit === null) {
            getRevTree()
                .then(function (list) {
                    resolve(list.map((line) => 'A\t' + line)
                        .join('\n'));
                })
                .catch(reject);
        } else {
            getGitDiff(initialCommit, 'HEAD')
                .then(resolve)
                .catch(reject);
        }
    });
}


var getGitDiff = function (start, end) {
    return new Promise(function (resolve, reject) {
        var args = ['diff', '--name-status', start , end],
            spawn = require('child_process').spawn,
            diff = spawn('git', args),
            buffer = '';

        diff.stdout.on('data', (data) => {
            buffer += data;
        });

        diff.stderr.on('data', (data) => {
            reject(data);
        });

        diff.on('close', (code) => {
            if (code === 0) {
                resolve(buffer);
            } else {
                reject(new Error('Error when try to get commits diff'));
            }
        });
    });
}

var getRevTree = function () {
    return new Promise(function (resolve, reject) {
        var args = 'ls-tree -r HEAD --name-only',
            spawn = require('child_process').spawn,
            diff = spawn('git', args.split(' ')),
            buffer = '';

        diff.stdout.on('data', (data) => {
            buffer += data;
        });

        diff.stderr.on('data', (data) => {
            reject(data);
        });

        diff.on('close', (code) => {
            if (code === 0) {
                resolve(buffer.split('\n').filter((line) => line.trim().length > 0 ));
            } else {
                reject(new Error('Error when try to get rev tree'));
            }
        });
    });
}

var validateEnvOpts = function () {
    var enviroment;

    if (!envOpts) {
        enviroment = getCurrentEnviroment();
        console.log(ui.drawBoxEdges('> Invalid enviroment "' + enviroment + '"!', 'red'));
        console.log(ui.createFullWidthLine(false, 'bottom').green);
        process.exit(0);
    }
}

exports.deploy = function () {
    try {
        getConfig();
    } catch (err) {
        console.log(ui.drawBoxEdges(err.message, 'red'));
        console.log(ui.createFullWidthLine(false, 'bottom').green);
        process.exit(1);
    }

    connectRemoteServer()
        .then(getFirstCommit)
        .then(getDiff)
        .then(diffParser)
        .then(parseQueue)
        .then(function (queue) {
            if (queue.length > 0) {
                var count = queue.filter((cur) => cur.mode === 'upload' || cur.mode === 'delete').length;
                return Promise.resolve(queue);
            } else {
                process.exit(0);
            }
        })
        .then(processQueue)
        .then(getCurrentCommit)
        .then(writeLastRemoteCommit)
        .then(disconnectRemoteServer)
        .then(function () {
            process.exit(0);
        })
        .catch(function (err) {
            process.exit(1);
        });
};

exports.resetCommit = function () {
    getConfig();

    connectRemoteServer()
        .then(function () {
            return new Promise(function (resolve, reject) {
                writeLastRemoteCommit(null)
                    .then(resolve)
                    .catch(reject);
            });
        })
        .then(disconnectRemoteServer)
        .then(function () {
            console.log(ui.createFullWidthLine(false, 'bottom').green);
            process.exit(0);
        })
        .catch(function (err) {
            process.exit(1);
        });
}

var writeLastRemoteCommit = function (forceHash) {
    return new Promise(function (resolve, reject) {
        var file = tmp.fileSync(),
            commitHash;

        ((forceHash || forceHash === null) ? Promise.resolve(forceHash) : getCurrentCommit())
            .then(function (hash) {
                commitHash = hash || '';
                fs.writeFileSync(file.name, commitHash);
                return Promise.resolve(file.name);
            })
            .then(function (filepath) {
                ftpClient.put(filepath, getRemotePath(REMOTE_LAST_COMMIT_FILE), function (err) {
                    if (err) throw err;

                    file.removeCallback();
                    console.log(ui.drawBoxEdges('> Last commit updated to: "' + commitHash + '"'));
                    resolve();
                });
            })
            .catch(function (err) {
                file.removeCallback();
                reject(err);
            });
    });
}
