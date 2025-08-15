// Cursor Web 服务器 - 重构版本
const express = require('express');
const { createServer } = require('http');
const fs = require('fs');

// 导入模块 - 使用 Node 直连SQLite的真实数据版本
console.log('🔄 使用 NodeJS 直连SQLite的数据提取逻辑');
const ChatManager = require('./services/chatManager-fallback');
const CursorHistoryManager = require('./services/cursorHistoryManager-real');

const WebSocketManager = require('./services/websocketManager');
const ContentRoutes = require('./routes/contentRoutes');
const GitRoutes = require('./routes/gitRoutes');
const HistoryRoutes = require('./routes/historyRoutes');
const InstancesRoutes = require('./routes/instancesRoutes');
const InjectRoutes = require('./routes/injectRoutes');
const DocsRoutes = require('./routes/docsRoutes');
const AppMiddleware = require('./middleware/appMiddleware');
const { setupProcessHandlers, printServerInfo } = require('./utils/serverUtils');
const config = require('./config/serverConfig');

// 按用户要求：不再在启动时覆盖 Cursor 根目录，始终让历史管理器自动探测系统默认路径
// 如需手动覆盖，仅支持通过显式设置环境变量 CURSOR_STORAGE_PATH 或配置 cursor.storagePath（不再使用 debug.testCursorPath）
(() => {
    try {
        const envPath = process.env.CURSOR_STORAGE_PATH || null;
        const cfgPath = config?.cursor?.storagePath || null;
        if (envPath) {
            console.log(`🔧 使用环境变量 CURSOR_STORAGE_PATH = ${envPath}`);
        } else if (cfgPath) {
            process.env.CURSOR_STORAGE_PATH = cfgPath;
            console.log(`🔧 使用配置 cursor.storagePath = ${cfgPath}`);
        } else {
            console.log('🧭 历史根目录采用系统默认路径（不覆盖）');
        }
    } catch (e) {
        console.log('⚠️ 预设 Cursor 根目录失败：', e.message);
    }
})();

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
const instancesRoutes = new InstancesRoutes();
const injectRoutes = new InjectRoutes(websocketManager);
const docsRoutes = new DocsRoutes();

// 注册 API 路由
app.use('/api', contentRoutes.getRouter());
app.use('/api', gitRoutes.getRouter());
app.use('/api', historyRoutes.getRouter());
app.use('/api', injectRoutes.getRouter());
app.use('/api', instancesRoutes.getRouter());
app.use('/docs', docsRoutes.getRouter());

// 设置进程信号处理
setupProcessHandlers(server, websocketManager);

// 启动服务器
server.listen(config.server.port, config.server.host, () => {
    printServerInfo(config.server.port);
    // 启动后自动拉起默认实例 + 注入（可在 config.serverConfig.startup 配置开关）
    try {
        const sc = require('./config/serverConfig');
        if (sc?.startup?.autoLaunchDefaultInstance) {
            setTimeout(async () => {
                try {
                    const http = require('http');
                    const instanceId = sc?.startup?.autoInjectInstanceId || 'default';
                    const payload = JSON.stringify({ instanceId, pollMs: 30000 });
                    const req = http.request({ hostname: '127.0.0.1', port: config.server.port, path: '/api/inject/launch', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } });
                    req.on('error', () => {});
                    req.write(payload); req.end();
                    console.log(`🚀 实例启动并注入请求已发送 (${instanceId})`);
                    // 补充：如需要仅扫描注入（而非启动），可开启 autoInjectOnBoot
                    if (sc?.startup?.autoInjectOnBoot === true) {
                        const scanPayload = JSON.stringify({ instanceId, startPort: 9222, endPort: 9250 });
                        const scanReq = http.request({ hostname: '127.0.0.1', port: config.server.port, path: '/api/inject/scan-inject', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(scanPayload) } });
                        scanReq.on('error', () => {});
                        setTimeout(()=>{ try{ scanReq.write(scanPayload); scanReq.end(); console.log('🔍 开机注入扫描已触发'); }catch{} }, 3000);
                    }
                } catch {}
            }, Math.max(0, Number(sc.startup.delayMs || 1200)));
        }
    } catch {}
});
