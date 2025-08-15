const path = require('path');

module.exports = {
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0'
  },
  websocket: {
    heartbeatInterval: 30000,
    heartbeatTimeout: 30000,
    maxPayloadSize: '50mb'
  },
  git: {
    defaultPath: process.cwd(),
    fetchOptions: ['--all', '--prune']
  },
  instances: {
    enable: true,
    file: 'instances.json'
  },
  paths: {
    public: path.join(__dirname, '..', 'public'),
    static: path.join(__dirname, '..', 'public')
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    timestamp: true
  }
};
