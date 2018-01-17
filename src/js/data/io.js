const fs = require('fs');
const os = require('os');
const path = require('path');
const md5 = require('md5');
const CONFIG_FILE = path.join(os.homedir(), '.ftployin');

class IO {
    static write (path, content) {
        return fs.writeFileSync(path, JSON.stringify(content, null, 2));
    }

    static read (path) {
        const file = fs.readFileSync(path).toString();
        return JSON.parse(file);
    }

    static createConfigFile () {
        if (!fs.existsSync(CONFIG_FILE)) {
            this.write(CONFIG_FILE, {
                projects: []
            })
        }
    }

    static getConfigFile () {
        this.createConfigFile();
        return this.read(CONFIG_FILE);
    }

    static updateConfigFile(data) {
        this.createConfigFile();
        return this.write(CONFIG_FILE, data);
    }

    static addNewProject (path) {
        const id = md5(path + (new Date()).getTime());
        const name = path.split('/').pop();
        const configs = this.getConfigFile();
        
        configs.projects.push({
            id,
            name,
            path,
            envs: this.importLegacyEnvs(path)
        });

        this.updateConfigFile(configs);
    }

    static importLegacyEnvs (projectPath) {
        const legacyFile = path.join(projectPath, 'deploy.json');

        if (fs.existsSync(legacyFile)) {
            const data = this.read(legacyFile).envs;
            const output = [];

            for (let key in data) {
                if (data.hasOwnProperty(key)) {
                    const env = data[key];
                    env.name = key;
                    env.id = md5(key + (new Date()).getTime());
                    output.push(env);
                }
            }

            return output;
        } else {
            return [];
        }
    }

    static updateProject (projectId, data) {
        const configs = this.getConfigFile();

        for (let x = 0; x < len; x += 1) {
            const project = configs.projects[x];

            if (project.id === projectId) {
                for (let key in data) {
                    if (data.hasOwnProperty(key)) {
                        configs.projects[x][key] = data[key];
                    }
                }
            }
        }

        this.updateConfigFile(configs);
    }

    static deleteProject (projectId) {
        const configs = this.getConfigFile();
        configs.projects = configs.projects.filter((p) => p.id !== projectId);
        this.updateConfigFile(configs);
    }

    static newEnviroment (projectId, data) {
        const configs = this.getConfigFile();
        const id = md5(data.name + (new Date()).getTime());
        const len = configs.projects.length;
        const env = data;

        env.id = id;

        for (let x = 0; x < len; x += 1) {
            const project = configs.projects[x];

            if (project.id === projectId) {
                configs.projects[x].envs.push(env);
                break;
            }
        }

        this.updateConfigFile(configs);
    }

    static updateEnviroment(envId, data) {
        const configs = this.getConfigFile();
        const len = configs.projects.length;
        let found = false;

        for (let x = 0; x < len; x += 1) {
            const project = configs.projects[x];
            const plen = project.envs.length;

            for (let i = 0; i < plen; i += 1) {
                const env = project.envs[i];

                if (env.id === envId) {
                    configs.projects[x].envs[i] = data;
                    found = true;
                    break;
                }
            }

            if (found) {
                break;
            }
        }

        this.updateConfigFile(configs);
    }

    static deleteEnviroment(envId) {
        const configs = this.getConfigFile();
        const len = configs.projects.length;
        let found = false;

        for (let x = 0; x < len; x += 1) {
            const project = configs.projects[x];
            const plen = project.envs.length;

            for (let i = 0; i < plen; i += 1) {
                const env = project.envs[i];

                if (env.id === envId) {
                    const prevLen = project.envs.length;

                    configs.projects[x].envs = project.envs.filter((e) => {
                        return e.id !== envId;
                    });

                    if (configs.projects[x].envs.length !== prevLen) {
                        found = true;
                        break;
                    }
                }
            }

            if (found) {
                break;
            }
        }

        this.updateConfigFile(configs);
    }

    static setCurrentProject (projectId) {
        const configs = this.getConfigFile();
        const len = configs.projects.length;

        for (let x = 0; x < len; x += 1) {
            const project = configs.projects[x];
            configs.projects[x].selected = (project.id === projectId);
        }

        this.updateConfigFile(configs);
    }

    static getCurrentProject() {
        const configs = this.getConfigFile();
        const len = configs.projects.length;

        for (let x = 0; x < len; x += 1) {
            const project = configs.projects[x];

            if (project.selected) {
                return project;
            }
        }

        this.updateConfigFile(configs);
    }

    static getProjects () {
        return this.getConfigFile().projects;
    }

    static isAGitRepository (dir) {
        return fs.existsSync(path.join(dir, '.git'));
    }
}

module.exports = IO;