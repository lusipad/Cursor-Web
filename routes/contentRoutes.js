// 内容相关路由
const express = require('express');
const serverConfig = require('../config/serverConfig');
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
        // 获取最新一条助手消息（轻量接口）
        router.get('/chats/latest', this.handleGetLatestAssistant.bind(this));
        // 根据 msgId 精确查找其后的第一条助手回复
        router.get('/chats/reply-for-msg', this.handleGetReplyForMsg.bind(this));
        // 强制立即扫描并返回 msgId 对应的助手回复（跳过缓存）
        router.get('/chats/force-reply', this.handleForceReply.bind(this));
        // 诊断：读取/切换 html_content 广播开关（仅用于调试页面）
        router.get('/debug/html-broadcast', this.handleToggleHtmlBroadcast.bind(this));
        
        // 获取单个聊天记录
        router.get('/chat/:sessionId', this.handleGetChat.bind(this));
        
        // 导出聊天记录
        router.get('/chat/:sessionId/export', this.handleExportChat.bind(this));
    }

    // 诊断：读取/切换 html_content 广播开关（仅用于调试页面）
    handleToggleHtmlBroadcast(req, res){
        try{
            const cfg = require('../config/serverConfig');
            const q = String(req.query.enable || '').trim();
            if (q === '1' || q === 'true') cfg.websocket.broadcastHtmlEnabled = true;
            else if (q === '0' || q === 'false') cfg.websocket.broadcastHtmlEnabled = false;
            res.json({ success:true, enabled: !!cfg.websocket.broadcastHtmlEnabled });
        }catch(e){ res.status(500).json({ success:false, error: e?.message||'toggle failed' }); }
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

            // 可选：广播给所有 WebSocket 客户端（默认关闭，仅调试用）
            if (serverConfig?.websocket?.broadcastHtmlEnabled) {
                this.websocketManager.broadcastToClients({
                    type: 'html_content',
                    data: data
                });
            }

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
            const options = {
                mode: req.query.mode,
                includeUnmapped: req.query.includeUnmapped,
                segmentMinutes: req.query.segmentMinutes,
                instanceId: req.query.instance || null
            };
            // 支持 nocache/maxAgeMs
            if (req.query.nocache) {
                try { this.historyManager.clearCache?.(); } catch {}
            }
            const originalCacheTimeout = this.historyManager.cacheTimeout;
            if (req.query.maxAgeMs) {
                const n = Math.max(0, Math.min(Number(req.query.maxAgeMs) || 0, 10000));
                this.historyManager.cacheTimeout = n; // 允许设为 0
            }

            // 解析实例 openPath 作为过滤条件
            if (options.instanceId) {
                try{
                    const fs = require('fs');
                    const path = require('path');
                    const cfg = require('../config');
                    const primary = path.isAbsolute(cfg.instances?.file || '') ? cfg.instances.file : path.join(process.cwd(), cfg.instances?.file || 'instances.json');
                    let file = primary;
                    if (!fs.existsSync(file)) {
                        const fallback = path.join(process.cwd(), 'config', 'instances.json');
                        if (fs.existsSync(fallback)) file = fallback; else file = null;
                    }
                    if (file) {
                        const arr = JSON.parse(fs.readFileSync(file,'utf8'));
                        const list = Array.isArray(arr) ? arr : [];
                        const found = list.find(x => String(x.id||'') === String(options.instanceId));
                        if (found && typeof found.openPath === 'string' && found.openPath.trim()) {
                            options.filterOpenPath = found.openPath.trim();
                        }
                    }
                }catch{}
            }

            const chats = await this.historyManager.getChats(options);
            if (req.query.maxAgeMs) this.historyManager.cacheTimeout = originalCacheTimeout;
            res.json(chats);
        } catch (error) {
            console.error('获取聊天记录失败：', error);
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
            console.log(`📄 获取聊天记录详情：${sessionId}`);
            const chat = await this.historyManager.getHistoryItem(sessionId);
            
            if (!chat) {
                return res.status(404).json({
                    error: '聊天记录不存在'
                });
            }
            
            res.json(chat);
        } catch (error) {
            console.error('获取聊天记录详情失败：', error);
            res.status(500).json({
                error: '获取聊天记录详情失败',
                message: error.message
            });
        }
    }

    // 获取最新一条助手消息（可按实例过滤）
    async handleGetLatestAssistant(req, res) {
        try {
            const options = {
                mode: req.query.mode,
                includeUnmapped: req.query.includeUnmapped,
                segmentMinutes: req.query.segmentMinutes,
                instanceId: req.query.instance || null
            };
            if (req.query.nocache) {
                try { this.historyManager.clearCache?.(); } catch {}
            }
            const originalCacheTimeout = this.historyManager.cacheTimeout;
            if (req.query.maxAgeMs) {
                const n = Math.max(0, Math.min(Number(req.query.maxAgeMs) || 0, 10000));
                this.historyManager.cacheTimeout = n; // 允许设为 0
            }

            // 若传入实例，解析 openPath 作为过滤条件（与 /chats 保持一致）
            if (options.instanceId) {
                try{
                    const fs = require('fs');
                    const path = require('path');
                    const cfg = require('../config');
                    const primary = path.isAbsolute(cfg.instances?.file || '') ? cfg.instances.file : path.join(process.cwd(), cfg.instances?.file || 'instances.json');
                    let file = primary;
                    if (!fs.existsSync(file)) {
                        const fallback = path.join(process.cwd(), 'config', 'instances.json');
                        if (fs.existsSync(fallback)) file = fallback; else file = null;
                    }
                    if (file) {
                        const arr = JSON.parse(fs.readFileSync(file,'utf8'));
                        const list = Array.isArray(arr) ? arr : [];
                        const found = list.find(x => String(x.id||'') === String(options.instanceId));
                        if (found && typeof found.openPath === 'string' && found.openPath.trim()) {
                            options.filterOpenPath = found.openPath.trim();
                        }
                    }
                }catch{}
            }

            const chats = await this.historyManager.getChats(options);
            if (req.query.maxAgeMs) this.historyManager.cacheTimeout = originalCacheTimeout;

            const okRoles = new Set(['assistant','assistant_bot']);
            let latest = null;
            let latestSession = null;
            for (const s of (Array.isArray(chats) ? chats : [])) {
                const msgs = Array.isArray(s.messages) ? s.messages : [];
                for (let i = msgs.length - 1; i >= 0; i--) {
                    const m = msgs[i];
                    if (m && okRoles.has(String(m.role))) {
                        const score = Number(m.timestamp || s.lastUpdatedAt || s.updatedAt || 0);
                        if (!latest || score > latest.score) {
                            latest = { msg: m, score };
                            latestSession = s;
                        }
                        break;
                    }
                }
            }

            if (!latest) {
                return res.json({ success: true, data: null });
            }

            const payload = {
                sessionId: latestSession?.sessionId || latestSession?.session_id || null,
                message: latest.msg
            };
            res.json({ success: true, data: payload });
        } catch (error) {
            console.error('获取最新助手消息失败：', error);
            res.status(500).json({ error: '获取最新助手消息失败', message: error.message });
        }
    }

    // 根据 msgId 在同一会话中定位“用户消息之后的第一条助手回复”
    async handleGetReplyForMsg(req, res) {
        try {
            const msgId = String(req.query.msgId || req.query.msg || '').trim();
            if (!msgId) return res.json({ success: true, data: null });

            const options = {
                mode: req.query.mode,
                includeUnmapped: req.query.includeUnmapped,
                segmentMinutes: req.query.segmentMinutes,
                instanceId: req.query.instance || null
            };
            if (req.query.nocache) { try { this.historyManager.clearCache?.(); } catch {} }
            const originalCacheTimeout = this.historyManager.cacheTimeout;
            if (req.query.maxAgeMs) {
                const n = Math.max(0, Math.min(Number(req.query.maxAgeMs) || 0, 10000));
                this.historyManager.cacheTimeout = n;
            }

            // 解析实例 → openPath 过滤（与其他接口一致）
            if (options.instanceId) {
                try{
                    const fs = require('fs');
                    const path = require('path');
                    const cfg = require('../config');
                    const primary = path.isAbsolute(cfg.instances?.file || '') ? cfg.instances.file : path.join(process.cwd(), cfg.instances?.file || 'instances.json');
                    let file = primary;
                    if (!fs.existsSync(file)) {
                        const fallback = path.join(process.cwd(), 'config', 'instances.json');
                        if (fs.existsSync(fallback)) file = fallback; else file = null;
                    }
                    if (file) {
                        const arr = JSON.parse(fs.readFileSync(file,'utf8'));
                        const list = Array.isArray(arr) ? arr : [];
                        const found = list.find(x => String(x.id||'') === String(options.instanceId));
                        if (found && typeof found.openPath === 'string' && found.openPath.trim()) {
                            options.filterOpenPath = found.openPath.trim();
                        }
                    }
                }catch{}
            }

            const chats = await this.historyManager.getChats(options);
            if (req.query.maxAgeMs) this.historyManager.cacheTimeout = originalCacheTimeout;

            const marker = `<!--#msg:${msgId}-->`;
            const okRoles = new Set(['assistant','assistant_bot']);
            let sessionId = null; let reply = null;
            for (const s of (Array.isArray(chats) ? chats : [])){
                const msgs = Array.isArray(s.messages) ? s.messages : [];
                const idx = msgs.findIndex(m => typeof (m?.content||m?.text||'') === 'string' && (m.content||m.text||'').includes(marker));
                if (idx === -1) continue;
                for (let i = idx + 1; i < msgs.length; i++){
                    const m = msgs[i];
                    if (m && okRoles.has(String(m.role))) { reply = m; sessionId = s.sessionId || s.session_id || null; break; }
                }
                if (reply) break;
            }

            if (!reply) return res.json({ success: true, data: null });
            return res.json({ success: true, data: { sessionId, message: reply } });
        } catch (error) {
            console.error('根据 msgId 查找助手回复失败:', error);
            res.status(500).json({ error: 'reply-for-msg failed', message: error.message });
        }
    }

    // 强制扫描数据库，直接返回与 msgId 对应的助手回复（完全跳过缓存）
    async handleForceReply(req, res){
        try{
            const msgId = String(req.query.msgId || '').trim();
            if (!msgId){ return res.json({ success:true, data: null }); }
            const options = { instanceId: req.query.instance || null };
            if (req.query.instance){
                try{
                    const fs = require('fs');
                    const path = require('path');
                    const cfg = require('../config');
                    let file = path.isAbsolute(cfg.instances?.file || '') ? cfg.instances.file : path.join(process.cwd(), cfg.instances?.file || 'instances.json');
                    if (!fs.existsSync(file)){
                        const fb = path.join(process.cwd(), 'config', 'instances.json');
                        if (fs.existsSync(fb)) file = fb; else file = null;
                    }
                    if (file){
                        const arr = JSON.parse(fs.readFileSync(file,'utf8'));
                        const found = (Array.isArray(arr)?arr:[]).find(x=> String(x.id||'')===String(options.instanceId));
                        if (found && found.openPath) options.filterOpenPath = found.openPath.trim();
                    }
                }catch{}
            }
            // 跳过缓存：直接将 cacheTimeout 设为 0 并清缓存
            try{ this.historyManager.clearCache?.(); }catch{}
            const originalCacheTimeout = this.historyManager.cacheTimeout;
            this.historyManager.cacheTimeout = 0;
            const chats = await this.historyManager.getChats(options);
            this.historyManager.cacheTimeout = originalCacheTimeout;
            const marker = `<!--#msg:${msgId}-->`;
            const okRoles = new Set(['assistant','assistant_bot']);
            for (const s of (Array.isArray(chats)?chats:[])){
                const msgs = Array.isArray(s.messages)?s.messages:[];
                const idx = msgs.findIndex(m => typeof (m?.content||m?.text||'') === 'string' && (m.content||m.text||'').includes(marker));
                if (idx === -1) continue;
                for (let i = idx+1; i < msgs.length; i++){
                    const m = msgs[i];
                    if (m && okRoles.has(String(m.role))){
                        return res.json({ success:true, data:{ sessionId: s.sessionId || s.session_id || null, message: m }});
                    }
                }
            }
            return res.json({ success:true, data: null });
        }catch(err){
            console.error('force-reply failed:', err);
            res.status(500).json({ success:false, error: err.message });
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
            console.error('导出聊天记录失败：', error);
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
