const REMOTE_LAST_COMMIT_FILE = '.ftployin-last-commit';
const MAX_BUFFER = 1024 * 1024;

const ftp = require('ftp');
const path = require('path');
const git = require('ggit');
const fs = require('fs');
const tmp = require('tmp');
const child = require('child_process');

const exec = function (command, cwd) {
    return new Promise((resolve, reject) => {
        const opts = { cwd, maxBuffer: MAX_BUFFER };

        child.exec(command, opts, (err, stdout, stderr) => {
            return (err)
                ? reject(stderr)
                : resolve(stdout);
        });
    });
}

const arr2iterator = function (array) {
    let nextIndex = 0;

    return {
        next: function () {
            return nextIndex < array.length ? array[nextIndex++] : false;
        }
    }
}

class Deploy {
    
    constructor (path, env) {
        this.path = path;
        this.env = env;
        this.connection = null;
    }

    connect () {
        return new Promise((resolve, reject) => {
            this.connection = new ftp();
            this.connection.on('ready', resolve);
            this.connection.on('error', reject);
            this.connection.connect({
                host: this.env.host,
                port: this.env.port,
                user: this.env.user,
                password: this.env.password
            });
        });
    }

    disconnect () {
        if (this.connection) {
            this.connection.end();
        }
    }

    getRemotePath (filepath) {
        return path.join((this.env.remoteDir || ''), filepath);
    }

    getRemoteCommitHash () {
        return new Promise((resolve, reject) => {
            const filepath = this.getRemotePath(REMOTE_LAST_COMMIT_FILE);

            this.connection.get(filepath, (err, file) => {
                if (err) {
                    return resolve(null);
                }

                let buffer = '';

                file.on('data', (chunk) => buffer += chunk);
                file.on('end', () => resolve(buffer.trim() || null));
            });
        });
    }

    getRepoFirstCommit () {
        return new Promise((resolve, reject) => {
            const command = 'git rev-list HEAD | tail -n 1';

            exec(command, this.path)
                .then(resolve)
                .catch(reject);
        });
    }

    getRepoCurrentCommit() {
        return new Promise((resolve, reject) => {
            const command = 'git rev-list HEAD | head -n 1';

            exec(command, this.path)
                .then(resolve)
                .catch(reject);
        });
    }

    getDiffParams () {
        const params = { from: null, to: null };

        return new Promise((resolve, reject) => {
            this.getRepoCurrentCommit()
                .then((currentCommit) => {
                    params.to = currentCommit.trim();
                    return this.getRemoteCommitHash();
                })
                .then((remoteLastCommit) => {
                    params.from = remoteLastCommit;
                    resolve(params);
                })
                .catch(reject);
        });
    }

    getDiff (from, to) {
        if (from === to) {
            return Promise.resolve([]);
        }

        if (from === null) {
            return new Promise((resolve, reject) => {
                const command = `git ls-tree -r HEAD --name-only`;

                exec(command, this.path)
                    .then(list => list.split('\n'))
                    .then(lines => lines.filter((line) => line))
                    .then(lines => lines.map((line) => ({ mode: 'A', path: line, selected: true })))
                    .then(lines => this.removeExcluded(lines))
                    .then(resolve)
                    .catch(reject);
            });
        } else {   
            return new Promise((resolve, reject) => {
                const command = `git diff --name-status ${from} ${to}`;
                
                exec(command, this.path)
                    .then(list => list.split('\n'))
                    .then(lines => lines.filter((line) => line))
                    .then(lines => lines.map((line) => line.split('\t')))
                    .then(lines => lines.map((line) => ({ mode: line[0], path: line[1], selected: true }) ))
                    .then(lines => this.removeExcluded(lines))
                    .then(resolve)
                    .catch(reject);
            });
        }
    }

    getExcludeRules () {
        const exclude = this.env.exclude || [];
        return exclude.map((rule) => new RegExp(rule));
    }

    removeExcluded (list) {
        const rules = this.getExcludeRules();

        return list.filter((line) => {
            const matchs = rules.filter((rule) => rule.test(line.path));
            return matchs.length === 0;
        });
    }

    dirExists (dir) {
        const dirpath = path.join(this.path, dir);
        return fs.existsSync(dirpath);
    }

    parseQueue (files) {
        return new Promise((resolve, reject) => {
            var queue = [],
                mkdirQueue = [],
                len = files.length,
                file,
                dir,
                x;

            for (x = 0; x < len; x += 1) {
                file = files[x];

                if (file.mode === 'A') {
                    dir = path.dirname(file.path);

                    if (dir !== null && mkdirQueue.indexOf(dir) === -1) {
                        mkdirQueue.push(dir);
                        queue.push({ mode: 'mkdir', path: dir });
                    }

                    queue.push({ mode: 'upload', path: file.path });
                } else if (file.mode === 'M') {
                    queue.push({ mode: 'upload', path: file.path });
                } else if (file.mode === 'D') {
                    dir = path.dirname(file.path);
                    queue.push({ mode: 'delete', path: file.path });

                    if (dir !== null && mkdirQueue.indexOf(dir) === -1 && !this.dirExists(dir)) {
                        mkdirQueue.push(dir);
                        queue.push({ mode: 'rmdir', path: dir });
                    }
                }
            }

            return resolve(queue);
        });
    }

    processQueue(preQueue, onDoneItem) {
        const queue = arr2iterator(preQueue);

        const doItemJob = (item) => {
            return new Promise((resolve, reject) => {
                const mode = item.mode;
                const localPath = path.join(this.path, item.path);
                const remotePath = this.getRemotePath(item.path);

                switch (mode) {
                    case 'upload':
                        return fs.lstat(localPath, (err, stats) => {
                            var content = localPath;

                            if (stats.isSymbolicLink()) {
                                content = fs.readFileSync(localPath).toString();
                            }

                            this.connection.put(content, remotePath, (err) => {
                                return (err) ? reject(err) : resolve();
                            });
                        });
                    case 'delete':
                        return this.connection.delete(remotePath, (err, files) => {
                            return (err) ? reject(err) : resolve();
                        });
                    case 'mkdir':
                        return this.connection.mkdir(remotePath, true, (err, files) => {
                            return (err) ? reject(err) : resolve();
                        });
                    case 'rmdir':
                        return this.connection.rmdir(remotePath, true, (err, files) => {
                            return (err) ? reject(err) : resolve();
                        });
                    default:
                        return reject(new Error('Invalid job mode "' + item.mode + '"'));
                }
            });
        };

        return new Promise((resolve, reject) => {
            const processNext = () => {
                var item = queue.next();

                if (item === false) {
                    return resolve();
                }

                doItemJob(item)
                    .then(() => {
                        onDoneItem && onDoneItem(item);
                        processNext();
                    })
                    .catch(reject);
            };

            processNext();
        });
    }

    updateLastRemoteCommit (hash) {
        return new Promise((resolve, reject) => {
            const file = tmp.fileSync();
            const filepath = file.name;
            const remote = this.getRemotePath(REMOTE_LAST_COMMIT_FILE);

            fs.writeFileSync(filepath, hash);

            this.connection.put(filepath, remote, function (err) {
                file.removeCallback();

                if (err) {
                    return reject(err);
                }

                resolve();
            });
        });
    }
}

module.exports = Deploy;