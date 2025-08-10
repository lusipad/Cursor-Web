// 内容相关路由
const express = require('express');
const router = express.Router();

class ContentRoutes {
    constructor(chatManager, websocketManager, historyManager) {
        this.chatManager = chatManager;
        this.websocketManager = websocketManager;
        this.historyManager = historyManager;
        this.setupRoutes();
    }

    setupRoutes() {
        // 测试连接
        router.get('/test', this.handleTest.bind(this));

        // 接收聊天内容
        router.post('/content', this.handleReceiveContent.bind(this));

        // 获取当前内容
        router.get('/content', this.handleGetContent.bind(this));

        // 服务器状态
        router.get('/status', this.handleGetStatus.bind(this));

        // 健康检查
        router.get('/health', this.handleHealthCheck.bind(this));

        // 获取聊天记录
        router.get('/chats', this.handleGetChats.bind(this));
        
        // 获取单个聊天记录
        router.get('/chat/:sessionId', this.handleGetChat.bind(this));
        
        // 导出聊天记录
        router.get('/chat/:sessionId/export', this.handleExportChat.bind(this));
    }

    // 测试连接
    handleTest(req, res) {
        console.log('📡 HTTP API 测试请求');
        res.json({
            status: 'ok',
            message: 'Cursor Web 服务器运行正常',
            timestamp: Date.now(),
            method: 'http'
        });
    }

    // 接收聊天内容
    handleReceiveContent(req, res) {
        try {
            const { type, data } = req.body;

            if (type === 'html_content' && data) {
                const result = this.chatManager.updateContent(data.html, data.timestamp);

                if (result.success) {
                    console.log(`📥 HTTP 接收内容：${data.html.length} 字符`);
                    console.log(`📊 来源：${data.url || 'unknown'}`);

                    // 添加到历史记录（如果实现了写入接口）
                    if (this.historyManager && typeof this.historyManager.addHistoryItem === 'function') {
                        this.historyManager.addHistoryItem(data.html, 'chat', {
                            timestamp: data.timestamp,
                            source: 'http',
                            url: data.url || 'unknown'
                        });
                    }

                    // 广播给所有 WebSocket 客户端
                    this.websocketManager.broadcastToClients({
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
                    res.json({
                        success: true,
                        message: result.message,
                        filtered: result.filtered,
                        timestamp: Date.now()
                    });
                }
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
    }

    // 获取当前内容
    handleGetContent(req, res) {
        const content = this.chatManager.getContent();
        res.json({
            success: true,
            data: {
                html: content.html,
                timestamp: Date.now(),
                hasContent: content.hasContent
            }
        });
    }

    // 获取服务器状态
    handleGetStatus(req, res) {
        const chatStatus = this.chatManager.getStatus();
        res.json({
            status: 'running',
            connectedClients: this.websocketManager.getConnectedClientsCount(),
            hasContent: chatStatus.hasContent,
            contentLength: chatStatus.contentLength,
            uptime: process.uptime(),
            timestamp: Date.now()
        });
    }

    // 健康检查
    handleHealthCheck(req, res) {
        const { networkInterfaces } = require('os');
        const nets = networkInterfaces();
        let localIP = 'localhost';

        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                    localIP = net.address;
                    break;
                }
            }
        }

        res.json({
            status: 'ok',
            localUrl: `http://localhost:3000`,
            cursorConnected: !!this.chatManager.getContent().hasContent,
            workspace: process.cwd(),
            timestamp: Date.now(),
            connectedClients: this.websocketManager.getConnectedClientsCount()
        });
    }

    // 获取聊天记录
    async handleGetChats(req, res) {
        try {
            console.log('📚 获取聊天记录请求');
            const chats = await this.historyManager.getChats();
            res.json(chats);
        } catch (error) {
            console.error('获取聊天记录失败:', error);
            res.status(500).json({
                error: '获取聊天记录失败',
                message: error.message
            });
        }
    }

    // 获取单个聊天记录
    async handleGetChat(req, res) {
        try {
            const { sessionId } = req.params;
            console.log(`📄 获取聊天记录详情: ${sessionId}`);
            const chat = await this.historyManager.getHistoryItem(sessionId);
            
            if (!chat) {
                return res.status(404).json({
                    error: '聊天记录不存在'
                });
            }
            
            res.json(chat);
        } catch (error) {
            console.error('获取聊天记录详情失败:', error);
            res.status(500).json({
                error: '获取聊天记录详情失败',
                message: error.message
            });
        }
    }

    // 导出聊天记录
    async handleExportChat(req, res) {
        try {
            const { sessionId } = req.params;
            const format = req.query.format || 'html';
            console.log(`📤 导出聊天记录: ${sessionId}, 格式: ${format}`);
            
            const chat = await this.historyManager.getHistoryItem(sessionId);
            if (!chat) {
                return res.status(404).json({
                    error: '聊天记录不存在'
                });
            }
            
            // 导出单个聊天记录
            const exportData = await this.historyManager.exportHistory({
                format: format,
                filter: (item) => item.sessionId === sessionId
            });
            
            // 设置响应头
            let contentType = 'text/html';
            let filename = `cursor-chat-${sessionId.slice(0, 8)}.html`;
            
            if (format === 'json') {
                contentType = 'application/json';
                filename = `cursor-chat-${sessionId.slice(0, 8)}.json`;
            }
            
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(exportData);
        } catch (error) {
            console.error('导出聊天记录失败:', error);
            res.status(500).json({
                error: '导出聊天记录失败',
                message: error.message
            });
        }
    }

    // 获取路由
    getRouter() {
        return router;
    }
}

module.exports = ContentRoutes;
