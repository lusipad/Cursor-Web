// Cursor Web 服务器 - 重构版本
const express = require('express');
const { createServer } = require('http');

// 导入模块 - 使用 Node 直连SQLite的真实数据版本
console.log('🔄 使用 NodeJS 直连SQLite的数据提取逻辑');
const ChatManager = require('./services/chatManager-fallback');
const CursorHistoryManager = require('./services/cursorHistoryManager-real');

const WebSocketManager = require('./services/websocketManager');
const ContentRoutes = require('./routes/contentRoutes');
const GitRoutes = require('./routes/gitRoutes');
const HistoryRoutes = require('./routes/historyRoutes');
const AppMiddleware = require('./middleware/appMiddleware');
const { setupProcessHandlers, printServerInfo } = require('./utils/serverUtils');
const config = require('./config/serverConfig');

// 创建 Express 应用
const app = express();
const server = createServer(app);

// 初始化管理器
const chatManager = new ChatManager();
const cursorHistoryManager = new CursorHistoryManager();
const websocketManager = new WebSocketManager(server, chatManager, cursorHistoryManager);

// 设置中间件
new AppMiddleware(app);

// 设置路由
const contentRoutes = new ContentRoutes(chatManager, websocketManager, cursorHistoryManager);
const gitRoutes = new GitRoutes();
const historyRoutes = new HistoryRoutes(cursorHistoryManager);

// 注册 API 路由
app.use('/api', contentRoutes.getRouter());
app.use('/api', gitRoutes.getRouter());
app.use('/api', historyRoutes.getRouter());

// 设置进程信号处理
setupProcessHandlers(server, websocketManager);

// 启动服务器
server.listen(config.server.port, config.server.host, () => {
    printServerInfo(config.server.port);
});
