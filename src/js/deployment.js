const path = require('path');
const modal = require('electron-modal');
const Deploy = require(path.join(__dirname, 'src/js/data/deploy.js'));
const methods = {};
const computed = {};

const dd = function (obj) {
    if (obj instanceof Error) {
        obj = {
            message: obj.message,
            stack: obj.stack
        }
    } 
    console.log(JSON.stringify(obj, null, 2));
}

methods.writeLog = function (log) {
    this.log = this.log + log + '\n';
};

methods.processDeploy = function () {
    const files = this.files.filter(f => f.selected);
    const onProgress = (item) => this.onProgress(item);

    this.deploy.parseQueue(files)
        .then((queue) => {
            this.showFiles = false;
            this.showLogBox = true;
            this.deploying = true;
            this.progress.total = queue.length;
            
            return this.deploy.processQueue(queue, onProgress);
        })
        .then(() => {
            this.writeLog('');
            this.writeLog('uploading virtual files...');
            return this.deploy.uploadVirtualFiles();
        })
        .then(() => {
            this.writeLog('updating remote log files...');
            return this.deploy.writeRemoteLog(this.diff, 'DONE');
        })
        .then(() => {
            this.onDoneDeploy();
        })
        .catch((err) => {
            this.onError(err);
        })
};

methods.onProgress = function (item) {
    this.progress.cur = this.progress.cur + 1;
    const progress = (100 / this.progress.total * this.progress.cur);

    this.writeLog(`[${item.mode}] ${item.path}`);
    this.feedback = `progress ${Math.round(progress)}%`
}

methods.onDoneDeploy = function () {
    this.writeLog('updating remote config file...');
    this.deploy.updateLastRemoteCommit(this.diff.to)
        .then(() => {
            this.feedback = null;
            this.done = true;
            this.deploy.disconnect();
            this.writeLog('');
            this.writeLog('disconnecting...');
            this.writeLog('');
            this.writeLog('DONE!');
        })
};

methods.onError = function (error) {
    this.deploy.writeRemoteLog(this.diff, 'FAIL')
        .then(() => {
            this.writeLog('\n(!) deployment failed.');
            this.writeLog(error.message || error);
            this.done = true;
            this.feedback = null;
        });
}

methods.changeDiff = function () {
    const modal = require('electron-modal');
    const path = require('path');
    const file = path.join(__dirname, 'edit-diff.html');
    const data = {
        cwd: this.projectPath,
        from: this.diff.from,
        to: this.diff.to
    };

    const params = {
        width: 600,
        height: 220,
        backgroundColor: '#2a2d37',
        titleBarStyle: 'hiddenInset'
    };

    modal.open(file, params, data).then((instance) => {
        instance.on('error', (err) => this.onError(err));
        
        instance.on('save', (diff) => {
            this.diff = diff;
            this.loaded = false;
            this.files = [];
            this.diff.edited = true;

            this.deploy.getDiff(diff.from, diff.to)
                .then((list) => {
                    this.files = list;
                    this.loaded = true;
                });
        });
    });
}

modal.getData().then((data) => {
    data.log = '';
    data.showFiles = true;
    data.showLogBox = false;
    data.vueLoaded = true;
    data.feedback = null;
    data.progress = {cur: 0, total: 0};
    data.title = `deploy  ̶ ${data.env.name}`;
    data.deploying = false;
    data.files = [];
    data.connected = false;
    data.updatingRemoteFile = false;
    data.loaded = false;
    data.done = false;
    data.diff = {
        from: null,
        to: null
    }
    
    data.deploy = new Deploy(data.projectPath, data.env);
    data.feedback = 'connecting with ftp server...';


    data.deploy.connect()
        .then(() => {
            data.feedback = 'connected';
            data.connected = true;
            return data.deploy.getDiffParams();
        })
        .then(diff => {
            data.feedback = null;
            data.diff = diff;
            return data.deploy.getDiff(diff.from, diff.to);
        })
        .then(list => {
            data.files = list;
            data.loaded = true;
        })
        .catch(err => {
            modal.emit('error', err.message || err);
            modal.close();
        });


    const app = new Vue({ el: '#modal', data, methods, computed });
});