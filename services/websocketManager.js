// WebSocket 管理器
const { WebSocketServer } = require('ws');

class WebSocketManager {
    constructor(server, chatManager, historyManager) {
        this.wss = new WebSocketServer({ server });
        this.connectedClients = new Set();
        this.chatManager = chatManager;
        this.historyManager = historyManager;
        this.setupWebSocketServer();
        this.setupHeartbeat();
    }

    // 设置 WebSocket 服务器
    setupWebSocketServer() {
        this.wss.on('connection', (ws, req) => {
            this.handleNewConnection(ws, req);
        });
    }

    // 处理新连接
    handleNewConnection(ws, req) {
        const clientIP = req.socket.remoteAddress;
        console.log(`📱 新 WebSocket 客户端连接：${clientIP}`);

        this.connectedClients.add(ws);

        // 设置心跳机制
        ws.isAlive = true;
        ws.on('pong', () => {
            ws.isAlive = true;
        });

        // 发送当前聊天内容（如果有）
        this.sendCurrentContentToClient(ws);

        // 设置消息处理器
        ws.on('message', (data) => {
            this.handleMessage(ws, data);
        });

        // 连接关闭处理
        ws.on('close', (code, reason) => {
            this.handleClientDisconnect(ws, clientIP, code);
        });

        // 错误处理
        ws.on('error', (error) => {
            this.handleClientError(ws, error);
        });
    }

    // 向新客户端发送当前内容
    sendCurrentContentToClient(ws) {
        const content = this.chatManager.getContent();
        if (content.hasContent) {
            try {
                ws.send(JSON.stringify({
                    type: 'html_content',
                    data: {
                        html: content.html,
                        timestamp: Date.now()
                    }
                }));
                console.log('📤 向新 WebSocket 客户端发送当前内容');
            } catch (error) {
                console.log('❌ 发送失败：', error.message);
            }
        }
    }

    // 处理收到的消息
    handleMessage(ws, data) {
        try {
            const message = JSON.parse(data.toString());
            console.log(`📥 WebSocket 收到消息类型：${message.type}`);

            switch (message.type) {
                case 'html_content':
                    this.handleHtmlContent(ws, message);
                    break;

                case 'user_message':
                    this.handleUserMessage(ws, message);
                    break;

                case 'test':
                    this.handleTestMessage(ws, message);
                    break;

                case 'debug':
                    this.handleDebugMessage(ws, message);
                    break;

                case 'ping':
                    this.handlePing(ws);
                    break;

                case 'clear_content':
                    this.handleClearContent(message);
                    break;

                case 'sync_clear_timestamp':
                    this.handleSyncClearTimestamp(message);
                    break;

                default:
                    console.log('❓ 未知 WebSocket 消息类型：', message.type);
            }

        } catch (error) {
            console.log('❌ WebSocket 消息解析错误：', error.message);
        }
    }

    // 处理 HTML 内容消息
    handleHtmlContent(ws, message) {
        const result = this.chatManager.updateContent(message.data.html, message.data.timestamp);
        if (result.success) {
            // 添加到历史记录
            this.historyManager.addHistoryItem(message.data.html, 'chat', {
                timestamp: message.data.timestamp,
                source: 'cursor',
                clientIP: ws._socket?.remoteAddress
            });
            
            // 转发给所有连接的客户端
            this.broadcastToClients(message, ws);
        }
    }

    // 广播消息给所有客户端（公共方法，供外部调用）
    broadcastToClients(message, sender) {
        const messageStr = JSON.stringify(message);
        let broadcastCount = 0;

        this.connectedClients.forEach(client => {
            if (client !== sender && client.readyState === client.OPEN) {
                try {
                    client.send(messageStr);
                    broadcastCount++;
                } catch (error) {
                    console.log('❌ WebSocket 广播失败：', error.message);
                    this.connectedClients.delete(client);
                }
            }
        });

        if (broadcastCount > 0) {
            console.log(`📢 消息已广播给 ${broadcastCount} 个 WebSocket 客户端`);
        }
    }

    // 处理用户消息
    handleUserMessage(ws, message) {
        console.log('💬 Web 端用户消息转发：', message.data);
        this.broadcastToClients({
            type: 'user_message',
            data: message.data,
            timestamp: Date.now()
        }, ws);
    }

    // 处理测试消息
    handleTestMessage(ws, message) {
        console.log('🧪 WebSocket 收到测试消息：', message.content);
        this.broadcastToClients({
            type: 'test_response',
            content: `服务器已收到测试消息：${message.content}`,
            timestamp: Date.now()
        }, ws);
    }

    // 处理调试消息
    handleDebugMessage(ws, message) {
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
    }

    // 处理心跳
    handlePing(ws) {
        ws.send(JSON.stringify({
            type: 'pong',
            timestamp: Date.now()
        }));
    }

    // 处理清除内容
    handleClearContent(message) {
        const result = this.chatManager.clearContent(message.timestamp);
        this.broadcastToClients({
            type: 'clear_content',
            timestamp: result.timestamp
        });
    }

    // 处理同步清除时间戳
    handleSyncClearTimestamp(message) {
        const result = this.chatManager.syncClearTimestamp(message.timestamp);
        this.broadcastToClients({
            type: 'sync_clear_timestamp',
            timestamp: result.timestamp
        });
    }

    // 处理客户端断开连接
    handleClientDisconnect(ws, clientIP, code) {
        this.connectedClients.delete(ws);
        console.log(`📱 WebSocket 客户端断开连接：${clientIP} (code: ${code})`);
        console.log(`📊 当前 WebSocket 连接数：${this.connectedClients.size}`);
    }

    // 处理客户端错误
    handleClientError(ws, error) {
        console.log('🔥 WebSocket 错误：', error.message);
        this.connectedClients.delete(ws);
    }



    // 设置心跳检测
    setupHeartbeat() {
        setInterval(() => {
            const activeClients = new Set();

            this.connectedClients.forEach(client => {
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

            if (this.connectedClients.size !== activeClients.size) {
                console.log(`🧹 清理断开连接：${this.connectedClients.size} -> ${activeClients.size}`);
                this.connectedClients = activeClients;
            }
        }, 30000); // 每 30 秒清理一次
    }

    // 获取连接数
    getConnectedClientsCount() {
        return this.connectedClients.size;
    }

    // 通知所有客户端服务器关闭
    notifyServerShutdown() {
        const clientClosePromises = [];

        this.connectedClients.forEach(client => {
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

        return Promise.allSettled(clientClosePromises);
    }

    // 关闭 WebSocket 服务器
    close() {
        this.wss.close();
    }
}

module.exports = WebSocketManager;
