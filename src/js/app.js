const { dialog } = require('electron').remote;
const ViewModel = {data: {}, methods: {}, computed: {}};
const IO = require('./src/js/data/io.js');
const modal = require('electron-modal');

ViewModel.data.title = '[ftployin]';
ViewModel.data.projects = IO.getProjects();
ViewModel.data.currentProject = IO.getCurrentProject();
ViewModel.data.alert = false;
ViewModel.data.alertColor = 'gray';
ViewModel.data.alertDialog = '';
ViewModel.data.activeSearch = false;
ViewModel.data.search = '';

ViewModel.methods.addProject = function () {
    dialog.showOpenDialog({
        title: "Select a folder",
        properties: ["openDirectory"]
    }, (folderPaths) => {
        const folder = folderPaths[0];
        const project = this.currentProject;

        if (folder) {
            if (IO.isAGitRepository(folder)) {
                IO.addNewProject(folderPaths[0]);
                ViewModel.data.projects = IO.getProjects();
                this.callAlert('project added with success!', 'green');
            } else {
                this.callAlert('oops! the selected directory is not a git repository.', 'red');
            }
        }
    });
}

ViewModel.methods.addEnv = function () {
    const project = this.currentProject;

    this.showEnvForm('create').then((data) => {
        IO.newEnviroment(project.id, data);
        this.currentProject = IO.getCurrentProject();
    });
}

ViewModel.methods.editEnv = function (env) {
    const project = this.currentProject;

    this.showEnvForm('edit', env).then((data) => {
        IO.updateEnviroment(env.id, data);
        this.currentProject = IO.getCurrentProject();
    });
}

ViewModel.methods.deleteEnv = function (env) {
    const options = {
        message: `${this.currentProject.name} › ${env.name}`,
        detail: 'are you sure you want to delete this environment?',
        type: 'question',
        buttons: ['yes', 'no']
    }

    dialog.showMessageBox(options, (index) => {
        if (index === 0) {
            IO.deleteEnviroment(env.id);
            this.currentProject = IO.getCurrentProject();
        }
    });
}

ViewModel.methods.showEnvForm = function (action, model) {
    const title = action === 'create'
        ? 'create new enviroment'
        : 'edit enviroment';

    const formModel = model || {
        host: null,
        port: 21,
        user: null,
        password: null,
        remoteDir: null,
        exclude: ['node_modules', 'deploy.json']
    };

    return openEnvFormModal(title, action, formModel);
};

ViewModel.methods.selectProject = function (project) {
    IO.setCurrentProject(project.id);
    this.projects = IO.getProjects();
    this.currentProject = IO.getCurrentProject();
}

ViewModel.methods.removeProject = function (project) {
    const options = {
        message: `${this.currentProject.name}`,
        detail: 'are you sure you want to delete this project?',
        type: 'question',
        buttons: ['yes', 'no']
    }

    dialog.showMessageBox(options, (index) => {
        if (index === 0) {
            if (this.currentProject.id === project.id) {
                this.currentProject = null;
            }
            
            IO.deleteProject(project.id);
            this.projects = IO.getProjects();
            this.lengthProject = ViewModel.data.projects.length;
        }
    });
}

ViewModel.methods.callAlert = function (dialog, color) {
    this.alert = true;
    this.alertColor = color;
    this.alertDialog = dialog;
    let alert = this.$refs.boxAlert;

    alert.classList.add("active");

    setTimeout(function () {
        this.alert = false;
        alert.classList.remove("active");
    }, 3000);
}

function openEnvFormModal(title, action, model) {
    
    const path = require('path');
    const file = path.join(__dirname, 'env-form.html');
    const data = {
        action, title, form: model
    };

    const params = {
        width: 640,
        height: 480,
        backgroundColor: '#2a2d37',
        titleBarStyle: 'hiddenInset'
    };

    return new Promise((resolve, reject) => {
        modal.open(file, params, data).then((instance) => {
            instance.on(action, resolve);
        });
    });
}

ViewModel.methods.deploy = function (projectPath, env) {
    const path = require('path');
    const file = path.join(__dirname, 'deployment.html');
    const data = { projectPath, env, modal: () => modal };
    const params = {
        width: 720,
        height: 500,
        backgroundColor: '#2a2d37',
        titleBarStyle: 'hiddenInset'
    };

    modal.open(file, params, data).then((instance) => {
        instance.on('error', (err) => {
            dialog.showErrorBox('Oops!', err);
        });
    });
};

ViewModel.computed.searchList = function () {
    var self=this;
    return this.projects.filter(function(cust){return cust.name.toLowerCase().indexOf(self.search.toLowerCase())>=0;});
}

ViewModel.methods.removeSearch = function () {
    this.activeSearch = !this.activeSearch;
    this.search = '';
}

const App = new Vue({
    el: '#app',
    data: ViewModel.data,
    methods: ViewModel.methods,
    computed: ViewModel.computed
});
