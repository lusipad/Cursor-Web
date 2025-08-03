// 历史记录路由
const express = require('express');
const router = express.Router();

class HistoryRoutes {
    constructor(historyManager) {
        this.historyManager = historyManager;
        this.setupRoutes();
    }

    setupRoutes() {
        // 获取历史记录列表
        router.get('/history', this.getHistory.bind(this));
        
        // 获取统计信息
        router.get('/history/stats', this.getStats.bind(this));
        
        // 搜索历史记录
        router.get('/history/search', this.searchHistory.bind(this));
        
        // 导出历史记录
        router.get('/history/export', this.exportHistory.bind(this));
        
        // 获取单个历史记录
        router.get('/history/:id', this.getHistoryItem.bind(this));
        
        // 添加历史记录
        router.post('/history', this.addHistory.bind(this));
        
        // 删除历史记录
        router.delete('/history/:id', this.deleteHistory.bind(this));
        
        // 清除历史记录
        router.delete('/history', this.clearHistory.bind(this));
    }

    // 获取历史记录列表
    async getHistory(req, res) {
        try {
            const options = {
                limit: parseInt(req.query.limit) || 50,
                offset: parseInt(req.query.offset) || 0,
                type: req.query.type,
                startDate: req.query.startDate ? new Date(req.query.startDate) : undefined,
                endDate: req.query.endDate ? new Date(req.query.endDate) : undefined,
                searchQuery: req.query.search,
                sortBy: req.query.sortBy || 'timestamp',
                sortOrder: req.query.sortOrder || 'desc'
            };

            const result = await this.historyManager.getHistory(options);
            
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('获取历史记录失败:', error);
            res.status(500).json({
                success: false,
                error: '获取历史记录失败'
            });
        }
    }

    // 获取单个历史记录
    async getHistoryItem(req, res) {
        try {
            const { id } = req.params;
            const item = await this.historyManager.getHistoryItem(id);
            
            if (!item) {
                return res.status(404).json({
                    success: false,
                    error: '历史记录不存在'
                });
            }
            
            res.json({
                success: true,
                data: item
            });
        } catch (error) {
            console.error('获取历史记录详情失败:', error);
            res.status(500).json({
                success: false,
                error: '获取历史记录详情失败'
            });
        }
    }

    // 添加历史记录
    async addHistory(req, res) {
        try {
            const { content, type = 'chat', metadata = {} } = req.body;
            
            if (!content) {
                return res.status(400).json({
                    success: false,
                    error: '内容不能为空'
                });
            }
            
            const historyItem = await this.historyManager.addHistoryItem(content, type, metadata);
            
            res.json({
                success: true,
                data: historyItem
            });
        } catch (error) {
            console.error('添加历史记录失败:', error);
            res.status(500).json({
                success: false,
                error: '添加历史记录失败'
            });
        }
    }

    // 删除历史记录
    async deleteHistory(req, res) {
        try {
            const { id } = req.params;
            const success = await this.historyManager.deleteHistoryItem(id);
            
            if (!success) {
                return res.status(404).json({
                    success: false,
                    error: '历史记录不存在'
                });
            }
            
            res.json({
                success: true,
                message: '历史记录已删除'
            });
        } catch (error) {
            console.error('删除历史记录失败:', error);
            res.status(500).json({
                success: false,
                error: '删除历史记录失败'
            });
        }
    }

    // 清除历史记录
    async clearHistory(req, res) {
        try {
            const options = {
                type: req.query.type,
                beforeDate: req.query.beforeDate ? new Date(req.query.beforeDate) : undefined
            };
            
            await this.historyManager.clearHistory(options);
            
            res.json({
                success: true,
                message: '历史记录已清除'
            });
        } catch (error) {
            console.error('清除历史记录失败:', error);
            res.status(500).json({
                success: false,
                error: '清除历史记录失败'
            });
        }
    }

    // 搜索历史记录
    async searchHistory(req, res) {
        try {
            const { q: query, ...options } = req.query;
            
            if (!query) {
                return res.status(400).json({
                    success: false,
                    error: '搜索查询不能为空'
                });
            }
            
            const result = await this.historyManager.searchHistory(query, options);
            
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('搜索历史记录失败:', error);
            res.status(500).json({
                success: false,
                error: '搜索历史记录失败'
            });
        }
    }

    // 获取统计信息
    async getStats(req, res) {
        try {
            const stats = await this.historyManager.getStatistics();
            
            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('获取统计信息失败:', error);
            res.status(500).json({
                success: false,
                error: '获取统计信息失败'
            });
        }
    }

    // 导出历史记录
    async exportHistory(req, res) {
        try {
            const options = {
                format: req.query.format || 'json',
                type: req.query.type,
                startDate: req.query.startDate ? new Date(req.query.startDate) : undefined,
                endDate: req.query.endDate ? new Date(req.query.endDate) : undefined
            };
            
            const exportData = await this.historyManager.exportHistory(options);
            
            // 设置响应头
            let contentType = 'application/json';
            let filename = `history.${options.format}`;
            
            switch (options.format) {
                case 'csv':
                    contentType = 'text/csv';
                    filename = `history.csv`;
                    break;
                case 'html':
                    contentType = 'text/html';
                    filename = `history.html`;
                    break;
                default:
                    contentType = 'application/json';
                    filename = `history.json`;
            }
            
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            
            res.send(exportData);
        } catch (error) {
            console.error('导出历史记录失败:', error);
            res.status(500).json({
                success: false,
                error: '导出历史记录失败'
            });
        }
    }

    getRouter() {
        return router;
    }
}

module.exports = HistoryRoutes;