// 服务器配置
const path = require('path');

const config = {
    // 服务器配置
    server: {
        port: process.env.PORT || 3000,
        host: process.env.HOST || '0.0.0.0', // 允许所有IP访问，支持局域网连接
        publicPath: path.join(__dirname, '..', 'public')
    },

    // 中间件配置
    middleware: {
        jsonLimit: '50mb',
        cors: {
            origin: '*',
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            headers: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization']
        }
    },

    // WebSocket 配置
    websocket: {
        heartbeatInterval: 30000, // 30秒心跳检测
        clientTimeout: 1000 // 客户端关闭超时
    },

    // Git 配置
    git: {
        fetchOptions: ['--all', '--prune'],
        defaultFiles: '.'
    },

    // 日志配置
    logging: {
        enabled: true,
        level: process.env.LOG_LEVEL || 'info'
    }
};

module.exports = config;
