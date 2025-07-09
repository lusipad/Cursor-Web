// Claude Web 服务器 - 支持 WebSocket 和调试
const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

let currentChatContent = '';
let connectedClients = new Set();

// 中间件
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// CORS 支持
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
    }
    next();
});

// 主页路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 健康检查端点
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        localUrl: `http://localhost:3000`,
        cursorConnected: !!currentChatContent,
        workspace: process.cwd(),
        timestamp: Date.now(),
        connectedClients: connectedClients.size
    });
});

// HTTP API 路由
// 测试连接
app.get('/api/test', (req, res) => {
    console.log('📡 HTTP API 测试请求');
    res.json({
        status: 'ok',
        message: 'Claude Web 服务器运行正常',
        timestamp: Date.now(),
        method: 'http'
    });
});

// 接收聊天内容
app.post('/api/content', (req, res) => {
    try {
        const { type, data } = req.body;

        if (type === 'html_content' && data) {
            currentChatContent = data.html;
            console.log(`📥 HTTP 接收内容：${data.html.length} 字符`);
            console.log(`📊 来源：${data.url || 'unknown'}`);

            // 广播给所有 WebSocket 客户端
            broadcastToWebSocketClients({
                type: 'html_content',
                data: data
            });

            res.json({
                success: true,
                message: '内容接收成功',
                contentLength: data.html.length,
                timestamp: Date.now()
            });
        } else {
            res.status(400).json({
                success: false,
                message: '无效的请求数据'
            });
        }
    } catch (error) {
        console.log('❌ HTTP API 错误：', error.message);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: error.message
        });
    }
});

// 获取当前内容
app.get('/api/content', (req, res) => {
    res.json({
        success: true,
        data: {
            html: currentChatContent,
            timestamp: Date.now(),
            hasContent: !!currentChatContent
        }
    });
});

// 服务器状态
app.get('/api/status', (req, res) => {
    res.json({
        status: 'running',
        connectedClients: connectedClients.size,
        hasContent: !!currentChatContent,
        contentLength: currentChatContent.length,
        uptime: process.uptime(),
        timestamp: Date.now()
    });
});

// WebSocket 连接处理
wss.on('connection', (ws, req) => {
    const clientIP = req.socket.remoteAddress;
    console.log(`📱 新 WebSocket 客户端连接：${clientIP}`);

    connectedClients.add(ws);

    // 发送当前聊天内容（如果有）
    if (currentChatContent) {
        try {
            ws.send(JSON.stringify({
                type: 'html_content',
                data: {
                    html: currentChatContent,
                    timestamp: Date.now()
                }
            }));
            console.log('📤 向新 WebSocket 客户端发送当前内容');
        } catch (error) {
            console.log('❌ 发送失败：', error.message);
        }
    }

    // 处理收到的消息
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            console.log(`📥 WebSocket 收到消息类型：${message.type}`);

            switch (message.type) {
                case 'html_content':
                    // 更新聊天内容
                    currentChatContent = message.data.html;
                    console.log(`📋 WebSocket 更新聊天内容：${currentChatContent.length} 字符`);

                    // 转发给所有连接的客户端
                    broadcastToWebSocketClients(message, ws);
                    break;

                case 'user_message':
                    // 新增：转发用户消息给所有客户端（包括 Cursor 端）
                    console.log('💬 Web 端用户消息转发：', message.data);
                    broadcastToWebSocketClients({
                        type: 'user_message',
                        data: message.data,
                        timestamp: Date.now()
                    }, ws);
                    break;

                case 'test':
                    console.log('🧪 WebSocket 收到测试消息：', message.content);
                    // 转发测试消息
                    broadcastToWebSocketClients({
                        type: 'test_response',
                        content: `服务器已收到测试消息：${message.content}`,
                        timestamp: Date.now()
                    }, ws);
                    break;

                case 'debug':
                    console.log('🔍 WebSocket 收到调试信息：');
                    console.log('  - 消息：', message.message);
                    console.log('  - URL:', message.url);
                    console.log('  - 时间戳：', new Date(message.timestamp));

                    // 回复调试信息
                    ws.send(JSON.stringify({
                        type: 'debug_response',
                        message: '服务器已收到调试信息',
                        server_time: Date.now()
                    }));
                    break;

                case 'ping':
                    // 心跳响应
                    ws.send(JSON.stringify({
                        type: 'pong',
                        timestamp: Date.now()
                    }));
                    break;

                case 'clear_content':
                    currentChatContent = '';
                    console.log('🧹 收到清除内容请求，已清空内容');
                    broadcastToWebSocketClients({ type: 'clear_content' });
                    break;

                default:
                    console.log('❓ 未知 WebSocket 消息类型：', message.type);
            }

        } catch (error) {
            console.log('❌ WebSocket 消息解析错误：', error.message);
        }
    });

    // 连接关闭处理
    ws.on('close', (code, reason) => {
        connectedClients.delete(ws);
        console.log(`📱 WebSocket 客户端断开连接：${clientIP} (code: ${code})`);
        console.log(`📊 当前 WebSocket 连接数：${connectedClients.size}`);
    });

    // 错误处理
    ws.on('error', (error) => {
        console.log('🔥 WebSocket 错误：', error.message);
        connectedClients.delete(ws);
    });
});

// 向所有 WebSocket 客户端广播消息（除了发送者）
function broadcastToWebSocketClients(message, sender) {
    const messageStr = JSON.stringify(message);
    let broadcastCount = 0;

    connectedClients.forEach(client => {
        if (client !== sender && client.readyState === client.OPEN) {
            try {
                client.send(messageStr);
                broadcastCount++;
            } catch (error) {
                console.log('❌ WebSocket 广播失败：', error.message);
                connectedClients.delete(client);
            }
        }
    });

    if (broadcastCount > 0) {
        console.log(`📢 消息已广播给 ${broadcastCount} 个 WebSocket 客户端`);
    }
}

// 定期清理断开的连接
setInterval(() => {
    const activeClients = new Set();

    connectedClients.forEach(client => {
        if (client.readyState === client.OPEN) {
            activeClients.add(client);
        }
    });

    if (connectedClients.size !== activeClients.size) {
        console.log(`🧹 清理断开连接：${connectedClients.size} -> ${activeClients.size}`);
        connectedClients = activeClients;
    }
}, 30000); // 每 30 秒清理一次

// 启动服务器
const PORT = 3000;
server.listen(PORT, () => {
    console.log('🚀 Claude Web 服务器已启动！');
    console.log(`📍 本地访问：http://localhost:${PORT}`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
    console.log(`📡 HTTP API: http://localhost:${PORT}/api/`);
    console.log('📊 服务器状态：等待连接...\n');
    console.log('💡 支持的连接方式：');
    console.log('  - WebSocket (推荐用于浏览器)');
    console.log('  - HTTP API (适用于 Cursor 等受限环境)');
    console.log('  - 测试连接：GET /api/test');
    console.log('  - 发送内容：POST /api/content');
    console.log('  - 获取状态：GET /api/status\n');
});

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n🛑 正在关闭服务器...');

    // 通知所有客户端
    connectedClients.forEach(client => {
        if (client.readyState === client.OPEN) {
            try {
                client.send(JSON.stringify({
                    type: 'server_shutdown',
                    message: '服务器正在关闭'
                }));
                client.close();
            } catch (error) {
                // 忽略关闭时的错误
            }
        }
    });

    server.close(() => {
        console.log('✅ 服务器已关闭');
        process.exit(0);
    });
});
