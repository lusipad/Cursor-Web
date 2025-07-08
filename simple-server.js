const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

let currentContent = '';

// WebSocket 服务器
const wss = new WebSocket.Server({ server });
let connectedClients = new Set();

// 基本测试端点
app.get('/api/test', (req, res) => {
    console.log('📞 收到测试请求');
    res.json({
        success: true,
        message: '服务器运行正常',
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
            console.log(`📊 当前WebSocket连接数：${connectedClients.size}`);

            // 广播给所有WebSocket客户端
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
        console.error('处理内容失败：', error);
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
    console.log('📊 收到状态查询请求');
    res.json({
        status: 'running',
        hasContent: !!currentContent,
        contentLength: currentContent.length,
        uptime: process.uptime(),
        timestamp: Date.now(),
        message: '简化服务器运行中'
    });
});

// WebSocket 连接处理
wss.on('connection', (ws) => {
    console.log('📱 新 WebSocket 客户端连接');
    connectedClients.add(ws);

    // 发送当前内容（如果有）
    if (currentContent) {
        ws.send(JSON.stringify({
            type: 'html_content',
            data: {
                html: currentContent,
                timestamp: Date.now()
            }
        }));
    }

    // 处理消息
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            if (message.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong' }));
            }
        } catch (error) {
            console.error('WebSocket 消息处理错误:', error);
        }
    });

    // 连接关闭
    ws.on('close', () => {
        console.log('📱 WebSocket 客户端断开连接');
        connectedClients.delete(ws);
    });

    // 错误处理
    ws.on('error', (error) => {
        console.error('WebSocket 错误:', error);
        connectedClients.delete(ws);
    });
});

// 广播函数
function broadcastToClients(message) {
    const messageStr = JSON.stringify(message);
    let broadcastCount = 0;

    connectedClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(messageStr);
                broadcastCount++;
            } catch (error) {
                console.error('广播失败:', error);
                connectedClients.delete(client);
            }
        }
    });

    if (broadcastCount > 0) {
        console.log(`📢 消息已广播给 ${broadcastCount} 个客户端`);
    }
}

// 启动服务器
const PORT = 3000;
server.listen(PORT, () => {
    console.log('🚀 简化测试服务器已启动！');
    console.log(`📍 本地访问：http://localhost:${PORT}`);
    console.log(`📡 HTTP API: http://localhost:${PORT}/api/`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
    console.log('💡 API端点:');
    console.log('  - 测试连接: GET /api/test');
    console.log('  - 发送内容: POST /api/content');
    console.log('  - 获取内容: GET /api/content');
    console.log('  - 服务器状态: GET /api/status');
    console.log('🎯 准备接收Cursor同步数据...\n');
});
