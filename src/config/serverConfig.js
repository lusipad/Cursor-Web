const path = require('path');
const os = require('os');

module.exports = {
    server: {
        port: process.env.PORT || 3000,
        host: process.env.HOST || '0.0.0.0',
        publicPath: process.pkg 
            ? path.join(path.dirname(process.execPath), 'public')
            : path.join(__dirname, '..', '..', 'public')
    },
    
    websocket: {
        port: process.env.WS_PORT || 3000,
        pingInterval: 30000,
        pongTimeout: 5000
    },
    
    middleware: {
        jsonLimit: '50mb',
        cors: {
            origin: '*',
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            headers: ['Content-Type', 'Authorization', 'X-Requested-With']
        }
    },
    
    git: {
        maxCommits: 100,
        defaultBranch: 'main'
    },
    
    instances: {
        configFile: process.pkg 
            ? path.join(path.dirname(process.execPath), 'instances.json')
            : path.join(__dirname, '..', '..', 'instances.json'),
        defaultTimeout: 30000
    },
    
    paths: {
        public: process.pkg 
            ? path.join(path.dirname(process.execPath), 'public')
            : path.join(__dirname, '..', '..', 'public'),
        docs: process.pkg 
            ? path.join(path.dirname(process.execPath), 'docs')
            : path.join(__dirname, '..', '..', 'docs'),
        logs: process.pkg 
            ? path.join(path.dirname(process.execPath), 'logs')
            : path.join(__dirname, '..', '..', 'logs'),
        cursorStorage: process.platform === 'win32' 
            ? path.join(os.homedir(), 'AppData/Roaming/Cursor')
            : path.join(os.homedir(), '.cursor')
    },
    
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        file: process.env.LOG_FILE || null
    },
    
    startup: {
        autoLaunchDefaultInstance: false
    }
};
