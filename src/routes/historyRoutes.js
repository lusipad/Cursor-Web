// 历史记录路由
const express = require('express');
const router = express.Router();

class HistoryRoutes {
    constructor(historyManager) {
        this.historyManager = historyManager;
        this._inflightMsg = new Map();
        this.setupRoutes();
    }

    // 解析实例 openPath（支持根目录或 config/instances.json）
    resolveInstanceOpenPath(instanceId){
        try{
            if (!instanceId) return null;
            const fs = require('fs');
            const path = require('path');
            const cfg = require('../config');
            const primary = path.isAbsolute(cfg.instances?.file || '')
              ? cfg.instances.file
              : path.join(process.cwd(), cfg.instances?.file || 'instances.json');
            let file = primary;
            if (!fs.existsSync(file)) {
              const fallback = path.join(process.cwd(), 'config', 'instances.json');
              if (fs.existsSync(fallback)) file = fallback; else return null;
            }
            const items = JSON.parse(fs.readFileSync(file,'utf8'));
            const arr = Array.isArray(items) ? items : [];
            const found = arr.find(x => String(x.id||'') === String(instanceId));
            const openPath = (found && typeof found.openPath === 'string' && found.openPath.trim()) ? found.openPath.trim() : null;
            return openPath || null;
        }catch{
            return null;
        }
    }

    setupRoutes() {
        // 获取历史记录列表
        router.get('/history', this.getHistory.bind(this));
        
        // 获取统计信息
        router.get('/history/stats', this.getStats.bind(this));
        
        // 调试信息
        router.get('/history/debug', this.getDebugInfo.bind(this));
        // 原始气泡采样（调试用）
        router.get('/history/raw-bubbles', this.getRawBubbles.bind(this));
        // 读取 Cursor 数据根（只读，来源于自动探测或环境变量）
        router.get('/history/cursor-path', this.getCursorRoot.bind(this));
        // 清空后端提取缓存
        router.get('/history/cache/clear', this.clearCache.bind(this));
        // 获取唯一项目列表（用于对齐 cursor-view-main 的项目视图）
        router.get('/history/projects', this.getProjects.bind(this));
        
        // 搜索历史记录
        router.get('/history/search', this.searchHistory.bind(this));
        
        // 导出历史记录
        router.get('/history/export', this.exportHistory.bind(this));
        
        // 获取单个历史记录
        router.get('/history/:id', this.getHistoryItem.bind(this));
        // 分页读取单个会话消息
        router.get('/history/:id/messages', this.getHistoryMessagesPaged.bind(this));
        
        // 添加历史记录
        router.post('/history', this.addHistory.bind(this));
        
        // 删除历史记录
        router.delete('/history/:id', this.deleteHistory.bind(this));
        
        // 清除历史记录
        router.delete('/history', this.clearHistory.bind(this));
    }

    // 原始 bubble 调试采样：用于观察是否存在可区分 thinking/最终 的字段
    async getRawBubbles(req, res){
        try{
            const path = require('path');
            const fs = require('fs');
            let Database = null;
            try { Database = require('better-sqlite3'); } catch { Database = null; }
            if (!Database) return res.status(500).json({ success:false, error:'better-sqlite3 not available' });

            const limit = Math.max(1, Math.min(parseInt(req.query.limit)||50, 200));
            const preview = Math.max(0, Math.min(parseInt(req.query.preview)||400, 4000));
            const scope = String(req.query.scope||'global').toLowerCase(); // global|workspaces|all
            const like = String(req.query.like||'').trim();
            const includeRaw = /^(1|true)$/i.test(String(req.query.raw||''));

            const cursorRoot = this.historyManager.cursorStoragePath;
            const items = [];

            const extractItem = (dbPath, row) => {
                let parsed = null; try { parsed = row && row.value ? JSON.parse(row.value) : null; } catch { parsed = null; }
                let role = 'assistant'; let text = '';
                try{
                    if (this.historyManager && typeof this.historyManager.extractBubbleTextAndRole === 'function'){
                        const r = this.historyManager.extractBubbleTextAndRole(parsed || {});
                        role = r.role || 'assistant'; text = r.text || '';
                    } else {
                        role = (parsed?.role==='user'||parsed?.type===1)?'user':'assistant';
                        text = String(parsed?.text||parsed?.content||parsed?.richText||parsed?.markdown||parsed?.md||parsed?.message?.content||parsed?.data?.content||parsed?.payload?.content||'');
                    }
                }catch{}
                const thinkTag = /<think>[\s\S]*?<\/think>/i.test(String(text||'')) || /<think>[\s\S]*?<\/think>/i.test(String(row?.value||''));
                const headThink = /^\s*(思考|思考过程|推理|反思|Reasoning|Thoughts?|CoT)\s*[:：]/i.test(String(text||''));
                const headFinal = /^\s*(最终|答案|结论|结果|Final|Answer|Response|Conclusion)\s*[:：]/i.test(String(text||''));
                const ts = parsed?.cTime || parsed?.timestamp || parsed?.time || parsed?.createdAt || parsed?.lastUpdatedAt || null;
                const keyParts = String(row.key||'').split(':');
                const composerId = keyParts.length>=3 ? keyParts[1] : null;
                return {
                    db: dbPath,
                    key: row.key,
                    composerId,
                    role,
                    type: parsed?.type || null,
                    timestamp: ts || null,
                    textPreview: String(text||'').slice(0, preview),
                    flags: { thinkTag, headThink, headFinal },
                    rawPreview: includeRaw ? String(row.value||'').slice(0, Math.max(200, preview)) : undefined
                };
            };

            const scanDb = (dbPath, want, whereLike) => {
                try{
                    if (!fs.existsSync(dbPath)) return;
                    const db = new Database(dbPath, { readonly: true });
                    try{
                        const has = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cursorDiskKV'").get();
                        if (!has) return;
                        const sql = whereLike ?
                          "SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%' AND value LIKE ? LIMIT ?" :
                          "SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%' LIMIT ?";
                        const rows = whereLike ? db.prepare(sql).all(`%${whereLike}%`, want) : db.prepare(sql).all(want);
                        for (const r of rows){
                            if (items.length >= limit) break;
                            items.push(extractItem(dbPath, r));
                        }
                    } finally { try { db.close(); } catch {} }
                } catch {}
            };

            // global
            if (scope==='global' || scope==='all'){
                const globalDb = path.join(cursorRoot, 'User', 'globalStorage', 'state.vscdb');
                scanDb(globalDb, limit - items.length, like || null);
            }
            // workspaces
            if ((scope==='workspaces' || scope==='all') && items.length < limit){
                try{
                    const wsRoot = path.join(cursorRoot, 'User', 'workspaceStorage');
                    const dirs = fs.existsSync(wsRoot) ? fs.readdirSync(wsRoot, { withFileTypes: true }) : [];
                    for (const d of dirs){
                        if (!d.isDirectory()) continue;
                        const dbp = path.join(wsRoot, d.name, 'state.vscdb');
                        scanDb(dbp, Math.max(1, limit - items.length), like || null);
                        if (items.length >= limit) break;
                    }
                }catch{}
            }

            res.json({ success:true, data: { scopeUsed: scope, count: items.length, items } });
        }catch(err){
            res.status(500).json({ success:false, error: err?.message || 'raw-bubbles failed' });
        }
    }

    // 获取历史记录列表（含 ETag/Cache-Control）
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
                sortOrder: req.query.sortOrder || 'desc',
                includeUnmapped: req.query.includeUnmapped,
                mode: req.query.mode,
                summary: (String(req.query.summary || '').trim() === '1' || String(req.query.summary || '').trim().toLowerCase() === 'true'),
                instanceId: req.query.instance || null,
                nocache: req.query.nocache || null,
                maxAgeMs: req.query.maxAgeMs || null
            };

            // 缓存控制：支持 nocache/maxAgeMs
            if (options.nocache) {
                try { this.historyManager.clearCache?.(); } catch {}
            }
            const originalCacheTimeout = this.historyManager.cacheTimeout;
            if (options.maxAgeMs) {
                const n = Math.max(0, Math.min(Number(options.maxAgeMs) || 0, 10000));
                if (n > 0) this.historyManager.cacheTimeout = n;
            }

            // 实例 openPath 过滤
            if (options.instanceId) {
                const openPath = this.resolveInstanceOpenPath(options.instanceId);
                if (openPath) options.filterOpenPath = openPath;
            }

            // HTTP 缓存：ETag
            try{
                const token = (this.historyManager.getSignatureToken && typeof this.historyManager.getSignatureToken === 'function') ? this.historyManager.getSignatureToken() : 'h';
                const etagKey = JSON.stringify({
                    kind:'list',
                    limit: options.limit,
                    offset: options.offset,
                    type: options.type || '',
                    startDate: options.startDate ? Number(options.startDate) : null,
                    endDate: options.endDate ? Number(options.endDate) : null,
                    search: options.searchQuery || '',
                    sortBy: options.sortBy,
                    sortOrder: options.sortOrder,
                    includeUnmapped: !!options.includeUnmapped,
                    mode: options.mode || '',
                    instanceId: options.instanceId || '',
                    t: token
                });
                const etag = 'W/"' + Buffer.from(etagKey).toString('base64').slice(0,48) + '"';
                if (req.headers['if-none-match'] && req.headers['if-none-match'] === etag){
                    res.status(304);
                    res.setHeader('ETag', etag);
                    res.setHeader('Cache-Control', 'public, max-age=5, stale-while-revalidate=60');
                    return res.end();
                }
                // 计算数据
                let result = await this.historyManager.getHistory(options);
                // 再次兜底按 openPath 过滤，确保 CV 模式与非 CV 模式统一
                if (options.filterOpenPath && result && Array.isArray(result.items)) {
                    const norm = (p)=>{ try{ return String(p||'').replace(/\\/g,'/'); }catch{ return ''; } };
                    const toCv = (p)=>{
                        const n = norm(p).toLowerCase();
                        const withSlash = n.startsWith('/') ? n : ('/' + n);
                        return withSlash.replace(/^\/([a-z]):\//, '/$1%3a/');
                    };
                    const base = norm(options.filterOpenPath).toLowerCase();
                    const baseCv = toCv(options.filterOpenPath);
                    const ensureSlash = (s)=> s.endsWith('/')?s:(s+'/');
                    const isPrefix = (root)=>{
                        if (!root) return false;
                        const r1 = norm(root).toLowerCase();
                        const r2 = toCv(root);
                        const ok1 = r1 === base || r1.startsWith(ensureSlash(base)) || base.startsWith(ensureSlash(r1));
                        const ok2 = r2 === baseCv || r2.startsWith(ensureSlash(baseCv)) || baseCv.startsWith(ensureSlash(r2));
                        return ok1 || ok2;
                    };
                    result = { ...result, items: result.items.filter(it => {
                        const root = it?.project?.rootPath || '';
                        if (!root || root === '(unknown)') return true; // 放宽：未知根路径保留，避免误过滤
                        return isPrefix(root);
                    }) };
                }
                res.setHeader('ETag', etag);
                res.setHeader('Cache-Control', 'public, max-age=5, stale-while-revalidate=60');
                return res.json({ success: true, data: result });
            }catch{
                // 失败回退：不使用 ETag
            }

            let result = await this.historyManager.getHistory(options);
            // 再次兜底按 openPath 过滤，确保 CV 模式与非 CV 模式统一
            if (options.filterOpenPath && result && Array.isArray(result.items)) {
                const norm = (p)=>{ try{ return String(p||'').replace(/\\/g,'/'); }catch{ return ''; } };
                const toCv = (p)=>{
                    const n = norm(p).toLowerCase();
                    const withSlash = n.startsWith('/') ? n : ('/' + n);
                    return withSlash.replace(/^\/([a-z]):\//, '/$1%3a/');
                };
                const base = norm(options.filterOpenPath).toLowerCase();
                const baseCv = toCv(options.filterOpenPath);
                const ensureSlash = (s)=> s.endsWith('/')?s:(s+'/');
                const isPrefix = (root)=>{
                    if (!root) return false;
                    const r1 = norm(root).toLowerCase();
                    const r2 = toCv(root);
                    const ok1 = r1 === base || r1.startsWith(ensureSlash(base)) || base.startsWith(ensureSlash(r1));
                    const ok2 = r2 === baseCv || r2.startsWith(ensureSlash(baseCv)) || baseCv.startsWith(ensureSlash(r2));
                    return ok1 || ok2;
                };
                result = { ...result, items: result.items.filter(it => {
                    const root = it?.project?.rootPath || '';
                    if (!root || root === '(unknown)') return true; // 放宽：未知根路径保留，避免误过滤
                    return isPrefix(root);
                }) };
            }

            // 还原缓存超时
            if (options.maxAgeMs) this.historyManager.cacheTimeout = originalCacheTimeout;
            
            res.json({ success: true, data: result });
        } catch (error) {
            console.error('获取历史记录失败:', error);
            res.status(500).json({
                success: false,
                error: '获取历史记录失败'
            });
        }
    }

    // 获取单个历史记录（含 ETag/Cache-Control）
    async getHistoryItem(req, res) {
        try {
            const { id } = req.params;
            const debugOn = (String(req.query.debug||'').toLowerCase()==='1'||String(req.query.debug||'').toLowerCase()==='true');
            const t0 = Date.now();
            const options = { mode: req.query.mode, includeUnmapped: req.query.includeUnmapped, segmentMinutes: req.query.segmentMinutes, instanceId: req.query.instance || null, maxAgeMs: req.query.maxAgeMs || null, debug: debugOn };
            let t1 = Date.now(); let t2 = null; let t3 = null;
            if (options.instanceId) {
                const openPath = this.resolveInstanceOpenPath(options.instanceId);
                if (openPath) options.filterOpenPath = openPath;
            }
            t2 = Date.now();
            // 先做 ETag 协商
            try{
                const token = (this.historyManager.getSignatureToken && typeof this.historyManager.getSignatureToken === 'function') ? this.historyManager.getSignatureToken() : 'h';
                const etagKey = JSON.stringify({ kind:'detail', id, mode: options.mode||'', instanceId: options.instanceId||'', t: token });
                const etag = 'W/"' + Buffer.from(etagKey).toString('base64').slice(0,48) + '"';
                if (req.headers['if-none-match'] && req.headers['if-none-match'] === etag){
                    res.status(304);
                    res.setHeader('ETag', etag);
                    res.setHeader('Cache-Control', 'public, max-age=5, stale-while-revalidate=60');
                    return res.end();
                }
                // 首屏仅取元数据，避免全量消息
                const metaOpt = { ...options, summary: true };
                const item0 = await this.historyManager.getHistoryItem(id, metaOpt);
                if (!item0) {
                    if (debugOn) console.warn('detail not found (fast path miss):', id);
                    return res.status(404).json({ success:false, error:'历史记录不存在' });
                }
                const resp0 = { success:true, data: item0 };
                if (debugOn) {
                    const t3 = Date.now();
                    resp0.debug = {
                        timings: { receivedMs: t0, afterParseMs: 0, afterOpenPathMs: 0, managerCallMs: t3 - t0, totalMs: t3 - t0 },
                        messageCount: Array.isArray(item0?.messages) ? item0.messages.length : 0,
                        projectRoot: item0?.project?.rootPath || null,
                        dataSource: item0?.dataSource || null
                    };
                }
                res.setHeader('ETag', etag);
                res.setHeader('Cache-Control', 'public, max-age=5, stale-while-revalidate=60');
                return res.json(resp0);
            }catch{}

            const item = await this.historyManager.getHistoryItem(id, options);
            if (!item) {
                // 避免阻塞：不要触发全量兜底，直接返回 404
                if (debugOn) console.warn('detail not found (fast path miss):', id);
            }
            t3 = Date.now();
            
            if (!item) {
                return res.status(404).json({
                    success: false,
                    error: '历史记录不存在'
                });
            }
            
            const resp = { success: true, data: item };
            if (debugOn) {
                resp.debug = {
                    timings: {
                        receivedMs: t0,
                        afterParseMs: t1 - t0,
                        afterOpenPathMs: t2 - t0,
                        managerCallMs: t3 - t2,
                        totalMs: t3 - t0
                    },
                    messageCount: Array.isArray(item?.messages) ? item.messages.length : 0,
                    projectRoot: item?.project?.rootPath || null,
                    dataSource: item?.dataSource || null
                };
            }
            res.json(resp);
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
            const options = {
                includeUnmapped: req.query.includeUnmapped,
                segmentMinutes: req.query.segmentMinutes,
                instanceId: req.query.instance || null
            };
            if (options.instanceId) {
                const openPath = this.resolveInstanceOpenPath(options.instanceId);
                if (openPath) options.filterOpenPath = openPath;
            }
            const stats = await this.historyManager.getStatistics(options);
            
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
                endDate: req.query.endDate ? new Date(req.query.endDate) : undefined,
                instanceId: req.query.instance || null
            };
            if (options.instanceId) {
                const openPath = this.resolveInstanceOpenPath(options.instanceId);
                if (openPath) options.filterOpenPath = openPath;
            }
            
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

    // 获取项目汇总
    async getProjects(req, res) {
        try {
            const opts = { instanceId: req.query.instance || null };
            if (opts.instanceId) {
                const openPath = this.resolveInstanceOpenPath(opts.instanceId);
                if (openPath) opts.filterOpenPath = openPath;
            }
            const projects = await this.historyManager.getProjectsSummary(opts);
            res.json({ success: true, data: projects });
        } catch (error) {
            console.error('获取项目列表失败:', error);
            res.status(500).json({ success: false, error: '获取项目列表失败' });
        }
    }

    // 清空缓存
    async clearCache(req, res){
        try{
            if (this.historyManager?.clearCache) this.historyManager.clearCache();
            res.json({success:true, message:'cache cleared'});
        }catch(err){
            res.status(500).json({success:false, error:'clear cache failed'});
        }
    }

    // 调试信息端点
    async getDebugInfo(req, res) {
        try {
            console.log('📊 获取调试信息...');
            
            const debugInfo = {
                timestamp: new Date().toISOString(),
                cursorPath: this.historyManager.cursorStoragePath,
                platform: process.platform
            };

            // 检查路径是否存在
            const fs = require('fs');
            const path = require('path');
            
            const globalDbPath = path.join(this.historyManager.cursorStoragePath, 'User/globalStorage/state.vscdb');
            debugInfo.globalDbExists = fs.existsSync(globalDbPath);
            debugInfo.globalDbPath = globalDbPath;
            
            if (debugInfo.globalDbExists) {
                const stats = fs.statSync(globalDbPath);
                debugInfo.globalDbSize = stats.size;
                debugInfo.globalDbModified = stats.mtime;
            }

            // 尝试测试SQLite
            try {
                const Database = require('better-sqlite3');
                debugInfo.betterSqlite3Available = true;
                
                if (debugInfo.globalDbExists) {
                    const db = new Database(globalDbPath, { readonly: true });
                    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
                    debugInfo.tables = tables.map(t => t.name);
                    
                    if (tables.some(t => t.name === 'cursorDiskKV')) {
                        const bubbleCount = db.prepare("SELECT COUNT(*) as count FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'").get();
                        debugInfo.bubbleCount = bubbleCount.count;
                        
                        if (bubbleCount.count > 0) {
                            const sample = db.prepare("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%' LIMIT 1").get();
                            debugInfo.sampleBubble = {
                                key: sample.key,
                                valueLength: sample.value ? sample.value.length : 0,
                                valuePreview: sample.value ? sample.value.substring(0, 200) : null
                            };
                            // 额外：采样用户/助手各一条，便于排查结构
                            try {
                                const sampleUser = db.prepare("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%' AND value LIKE '%\"type\":1%' LIMIT 1").get();
                                if (sampleUser) debugInfo.sampleUserBubble = { key: sampleUser.key, valuePreview: sampleUser.value?.substring(0, 400) };
                            } catch {}
                            try {
                                const sampleAssistant = db.prepare("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%' AND value LIKE '%\"type\":2%' LIMIT 1").get();
                                if (sampleAssistant) debugInfo.sampleAssistantBubble = { key: sampleAssistant.key, valuePreview: sampleAssistant.value?.substring(0, 800) };
                            } catch {}

                            // 统计前 2000 条气泡的关键字段分布（conversationId、composerId 等）
                            try {
                                const rows = db.prepare("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%' LIMIT 2000").all();
                                const keyComposerSet = new Set();
                                const valueComposerSet = new Set();
                                const conversationIdSet = new Set();
                                const conversationAltSet = new Set();
                                let parsed = 0;
                                for (const r of rows) {
                                    const parts = typeof r.key === 'string' ? r.key.split(':') : [];
                                    if (parts.length >= 3) keyComposerSet.add(parts[1]);
                                    try {
                                        const v = JSON.parse(r.value);
                                        parsed++;
                                        const valComposer = v?.composerId || v?.composerID || v?.composer || v?.authorId || null;
                                        if (valComposer) valueComposerSet.add(String(valComposer));
                                        const conv = v?.conversationId || v?.conversationID || v?.conversation || v?.sessionId || v?.sessionID || v?.tabId || null;
                                        if (conv) conversationIdSet.add(String(conv));
                                        // 某些结构会把会话 ID 放在 message/conversation 字段里
                                        const conv2 = v?.message?.conversationId || v?.payload?.conversationId || null;
                                        if (conv2) conversationAltSet.add(String(conv2));
                                    } catch {}
                                }
                                debugInfo.sampleStats = {
                                    scanned: rows.length,
                                    parsed,
                                    uniqueKeyComposer: keyComposerSet.size,
                                    uniqueValueComposer: valueComposerSet.size,
                                    uniqueConversationId: conversationIdSet.size,
                                    uniqueConversationAlt: conversationAltSet.size
                                };
                            } catch {}
                        }
                    }
                    
                    db.close();
                }
            } catch (error) {
                debugInfo.betterSqlite3Available = false;
                debugInfo.betterSqlite3Error = error.message;
            }

            // 尝试调用实际的数据提取
            try {
                console.log('🔍 测试实际数据提取...');
                const chats = await this.historyManager.getChats();
                debugInfo.extractedChats = chats.length;
                debugInfo.extractionSuccess = true;
                
                if (chats.length > 0) {
                    debugInfo.sampleChat = {
                        sessionId: chats[0].sessionId,
                        messageCount: chats[0].messages.length,
                        projectName: chats[0].project?.name,
                        isRealData: chats[0].isRealData,
                        dataSource: chats[0].dataSource
                    };
                }
            } catch (error) {
                debugInfo.extractionSuccess = false;
                debugInfo.extractionError = error.message;
                debugInfo.extractionStack = error.stack;
            }

            res.json({
                success: true,
                data: debugInfo
            });
        } catch (error) {
            console.error('获取调试信息失败:', error);
            res.status(500).json({
                success: false,
                error: '获取调试信息失败',
                details: error.message
            });
        }
    }

    // 获取/设置 Cursor 根目录，便于与 cursor-view 对齐
    async getCursorRoot(req, res){
        try{
            res.json({success:true, data:{ cursorPath: this.historyManager.cursorStoragePath, env: process.env.CURSOR_STORAGE_PATH || null }});
        }catch(err){
            res.status(500).json({success:false, error: err.message});
        }
    }
    // 去掉设置能力

    // 分页消息（带 singleflight 与 ETag）
    async getHistoryMessagesPaged(req, res){
        try{
            const { id } = req.params;
            const offset = Math.max(0, parseInt(req.query.offset||0));
            const limit = Math.max(1, Math.min(parseInt(req.query.limit||200), 500));
            const cursorKey = typeof req.query.cursorKey === 'string' ? req.query.cursorKey : null;
            const sfKey = `${id}|${cursorKey||''}|${offset}|${limit}`;
            let promise = this._inflightMsg.get(sfKey);
            if (!promise){
                promise = this.historyManager.getHistoryMessagesPaged(id, { offset, limit, cursorKey });
                this._inflightMsg.set(sfKey, promise);
                promise.finally(()=>{ try{ this._inflightMsg.delete(sfKey); }catch{} });
            }
            const token = (this.historyManager.getSignatureToken && typeof this.historyManager.getSignatureToken === 'function') ? this.historyManager.getSignatureToken() : 'h';
            const etagKey = JSON.stringify({ id, offset, limit, cursorKey, t: token });
            const etag = 'W/"' + Buffer.from(etagKey).toString('base64').slice(0,48) + '"';
            if (req.headers['if-none-match'] && req.headers['if-none-match'] === etag) {
                res.status(304);
                res.setHeader('ETag', etag);
                res.setHeader('Cache-Control', 'public, max-age=5, stale-while-revalidate=60');
                return res.end();
            }
            const result = await promise;
            res.setHeader('ETag', etag);
            res.setHeader('Cache-Control', 'public, max-age=5, stale-while-revalidate=60');
            res.json({ success:true, data: result });
        }catch(err){
            res.status(500).json({ success:false, error: '分页消息获取失败' });
        }
    }

    getRouter() {
        return router;
    }
}

module.exports = HistoryRoutes;