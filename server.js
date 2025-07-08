// 🚀 Claude Web 统一服务器
// 基于 simple-server.js 和 cursor-clean.js 的重构版本

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 全局状态
let currentContent = '';
let connectedClients = new Set();

// 中间件配置
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// CORS 支持
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
    }
    next();
});

// =============================================================================
// HTTP API 路由
// =============================================================================

// 主页
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 健康检查
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        url: `http://localhost:3000`,
        hasContent: !!currentContent,
        connectedClients: connectedClients.size,
        timestamp: Date.now()
    });
});

// 测试连接
app.get('/api/test', (req, res) => {
    console.log('📞 收到测试请求');
    res.json({
        success: true,
        message: 'Claude Web 服务器运行正常',
        timestamp: Date.now()
    });
});

// 接收内容
app.post('/api/content', (req, res) => {
    try {
        const { type, data } = req.body;

        if (type === 'html_content' && data && data.html) {
            currentContent = data.html;
            console.log(`📥 收到内容：${currentContent.length} 字符`);

            // 广播给所有 WebSocket 客户端
            broadcastToClients({
                type: 'html_content',
                data: data
            });

            res.json({
                success: true,
                message: '内容已更新',
                contentLength: currentContent.length,
                timestamp: Date.now()
            });
        } else {
            res.status(400).json({
                success: false,
                message: '无效的请求格式'
            });
        }
    } catch (error) {
        console.error('❌ 处理内容失败：', error);
        res.status(500).json({
            success: false,
            message: '服务器错误'
        });
    }
});

// 获取当前内容
app.get('/api/content', (req, res) => {
    res.json({
        success: true,
        data: {
            html: currentContent,
            timestamp: Date.now(),
            hasContent: !!currentContent
        }
    });
});

// 服务器状态
app.get('/api/status', (req, res) => {
    res.json({
        status: 'running',
        hasContent: !!currentContent,
        contentLength: currentContent.length,
        connectedClients: connectedClients.size,
        uptime: process.uptime(),
        timestamp: Date.now()
    });
});

// =============================================================================
// WebSocket 处理
// =============================================================================

wss.on('connection', (ws, req) => {
    const clientIP = req.socket.remoteAddress;
    console.log(`📱 新 WebSocket 客户端连接：${clientIP}`);

    connectedClients.add(ws);

    // 发送当前内容（如果有）
    if (currentContent) {
        try {
            ws.send(JSON.stringify({
                type: 'html_content',
                data: {
                    html: currentContent,
                    timestamp: Date.now()
                }
            }));
        } catch (error) {
            console.error('❌ 发送当前内容失败：', error);
        }
    }

    // 处理消息
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());

            switch (message.type) {
                case 'html_content':
                    currentContent = message.data.html;
                    console.log(`📋 WebSocket 更新内容：${currentContent.length} 字符`);
                    broadcastToClients(message, ws);
                    break;

                case 'user_message':
                    console.log('💬 转发用户消息：', message.data);
                    broadcastToClients({
                        type: 'user_message',
                        data: message.data,
                        timestamp: Date.now()
                    }, ws);
                    break;

                case 'ping':
                    ws.send(JSON.stringify({
                        type: 'pong',
                        timestamp: Date.now()
                    }));
                    break;

                case 'clear_content':
                    currentContent = '';
                    console.log('🧹 清空内容');
                    broadcastToClients({ type: 'clear_content' });
                    break;

                default:
                    console.log('❓ 未知消息类型：', message.type);
            }
        } catch (error) {
            console.error('❌ WebSocket 消息处理错误：', error);
        }
    });

    // 连接关闭
    ws.on('close', (code) => {
        connectedClients.delete(ws);
        console.log(`📱 WebSocket 客户端断开：${clientIP} (${code})`);
    });

    // 错误处理
    ws.on('error', (error) => {
        console.error('❌ WebSocket 错误：', error);
        connectedClients.delete(ws);
    });
});

// 广播函数
function broadcastToClients(message, sender) {
    const messageStr = JSON.stringify(message);
    let broadcastCount = 0;

    connectedClients.forEach(client => {
        if (client !== sender && client.readyState === WebSocket.OPEN) {
            try {
                client.send(messageStr);
                broadcastCount++;
            } catch (error) {
                console.error('❌ 广播失败：', error);
                connectedClients.delete(client);
            }
        }
    });

    if (broadcastCount > 0) {
        console.log(`📢 消息已广播给 ${broadcastCount} 个客户端`);
    }
}

// 定期清理断开的连接
setInterval(() => {
    const activeClients = new Set();
    connectedClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            activeClients.add(client);
        }
    });

    if (connectedClients.size !== activeClients.size) {
        console.log(`🧹 清理断开连接：${connectedClients.size} -> ${activeClients.size}`);
        connectedClients = activeClients;
    }
}, 30000);

// =============================================================================
// 启动服务器
// =============================================================================

const PORT = 3000;
server.listen(PORT, () => {
    console.log('🚀 Claude Web 服务器已启动！');
    console.log(`📍 访问地址：http://localhost:${PORT}`);
    console.log(`🔌 WebSocket：ws://localhost:${PORT}`);
    console.log(`📡 API 端点：http://localhost:${PORT}/api/`);
    console.log('');
    console.log('💡 API 端点：');
    console.log('  - 测试连接：GET /api/test');
    console.log('  - 发送内容：POST /api/content');
    console.log('  - 获取内容：GET /api/content');
    console.log('  - 服务器状态：GET /api/status');
    console.log('');
    console.log('🎯 等待 Cursor 同步数据...');
});

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n🛑 正在关闭服务器...');

    // 通知所有客户端
    connectedClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(JSON.stringify({
                    type: 'server_shutdown',
                    message: '服务器正在关闭'
                }));
            } catch (error) {
                // 忽略错误
            }
        }
    });

    server.close(() => {
        console.log('✅ 服务器已关闭');
        process.exit(0);
    });
});
