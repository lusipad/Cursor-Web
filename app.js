const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const config = require('./config');

// 导入服务和中间件
const AppMiddleware = require('./middleware/appMiddleware');
const corsMiddleware = require('./middleware/cors');
const ChatManager = require('./services/chatManager');
const WebSocketManager = require('./services/websocketManager');
const HistoryService = require('./services/historyService');

// 导入路由
const contentRoutes = require('./routes/contentRoutes');
const historyRoutes = require('./routes/historyRoutes');
const gitRoutes = require('./routes/gitRoutes');

class CursorWebApp {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.initializeServices();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
    }

    initializeServices() {
        this.chatManager = new ChatManager();
        this.historyService = new HistoryService();
        this.gitService = require('./services/gitService'); // GitService是单例
        this.websocketManager = new WebSocketManager(this.server, this.chatManager);
    }

    setupMiddleware() {
        // CORS中间件
        this.app.use(corsMiddleware);
        
        // 应用中间件
        new AppMiddleware(this.app);
    }

    setupRoutes() {
        // API路由
        const contentRoutesInstance = new contentRoutes(this.chatManager, this.websocketManager);
        this.app.use('/api', contentRoutesInstance.getRouter());
        
        const historyRoutesInstance = new historyRoutes();
        this.app.use('/api', historyRoutesInstance.getRouter());
        
        const gitRoutesInstance = new gitRoutes();
        this.app.use('/api', gitRoutesInstance.getRouter());
        
        // 静态文件服务
        this.app.use(express.static(config.paths.public));
        
        // 主页路由 - 直接显示历史记录页面
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(config.paths.public, 'standalone-history.html'));
        });
        
        // 原始主页路由
        this.app.get('/main', (req, res) => {
            res.sendFile(path.join(config.paths.public, 'index.html'));
        });
        
        // 会话列表页面
        this.app.get('/sessions', (req, res) => {
            res.sendFile(path.join(config.paths.public, 'sessions-list.html'));
        });
    }

    setupWebSocket() {
        // WebSocketManager已在构造函数中初始化，无需调用initialize方法
    }

    start() {
        this.server.listen(config.server.port, config.server.host, () => {
            console.log(`🚀 Cursor Web服务器已启动`);
            console.log(`📍 本地访问: http://localhost:${config.server.port}`);
            console.log(`🌐 网络访问: http://${config.server.host}:${config.server.port}`);
            console.log(`📁 静态文件目录: ${config.paths.public}`);
        });

        // 优雅关闭
        process.on('SIGTERM', this.gracefulShutdown.bind(this));
        process.on('SIGINT', this.gracefulShutdown.bind(this));
    }

    gracefulShutdown() {
        console.log('\n🔄 正在关闭服务器...');
        this.server.close(() => {
            console.log('✅ 服务器已关闭');
            process.exit(0);
        });
    }
}

// 启动应用
if (require.main === module) {
    const app = new CursorWebApp();
    app.start();
}

module.exports = CursorWebApp;
