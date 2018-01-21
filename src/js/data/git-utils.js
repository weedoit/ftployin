const MAX_BUFFER = 1024 * 1024;
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

module.exports = class GitUtils {
    static getAllCommitsList (cwd) {
        const command = 'git log --format="%cd %h %H %s" --date=format:"%Y-%m-%d %H:%M:%S"';

        return new Promise((resolve, reject) => {
            exec(command, cwd)
                .then(stdout => stdout.split('\n'))
                .then(lines => lines.filter(l => l))
                .then(lines => lines.map(line => {
                    const rgx = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) ([a-z0-9]*) ([a-z0-9]*) (.*)/;
                    const params = line.match(rgx);

                    return {
                        date: params[1],
                        shortHash: params[2],
                        hash: params[3],
                        title: params[4]
                    }
                }))
                .then(resolve)
                .catch(reject);
        });
    }
};