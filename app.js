// 🚀 Cursor Remote Control v2.0 - 简化版服务器
const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');

// 配置
const CONFIG = {
    host: '0.0.0.0',
    httpPort: 3459,
    wsPort: 3460,
    timeout: 90000
};

// 获取本机IP
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const interface of interfaces[name]) {
            if (interface.family === 'IPv4' && !interface.internal) {
                return interface.address;
            }
        }
    }
    return 'localhost';
}

class CursorRemoteServer {
    constructor() {
        this.app = express();
        this.wss = null;
        this.httpServer = null;
        this.cursorClient = null;
        this.webClients = new Set();
        this.pendingRequests = new Map();
        this.workspacePath = process.cwd();
    }

    init() {
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
        this.setupErrorHandling();
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.static('public'));
        
        // 请求日志
        this.app.use((req, res, next) => {
            console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
            next();
        });
    }

    setupRoutes() {
        // 健康检查
        this.app.get('/health', (req, res) => {
            const localIP = getLocalIP();
            res.json({
                status: 'ok',
                httpPort: CONFIG.httpPort,
                wsPort: CONFIG.wsPort,
                cursorConnected: this.isCursorConnected(),
                workspace: this.workspacePath,
                localIp: localIP,
                localUrl: `http://${localIP}:${CONFIG.httpPort}`,
                wsUrl: `ws://${localIP}:${CONFIG.wsPort}`
            });
        });

        // 注入脚本
        this.app.get('/inject-script.js', (req, res) => {
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Access-Control-Allow-Origin', '*');
            
            try {
                let script = fs.readFileSync('inject.js', 'utf8');
                const wsHost = req.headers.host ? req.headers.host.split(':')[0] : 'localhost';
                script = script.replace(/ws:\/\/localhost:3460/g, `ws://${wsHost}:${CONFIG.wsPort}`);
                res.send(script);
            } catch (error) {
                console.error('读取注入脚本失败:', error);
                res.status(500).send('// 脚本加载失败');
            }
        });

        // 工作空间设置
        this.app.post('/api/workspace', (req, res) => {
            const { path } = req.body;
            if (!path || !fs.existsSync(path)) {
                return res.status(400).json({ error: '路径不存在' });
            }
            this.workspacePath = path;
            res.json({ success: true, workspace: this.workspacePath });
        });

        // Git 分支管理
        this.app.get('/api/git/branches', (req, res) => {
            exec('git branch -a', { cwd: this.workspacePath }, (error, stdout) => {
                if (error) {
                    return res.status(500).json({ success: false, error: error.message });
                }
                
                const branches = stdout.split('\n')
                    .filter(branch => branch.trim())
                    .map(branch => {
                        const name = branch.trim().replace(/^\* /, '');
                        const isCurrent = branch.startsWith('*');
                        const isRemote = name.startsWith('remotes/');
                        return { name, isCurrent, isRemote };
                    });
                
                res.json({ success: true, branches });
            });
        });

        this.app.post('/api/git/checkout', (req, res) => {
            const { branch } = req.body;
            if (!branch) {
                return res.status(400).json({ error: '需要提供分支名称' });
            }
            
            exec(`git checkout ${branch}`, { cwd: this.workspacePath }, (error, stdout, stderr) => {
                if (error) {
                    return res.status(500).json({ 
                        success: false, 
                        error: `切换分支失败：${error.message}` 
                    });
                }
                res.json({ success: true, message: `成功切换到分支：${branch}` });
            });
        });

        // AI 对话
        this.app.post('/api/ai/chat', async (req, res) => {
            const { message, context } = req.body;
            if (!message) {
                return res.status(400).json({ error: '需要提供消息内容' });
            }

            try {
                const response = await this.sendToCursor({
                    type: 'ai_chat',
                    data: { message, context }
                });
                res.json({ success: true, response: response.data });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
    }

    setupWebSocket() {
        this.wss = new WebSocket.Server({ port: CONFIG.wsPort, host: CONFIG.host });
        
        this.wss.on('connection', (ws, req) => {
            const url = new URL(req.url, `http://${req.headers.host}`);
            const clientType = url.searchParams.get('type');
            
            if (clientType === 'web') {
                this.handleWebClient(ws);
            } else {
                this.handleCursorClient(ws);
            }
        });
        
        console.log(`WebSocket服务器启动在端口 ${CONFIG.wsPort}`);
    }

    handleWebClient(ws) {
        console.log('网页客户端已连接');
        this.webClients.add(ws);
        
        ws.on('close', () => {
            console.log('网页客户端断开连接');
            this.webClients.delete(ws);
        });
        
        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                if (data.type === 'ping') {
                    ws.send(JSON.stringify({ type: 'pong' }));
                } else if (data.type === 'send_to_cursor') {
                    // 转发消息到Cursor
                    this.forwardToCursor(data);
                }
            } catch (error) {
                console.error('处理网页客户端消息错误：', error);
            }
        });
    }

    handleCursorClient(ws) {
        console.log('Cursor 客户端已连接');
        this.cursorClient = ws;
        
        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                console.log('收到 Cursor 消息：', data.type);
                
                // 处理响应
                if (data.requestId && this.pendingRequests.has(data.requestId)) {
                    const { resolve } = this.pendingRequests.get(data.requestId);
                    this.pendingRequests.delete(data.requestId);
                    resolve(data);
                }
                
                // 转发AI回复给网页客户端
                if (data.type === 'ai_response') {
                    this.broadcastToWebClients(data);
                }
                
                // 转发Cursor同步消息给网页客户端
                if (data.type === 'cursor_message') {
                    console.log('📨 收到Cursor消息:', data.data.type, data.data.content.substring(0, 50) + '...');
                    this.broadcastToWebClients({
                        type: 'cursor_sync',
                        data: data.data
                    });
                }
            } catch (error) {
                console.error('处理 Cursor 消息错误：', error);
            }
        });
        
        ws.on('close', () => {
            console.log('Cursor 客户端断开连接');
            if (this.cursorClient === ws) {
                this.cursorClient = null;
            }
        });
        
        // 心跳检测
        const pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ping' }));
            } else {
                clearInterval(pingInterval);
            }
        }, 30000);
    }

    broadcastToWebClients(data) {
        this.webClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.send(JSON.stringify(data));
                } catch (error) {
                    console.error('发送消息给网页客户端失败：', error);
                    this.webClients.delete(client);
                }
            }
        });
    }

    forwardToCursor(data) {
        if (this.isCursorConnected()) {
            try {
                console.log('📤 转发消息到Cursor:', data.data.message.substring(0, 50) + '...');
                this.cursorClient.send(JSON.stringify({
                    type: 'web_message',
                    data: data.data
                }));
            } catch (error) {
                console.error('转发消息到Cursor失败：', error);
            }
        } else {
            console.warn('Cursor未连接，无法转发消息');
        }
    }

    sendToCursor(message) {
        return new Promise((resolve, reject) => {
            if (!this.isCursorConnected()) {
                reject(new Error('Cursor 未连接'));
                return;
            }
            
            const requestId = Math.random().toString(36).substring(7);
            message.requestId = requestId;
            
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error('请求超时'));
            }, CONFIG.timeout);
            
            this.pendingRequests.set(requestId, {
                resolve: (data) => {
                    clearTimeout(timeout);
                    resolve(data);
                }
            });
            
            this.cursorClient.send(JSON.stringify(message));
        });
    }

    isCursorConnected() {
        return this.cursorClient && this.cursorClient.readyState === WebSocket.OPEN;
    }

    setupErrorHandling() {
        this.app.use((error, req, res, next) => {
            console.error('服务器错误:', error);
            res.status(500).json({ error: '服务器内部错误' });
        });
        
        process.on('SIGINT', () => {
            console.log('\n正在关闭服务器...');
            this.close();
            process.exit(0);
        });
    }

    start() {
        return new Promise((resolve, reject) => {
            this.httpServer = this.app.listen(CONFIG.httpPort, CONFIG.host, () => {
                const localIP = getLocalIP();
                console.log(`
╔════════════════════════════════════════╗
║     Cursor Remote Control v2.0         ║
╠════════════════════════════════════════╣
║ 本机访问：http://localhost:${CONFIG.httpPort}        ║
║ 远程访问：http://${localIP}:${CONFIG.httpPort}    ║
║ WebSocket 端口：${CONFIG.wsPort}                 ║
╠════════════════════════════════════════╣
║ 🚀 服务器启动完成！                    ║
╚════════════════════════════════════════╝
                `);
                resolve();
            });
            
            this.httpServer.on('error', reject);
        });
    }

    close() {
        if (this.httpServer) {
            this.httpServer.close();
        }
        if (this.wss) {
            this.wss.close();
        }
        this.pendingRequests.clear();
    }
}

// 启动服务器
async function main() {
    const server = new CursorRemoteServer();
    
    try {
        server.init();
        await server.start();
    } catch (error) {
        console.error('启动失败:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = CursorRemoteServer; 