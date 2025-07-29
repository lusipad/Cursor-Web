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
        const messagesHtml = chat.messages.map(message => `
            <div class="message ${message.role}">
                <div class="message-header">
                    <strong>${message.role === 'user' ? '用户' : 'AI助手'}</strong>
                    ${message.formattedTime ? `<span class="time">${message.formattedTime}</span>` : ''}
                </div>
                <div class="message-content">
                    ${this.escapeHtml(message.content).replace(/\n/g, '<br>')}
                </div>
            </div>
        `).join('');

        return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(chat.title)} - 聊天记录</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .header {
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header h1 {
            margin: 0 0 10px 0;
            color: #2c3e50;
        }
        .meta {
            color: #666;
            font-size: 14px;
        }
        .messages {
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .message {
            padding: 20px;
            border-bottom: 1px solid #eee;
        }
        .message:last-child {
            border-bottom: none;
        }
        .message.user {
            background-color: #f8f9fa;
        }
        .message.assistant {
            background-color: #fff;
        }
        .message-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        .message-header strong {
            color: #2c3e50;
        }
        .time {
            color: #666;
            font-size: 12px;
        }
        .message-content {
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        code {
            background-color: #f1f1f1;
            padding: 2px 4px;
            border-radius: 3px;
            font-family: 'Monaco', 'Consolas', monospace;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${this.escapeHtml(chat.title)}</h1>
        <div class="meta">
            <div>导出时间: ${new Date().toLocaleString('zh-CN')}</div>
            <div>消息数量: ${chat.messages.length}</div>
            ${chat.project ? `<div>项目: ${this.escapeHtml(chat.project.name)}</div>` : ''}
        </div>
    </div>
    <div class="messages">
        ${messagesHtml}
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