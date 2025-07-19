const path = require('path');

module.exports = {
    // 服务器配置
    server: {
        port: process.env.PORT || 3000,
        host: process.env.HOST || '0.0.0.0',
        cors: {
            origin: '*',
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            headers: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization']
        }
    },

    // WebSocket配置
    websocket: {
        heartbeatInterval: 30000, // 30秒心跳检测
        heartbeatTimeout: 30000,  // 30秒心跳超时
        maxPayloadSize: '50mb'
    },

    // Git配置
    git: {
        defaultPath: process.cwd(),
        fetchOptions: ['--all', '--prune']
    },

    // 路径配置
    paths: {
        public: path.join(__dirname, '..', 'public'),
        static: path.join(__dirname, '..', 'public')
    },

    // 日志配置
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        timestamp: true
    }
};
