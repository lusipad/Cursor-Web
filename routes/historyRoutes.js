/**
 * 历史记录路由
 * 重构后的简化版本，使用服务层架构
 */
const express = require('express');
const HistoryService = require('../services/historyService');

class HistoryRoutes {
    constructor() {
        this.router = express.Router();
        this.historyService = new HistoryService();
        this.setupRoutes();
    }

    setupRoutes() {
        // 获取所有聊天历史
        this.router.get('/history/chats', this.getAllChats.bind(this));
        
        // 获取会话列表（别名，兼容前端调用）
        this.router.get('/history/sessions', this.getAllChats.bind(this));
        
        // 获取特定聊天详情
        this.router.get('/history/chat/:sessionId', this.getChatDetail.bind(this));
        
        // 导出聊天记录
        this.router.get('/history/chat/:sessionId/export', this.exportChat.bind(this));
        
        // 搜索聊天记录
        this.router.get('/history/search', this.searchChats.bind(this));
        
        // 获取工作区列表
        this.router.get('/history/workspaces', this.getWorkspaces.bind(this));
        
        // 清除缓存
        this.router.post('/history/cache/clear', this.clearCache.bind(this));
    }

    /**
     * 获取所有聊天记录
     */
    async getAllChats(req, res) {
        try {
            const options = {
                limit: parseInt(req.query.limit) || undefined,
                offset: parseInt(req.query.offset) || 0,
                workspaceId: req.query.workspaceId || undefined
            };

            console.log('获取聊天记录，选项:', options);
            
            const chats = await this.historyService.getAllChats(options);
            
            res.json({
                success: true,
                data: chats,
                count: chats.length,
                options
            });
            
        } catch (error) {
            console.error('获取聊天记录失败:', error);
            res.status(500).json({
                success: false,
                error: error.message || '获取聊天记录失败',
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }

    /**
     * 获取特定聊天详情
     */
    async getChatDetail(req, res) {
        try {
            const { sessionId } = req.params;
            
            if (!sessionId) {
                return res.status(400).json({
                    success: false,
                    error: '缺少会话ID参数'
                });
            }

            console.log('获取聊天详情，会话ID:', sessionId);
            
            // 如果有force参数，清除缓存
            if (req.query.force === 'true') {
                console.log('🗑️ 强制清除缓存');
                this.historyService.clearCache();
            }
            
            const chatDetail = await this.historyService.getChatDetail(sessionId);
            
            res.json({
                success: true,
                data: chatDetail
            });
            
        } catch (error) {
            console.error('获取聊天详情失败:', error);
            
            if (error.message.includes('未找到会话')) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: error.message || '获取聊天详情失败',
                    details: process.env.NODE_ENV === 'development' ? error.stack : undefined
                });
            }
        }
    }

    /**
     * 搜索聊天记录
     */
    async searchChats(req, res) {
        try {
            const { query } = req.query;
            
            if (!query) {
                return res.status(400).json({
                    success: false,
                    error: '缺少搜索关键词'
                });
            }

            const options = {
                limit: parseInt(req.query.limit) || undefined,
                workspaceId: req.query.workspaceId || undefined
            };

            console.log('搜索聊天记录，关键词:', query, '选项:', options);
            
            const results = await this.historyService.searchChats(query, options);
            
            res.json({
                success: true,
                data: results,
                count: results.length,
                query,
                options
            });
            
        } catch (error) {
            console.error('搜索聊天记录失败:', error);
            res.status(500).json({
                success: false,
                error: error.message || '搜索聊天记录失败',
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }

    /**
     * 导出聊天记录
     */
    async exportChat(req, res) {
        try {
            const { sessionId } = req.params;
            const format = req.query.format || 'html';
            
            if (!sessionId) {
                return res.status(400).json({
                    success: false,
                    error: '缺少会话ID参数'
                });
            }

            if (!['html', 'json'].includes(format)) {
                return res.status(400).json({
                    success: false,
                    error: '不支持的导出格式，支持: html, json'
                });
            }

            console.log('导出聊天记录，会话ID:', sessionId, '格式:', format);
            
            const chatDetail = await this.historyService.getChatDetail(sessionId);
            
            if (format === 'json') {
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename="chat_${sessionId}.json"`);
                res.json(chatDetail);
            } else {
                const html = this.generateChatHtml(chatDetail);
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.setHeader('Content-Disposition', `attachment; filename="chat_${sessionId}.html"`);
                res.send(html);
            }
            
        } catch (error) {
            console.error('导出聊天记录失败:', error);
            
            if (error.message.includes('未找到会话')) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: error.message || '导出聊天记录失败',
                    details: process.env.NODE_ENV === 'development' ? error.stack : undefined
                });
            }
        }
    }

    /**
     * 获取工作区列表
     */
    async getWorkspaces(req, res) {
        try {
            console.log('获取工作区列表');
            
            const workspaces = await this.historyService.getWorkspaces();
            
            res.json({
                success: true,
                data: workspaces,
                count: workspaces.length
            });
            
        } catch (error) {
            console.error('获取工作区列表失败:', error);
            res.status(500).json({
                success: false,
                error: error.message || '获取工作区列表失败',
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }

    /**
     * 清除缓存
     */
    async clearCache(req, res) {
        try {
            console.log('清除历史记录缓存');
            
            this.historyService.clearCache();
            
            res.json({
                success: true,
                message: '缓存已清除'
            });
            
        } catch (error) {
            console.error('清除缓存失败:', error);
            res.status(500).json({
                success: false,
                error: error.message || '清除缓存失败'
            });
        }
    }

    /**
     * 生成聊天HTML
     * @param {Object} chat - 聊天数据
     * @returns {string} HTML字符串
     */
    generateChatHtml(chat) {
        const formatTime = (timestamp) => {
            if (!timestamp) return '';
            return new Date(timestamp).toLocaleString('zh-CN');
        };

        const messagesHtml = chat.messages.map((message, index) => `
            <div class="message ${message.role}">
                <div class="message-header">
                    <div class="avatar ${message.role}">
                        ${message.role === 'user' ? '👤' : '🤖'}
                    </div>
                    <div class="message-info">
                        <strong>${message.role === 'user' ? 'You' : 'Cursor Assistant'}</strong>
                        ${message.timestamp ? `<span class="time">${formatTime(message.timestamp)}</span>` : ''}
                    </div>
                </div>
                <div class="message-content">
                    ${this.escapeHtml(message.content).replace(/\n/g, '<br>')}
                </div>
            </div>
        `).join('');

        const projectName = chat.project?.name || 'Unknown Project';
        const projectPath = chat.project?.rootPath || 'Unknown Path';

        return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(chat.title)} - Cursor Chat Export</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }

        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            text-align: center;
        }

        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            font-weight: 300;
        }

        .meta {
            display: flex;
            justify-content: center;
            gap: 30px;
            flex-wrap: wrap;
            margin-top: 20px;
        }

        .meta-item {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 0.9rem;
            opacity: 0.9;
        }

        .messages {
            padding: 40px;
            background: #fafafa;
        }

        .message {
            margin-bottom: 30px;
            display: flex;
            align-items: flex-start;
            gap: 15px;
        }

        .message.user {
            flex-direction: row-reverse;
        }

        .avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.2rem;
            flex-shrink: 0;
        }

        .avatar.user {
            background: linear-gradient(135deg, #667eea, #764ba2);
        }

        .avatar.assistant {
            background: linear-gradient(135deg, #f093fb, #f5576c);
        }

        .message-info {
            flex: 1;
            max-width: 70%;
            background: white;
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }

        .message.user .message-info {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
        }

        .message-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }

        .message-header strong {
            font-weight: 600;
        }

        .time {
            font-size: 0.8rem;
            opacity: 0.7;
        }

        .message-content {
            white-space: pre-wrap;
            word-wrap: break-word;
            line-height: 1.7;
        }

        code {
            background: #f1f1f1;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Monaco', 'Consolas', 'Courier New', monospace;
            font-size: 0.9em;
        }

        pre {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            overflow-x: auto;
            margin: 10px 0;
        }

        pre code {
            background: none;
            padding: 0;
        }

        .footer {
            padding: 20px;
            text-align: center;
            background: #f8f9fa;
            color: #666;
            font-size: 0.9rem;
        }

        @media (max-width: 768px) {
            body {
                padding: 10px;
            }
            
            .container {
                margin: 0;
                border-radius: 0;
            }
            
            .header {
                padding: 30px 20px;
            }
            
            .header h1 {
                font-size: 2rem;
            }
            
            .messages {
                padding: 20px;
            }
            
            .message {
                flex-direction: column;
                align-items: flex-start;
            }
            
            .message.user {
                align-items: flex-end;
            }
            
            .message-info {
                max-width: 100%;
                margin-top: 10px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${this.escapeHtml(chat.title)}</h1>
            <div class="meta">
                <div class="meta-item">
                    <span>📁</span>
                    <span>${this.escapeHtml(projectName)}</span>
                </div>
                <div class="meta-item">
                    <span>📍</span>
                    <span>${this.escapeHtml(projectPath)}</span>
                </div>
                <div class="meta-item">
                    <span>📅</span>
                    <span>导出时间: ${new Date().toLocaleString('zh-CN')}</span>
                </div>
                <div class="meta-item">
                    <span>💬</span>
                    <span>${chat.messages.length} 条消息</span>
                </div>
            </div>
        </div>
        
        <div class="messages">
            ${messagesHtml}
        </div>
        
        <div class="footer">
            <p>导出自 Cursor Chat History • ${new Date().toLocaleString('zh-CN')}</p>
        </div>
    </div>
</body>
</html>
        `;
    }

    /**
     * HTML转义
     * @param {string} text - 原始文本
     * @returns {string} 转义后的文本
     */
    escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * 获取路由器
     * @returns {express.Router} Express路由器
     */
    getRouter() {
        return this.router;
    }
}

module.exports = HistoryRoutes;