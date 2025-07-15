// Claude Web 服务器 - 支持 WebSocket 和调试
const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const { simpleGit, SimpleGit } = require('simple-git');

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

let currentChatContent = '';
let connectedClients = new Set();
let globalClearTimestamp = null; // 添加全局清除时间戳

// 初始化 Git 实例
const git = simpleGit(process.cwd());

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
            // 🧹 强制清空当前内容，防止旧内容残留
            if (data.html === '' || data.contentLength === 0) {
                console.log('🧹 收到空内容，强制清空');
                currentChatContent = '';
                broadcastToWebSocketClients({
                    type: 'html_content',
                    data: { html: '', timestamp: Date.now() }
                });
                res.json({
                    success: true,
                    message: '内容已清空',
                    cleared: true,
                    timestamp: Date.now()
                });
                return;
            }

            // 检查是否需要过滤清除时间点之前的内容
            if (globalClearTimestamp && data.timestamp && data.timestamp < globalClearTimestamp) {
                console.log('⏰ 服务器端过滤清除时间点之前的内容:', new Date(data.timestamp).toLocaleTimeString());
                res.json({
                    success: true,
                    message: '内容已过滤（清除时间点之前）',
                    filtered: true,
                    timestamp: Date.now()
                });
                return;
            }
            
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

// Git 管理 API 路由
// 获取当前分支和所有分支
app.get('/api/git/branches', async (req, res) => {
    try {
        const [currentBranch, allBranches] = await Promise.all([
            git.branchLocal(),
            git.branch(['-a'])
        ]);

        res.json({
            success: true,
            currentBranch: currentBranch.current,
            allBranches: allBranches.all,
            localBranches: currentBranch.all,
            timestamp: Date.now()
        });
    } catch (error) {
        console.log('❌ Git 获取分支失败：', error.message);
        res.status(500).json({
            success: false,
            message: '获取分支信息失败',
            error: error.message
        });
    }
});

// 切换分支
app.post('/api/git/checkout', async (req, res) => {
    try {
        const { branch } = req.body;
        if (!branch) {
            return res.status(400).json({
                success: false,
                message: '分支名称不能为空'
            });
        }

        await git.checkout(branch);
        const newBranch = await git.branchLocal();

        res.json({
            success: true,
            message: `已切换到分支: ${branch}`,
            currentBranch: newBranch.current,
            timestamp: Date.now()
        });
    } catch (error) {
        console.log('❌ Git 切换分支失败：', error.message);
        res.status(500).json({
            success: false,
            message: '切换分支失败',
            error: error.message
        });
    }
});

// 拉取最新代码
app.post('/api/git/pull', async (req, res) => {
    try {
        const result = await git.pull();

        res.json({
            success: true,
            message: '代码更新成功',
            result: result,
            timestamp: Date.now()
        });
    } catch (error) {
        console.log('❌ Git 拉取失败：', error.message);
        res.status(500).json({
            success: false,
            message: '代码更新失败',
            error: error.message
        });
    }
});

// 获取状态
app.get('/api/git/status', async (req, res) => {
    try {
        const status = await git.status();

        res.json({
            success: true,
            status: status,
            timestamp: Date.now()
        });
    } catch (error) {
        console.log('❌ Git 状态获取失败：', error.message);
        res.status(500).json({
            success: false,
            message: '获取Git状态失败',
            error: error.message
        });
    }
});

// 添加文件到暂存区
app.post('/api/git/add', async (req, res) => {
    try {
        const { files } = req.body;
        const filesToAdd = files || '.';

        await git.add(filesToAdd);

        res.json({
            success: true,
            message: '文件已添加到暂存区',
            files: filesToAdd,
            timestamp: Date.now()
        });
    } catch (error) {
        console.log('❌ Git 添加文件失败：', error.message);
        res.status(500).json({
            success: false,
            message: '添加文件失败',
            error: error.message
        });
    }
});

// 提交代码
app.post('/api/git/commit', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) {
            return res.status(400).json({
                success: false,
                message: '提交信息不能为空'
            });
        }

        const result = await git.commit(message);

        res.json({
            success: true,
            message: '代码提交成功',
            result: result,
            timestamp: Date.now()
        });
    } catch (error) {
        console.log('❌ Git 提交失败：', error.message);
        res.status(500).json({
            success: false,
            message: '代码提交失败',
            error: error.message
        });
    }
});

// 推送代码
app.post('/api/git/push', async (req, res) => {
    try {
        const result = await git.push();

        res.json({
            success: true,
            message: '代码推送成功',
            result: result,
            timestamp: Date.now()
        });
    } catch (error) {
        console.log('❌ Git 推送失败：', error.message);
        res.status(500).json({
            success: false,
            message: '代码推送失败',
            error: error.message
        });
    }
});

// 🧹 清除内容API - 彻底重置
app.post('/api/clear', (req, res) => {
    try {
        const { timestamp } = req.body;
        
        // 🔄 完全重置 - 清除所有历史数据
        globalClearTimestamp = timestamp || Date.now();
        currentChatContent = '';
        
        console.log('🧹 收到清除请求，完全重置所有内容');
        console.log('⏰ 清除时间戳:', new Date(globalClearTimestamp).toLocaleString());
        
        // 广播清除消息给所有客户端，包含强制重置标志
        broadcastToWebSocketClients({
            type: 'clear_content',
            timestamp: globalClearTimestamp,
            forceReset: true,
            source: 'server'
        });
        
        res.json({
            success: true,
            message: '所有内容已清空并重置',
            timestamp: globalClearTimestamp,
            forceReset: true
        });
    } catch (error) {
        console.log('❌ 清除内容失败：', error.message);
        res.status(500).json({
            success: false,
            message: '清除内容失败',
            error: error.message
        });
    }
});

// WebSocket 连接处理
wss.on('connection', (ws, req) => {
    const clientIP = req.socket.remoteAddress;
    console.log(`📱 新 WebSocket 客户端连接：${clientIP}`);

    connectedClients.add(ws);
    
    // 设置心跳机制
    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });

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
                    globalClearTimestamp = message.timestamp || Date.now();
                    console.log('🧹 收到清除内容请求，已清空内容');
                    console.log('⏱️ 服务器设置清除时间戳:', new Date(globalClearTimestamp).toLocaleString());
                    broadcastToWebSocketClients({
                        type: 'clear_content',
                        timestamp: globalClearTimestamp
                    });
                    break;

                case 'sync_clear_timestamp':
                    console.log('⏱️ 同步清除时间戳:', new Date(message.timestamp).toLocaleString());
                    broadcastToWebSocketClients({
                        type: 'sync_clear_timestamp',
                        timestamp: message.timestamp
                    });
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

// 定期清理断开的连接和心跳检测
setInterval(() => {
    const activeClients = new Set();

    connectedClients.forEach(client => {
        if (client.readyState === client.OPEN) {
            if (client.isAlive === false) {
                // 客户端未响应心跳，断开连接
                console.log('💔 客户端心跳超时，断开连接');
                client.terminate();
                return;
            }
            
            // 发送心跳包
            client.isAlive = false;
            client.ping();
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
const HOST = '0.0.0.0'; // 允许所有IP访问，支持局域网连接

server.listen(PORT, HOST, () => {
    console.log('🚀 Claude Web 服务器已启动！');
    console.log(`📍 本地访问：http://localhost:${PORT}`);
    console.log(`🌐 局域网访问：http://${getLocalIP()}:${PORT}`);
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

// 获取本机IP地址
function getLocalIP() {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // 跳过非IPv4和内部地址
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

// 优雅关闭
function gracefulShutdown(signal) {
    console.log(`\n🛑 收到 ${signal} 信号，正在关闭服务器...`);

    // 设置强制退出超时
    const forceExitTimeout = setTimeout(() => {
        console.log('⏰ 强制退出超时，立即关闭');
        process.exit(1);
    }, 10000); // 10秒超时

    // 通知所有客户端
    const clientClosePromises = [];
    connectedClients.forEach(client => {
        if (client.readyState === client.OPEN) {
            try {
                client.send(JSON.stringify({
                    type: 'server_shutdown',
                    message: '服务器正在关闭'
                }));
                
                // 创建客户端关闭Promise
                const closePromise = new Promise((resolve) => {
                    client.on('close', resolve);
                    client.close();
                    // 设置客户端关闭超时
                    setTimeout(resolve, 1000);
                });
                clientClosePromises.push(closePromise);
            } catch (error) {
                console.log('⚠️ 关闭客户端时出错:', error.message);
            }
        }
    });

    // 等待所有客户端关闭
    Promise.allSettled(clientClosePromises).then(() => {
        console.log('📱 所有客户端已断开');
        
        // 关闭服务器
        server.close((err) => {
            clearTimeout(forceExitTimeout);
            if (err) {
                console.log('❌ 服务器关闭失败:', err.message);
                process.exit(1);
            } else {
                console.log('✅ 服务器已优雅关闭');
                process.exit(0);
            }
        });
    });

    // 如果服务器关闭超时，强制关闭
    setTimeout(() => {
        console.log('⏰ 服务器关闭超时，强制关闭');
        clearTimeout(forceExitTimeout);
        process.exit(1);
    }, 5000);
}

// 监听关闭信号
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
    console.error('💥 未捕获的异常:', error);
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 未处理的Promise拒绝:', reason);
    gracefulShutdown('unhandledRejection');
});
