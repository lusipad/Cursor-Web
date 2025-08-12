// Cursor历史记录管理器 - 真实数据版本
const fs = require('fs');
const path = require('path');
const os = require('os');

class CursorHistoryManager {
    constructor() {
        this.cursorStoragePath = this.getCursorStoragePath();
        this.cachedHistory = null;
        this.lastCacheTime = 0;
        this.cacheTimeout = 3000; // 默认 3 秒缓存，前端可通过 maxAgeMs 调整
        this.sqliteEngine = null;
        this._historyCache = new Map();
        this._historyItemCache = new Map(); // sessionId -> { ts, item }
        this._sessionDbIndex = new Map();   // sessionId -> { dbPath, project, ts }
        // 对齐 cursor-view-main 的项目提取与分组表现：
        // - 不做 Git 根提升
        // - 不做容器目录细化
        // - history.entries 中的路径保持原始编码（如 /d%3A/...）用于项目根
        this.alignCursorViewMain = true;
        
        console.log(`📁 Cursor数据路径: ${this.cursorStoragePath}`);
        this.initializeSQLiteEngine();
        // 启动后延迟构建一次索引，并每 60s 增量刷新，降低首次详情耗时
        try { this.scheduleSessionIndexRebuild(); } catch {}
    }

    // ====== cursor-view 等价实现（提取口径完全对齐） ======
    getChatsCursorView(summary = false) {
        try {
            const out = this.cvExtractChats(summary);
            // 格式化为前端易用结构（与 cursor-view 的 format_chat_for_frontend 对齐）
            return out.map(c => this.cvFormatChat(c));
        } catch (e) {
            console.log('❌ getChatsCursorView 失败:', e.message);
            return [];
        }
    }

    cvExtractChats(summary = false) {
        const pathLib = require('path');
        const fsLib = require('fs');
        const out = [];
        const wsProj = new Map();           // wsId -> {name, rootPath}
        const compMeta = new Map();         // composerId -> {title, createdAt, lastUpdatedAt}
        const comp2ws = new Map();          // composerId -> wsId
        const sessions = new Map();         // composerId -> {messages:[], db_path}

        const pushMsg = (cid, role, text, dbPath, ts) => {
            if (!cid || !text) return;
            if (!sessions.has(cid)) sessions.set(cid, { messages: [], db_path: dbPath || undefined });
            const s = sessions.get(cid);
            s.messages.push({ role, content: String(text), timestamp: ts || null });
            if (!s.db_path && dbPath) s.db_path = dbPath;
        };

        // 遍历 workspace DB，构建项目与 comp 元信息，并从 chatdata/composerData 累积消息
        try {
            const workspaces = this.findWorkspaceDatabases();
            for (const ws of workspaces) {
                // findWorkspaceDatabases() 返回 { workspaceDb, workspaceId }
                const wsId = (ws && (ws.workspaceId || ws.id)) || ws;
                const dbPath = (ws && (ws.workspaceDb || ws.dbPath)) || (typeof ws === 'string' ? ws : (ws && (ws.workspaceDb || ws.db)));
                if (!dbPath || !fsLib.existsSync(dbPath)) continue;

                const Database = require('better-sqlite3');
                const db = new Database(dbPath, { readonly: true });
                try {
                    // 1) 项目根：ItemTable['history.entries'] 的 editor.resource file:/// 路径求公共前缀
                    //    失败则用 debug.selectedroot 兜底；若仍然过浅/未知，再用“众数根”作为最后兜底
                    let project = { name: '(unknown)', rootPath: '(unknown)' };
                    try {
                        const row = db.prepare("SELECT value FROM ItemTable WHERE key='history.entries'").get();
                        const entries = row && row.value ? JSON.parse(row.value) : [];
                        const paths = [];
                        for (const e of entries) {
                            const r = e?.editor?.resource || '';
                            if (typeof r === 'string' && r.startsWith('file:///')) paths.push(r.slice('file:///'.length));
                        }
                        if (paths.length > 0) {
                            const pref = this.cvLongestCommonPrefix(paths);
                            const last = pref.lastIndexOf('/');
                            const root = last > 0 ? pref.slice(0, last) : pref;
                            const name = this.cvExtractProjectNameFromPath(root);
                            project = { name: name || '(unknown)', rootPath: '/' + root.replace(/^\/+/, '') };
                        }
                    } catch {}
                    // 兜底：debug.selectedroot（cursor-view 的后备来源）
                    try {
                        if (!project || !project.rootPath || project.rootPath === '(unknown)' || project.rootPath === '/') {
                            const rowSel = db.prepare("SELECT value FROM ItemTable WHERE key='debug.selectedroot'").get();
                            const sel = rowSel && rowSel.value ? JSON.parse(rowSel.value) : null;
                            if (typeof sel === 'string' && sel.startsWith('file:///')) {
                                const root = sel.slice('file:///'.length);
                                const name = this.cvExtractProjectNameFromPath(root);
                                project = { name: name || '(unknown)', rootPath: '/' + String(root).replace(/^\/+/, '') };
                            }
                        }
                    } catch {}
                    // 进一步兜底：若根仍无效或仅有盘符（如 /d%3A），尝试根据文件样本计算“众数根”
                    try {
                        const shallow = /^\/[A-Za-z]%3A\/?$/.test(project?.rootPath||'') || project?.rootPath === '/' || !project?.rootPath;
                        if (shallow) {
                            const major = this.computeWorkspaceMajorRoot(dbPath);
                            if (major && major.rootPath && !/^\/[A-Za-z]%3A\/?$/.test(major.rootPath) && major.rootPath !== '/') {
                                project = { name: major.name || this.extractProjectNameFromPath(major.rootPath), rootPath: major.rootPath };
                            }
                        }
                    } catch {}
                    wsProj.set(wsId, project);

                    // 2) comp_meta：ItemTable['composer.composerData'] 与 chatdata.tabs 的 tabId
                    try {
                        const r = db.prepare("SELECT value FROM ItemTable WHERE key='composer.composerData'").get();
                        const cd = r && r.value ? JSON.parse(r.value) : {};
                        for (const c of cd.allComposers || []) {
                            const cid = c.composerId; if (!cid) continue;
                            compMeta.set(cid, { title: c.name || '(untitled)', createdAt: c.createdAt, lastUpdatedAt: c.lastUpdatedAt });
                            comp2ws.set(cid, wsId);
                        }
                    } catch {}
                    try {
                        const r = db.prepare("SELECT value FROM ItemTable WHERE key='workbench.panel.aichat.view.aichat.chatdata'").get();
                        const pane = r && r.value ? JSON.parse(r.value) : {};
                        for (const tab of pane.tabs || []) {
                            const tid = tab.tabId; if (!tid) continue;
                            if (!compMeta.has(tid)) compMeta.set(tid, { title: `Chat ${String(tid).slice(0,8)}`, createdAt: null, lastUpdatedAt: null });
                            comp2ws.set(tid, wsId);
                        }
                    } catch {}

                    // 3) 累积消息：chatdata.tabs[].bubbles[] 与 composer.composerData.conversation/messages
                    if (!summary) {
                    try {
                        const r = db.prepare("SELECT value FROM ItemTable WHERE key='workbench.panel.aichat.view.aichat.chatdata'").get();
                        const pane = r && r.value ? JSON.parse(r.value) : {};
                        for (const tab of pane.tabs || []) {
                            const tid = tab.tabId || 'unknown';
                            for (const b of tab.bubbles || []) {
                                const t = typeof b.text === 'string' ? b.text : (typeof b.content === 'string' ? b.content : '');
                                if (!t) continue;
                                const role = (b.type === 'user' || b.type === 1) ? 'user' : 'assistant';
                                const ts = b?.cTime || b?.timestamp || b?.time || b?.createdAt || b?.lastUpdatedAt || tab?.lastUpdatedAt || tab?.createdAt || null;
                                pushMsg(tid, role, t, dbPath, ts);
                            }
                        }
                    } catch {}
                    }
                    if (!summary) {
                    try {
                        const r = db.prepare("SELECT value FROM ItemTable WHERE key='composer.composerData'").get();
                        const cd = r && r.value ? JSON.parse(r.value) : {};
                        for (const c of cd.allComposers || []) {
                            const cid = c.composerId || 'unknown';
                            for (const m of c.messages || []) {
                                const role = m.role || 'assistant';
                                const t = m.content || m.text || '';
                                const ts = m?.timestamp || m?.time || m?.createdAt || m?.lastUpdatedAt || c?.lastUpdatedAt || c?.createdAt || null;
                                if (t) pushMsg(cid, role, t, dbPath, ts);
                            }
                        }
                    } catch {}
                    }
                } finally { try { db.close(); } catch {} }
            }
        } catch {}

        if (!summary) {
        // 读取全局 globalStorage：cursorDiskKV['bubbleId:%'] / 'composerData:%' 与 ItemTable chatdata
        try {
            const pathLib = require('path');
            const fsLib = require('fs');
            const globalDb = pathLib.join(this.cursorStoragePath, 'User', 'globalStorage', 'state.vscdb');
            if (fsLib.existsSync(globalDb)) {
                const Database = require('better-sqlite3');
                const db = new Database(globalDb, { readonly: true });
                try {
                    // bubbleId
                    try {
                        const rows = db.prepare("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'").all();
                        for (const row of rows) {
                            const v = row.value ? JSON.parse(row.value) : null; if (!v) continue;
                            const parts = String(row.key).split(':');
                            const cid = parts.length >= 3 ? parts[1] : null; if (!cid) continue;
                            const role = (v.type === 1 || v.type === 'user') ? 'user' : 'assistant';
                            const t = v.text || v.richText || v.content || '';
                            const ts = v?.cTime || v?.timestamp || v?.time || v?.createdAt || v?.lastUpdatedAt || null;
                            if (t) pushMsg(cid, role, t, globalDb, ts);
                            if (!compMeta.has(cid)) compMeta.set(cid, { title: `Chat ${String(cid).slice(0,8)}`, createdAt: v.createdAt || null, lastUpdatedAt: v.lastUpdatedAt || v.createdAt || null });
                            if (!comp2ws.has(cid)) comp2ws.set(cid, '(global)');
                        }
                    } catch {}
                    // composerData
                    try {
                        const rows = db.prepare("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%'").all();
                        for (const row of rows) {
                            const v = row.value ? JSON.parse(row.value) : null; if (!v) continue;
                            const parts = String(row.key).split(':');
                            const cid = parts.length >= 2 ? parts[1] : null; if (!cid) continue;
                            const created = v.createdAt || null;
                            if (!compMeta.has(cid)) compMeta.set(cid, { title: `Chat ${String(cid).slice(0,8)}`, createdAt: created, lastUpdatedAt: created });
                            if (!comp2ws.has(cid)) comp2ws.set(cid, '(global)');
                            for (const m of v.conversation || []) {
                                const role = (m.type === 1) ? 'user' : 'assistant';
                                const t = m.text || '';
                                const ts = m?.timestamp || m?.time || m?.createdAt || m?.lastUpdatedAt || created || null;
                                if (t) pushMsg(cid, role, t, globalDb, ts);
                            }
                        }
                    } catch {}
                    // global ItemTable chatdata
                    try {
                        const r = db.prepare("SELECT value FROM ItemTable WHERE key='workbench.panel.aichat.view.aichat.chatdata'").get();
                        const pane = r && r.value ? JSON.parse(r.value) : {};
                        for (const tab of pane.tabs || []) {
                            const tid = tab.tabId || 'unknown';
                            if (!compMeta.has(tid)) compMeta.set(tid, { title: `Global Chat ${String(tid).slice(0,8)}`, createdAt: null, lastUpdatedAt: null });
                            if (!comp2ws.has(tid)) comp2ws.set(tid, '(global)');
                            for (const b of tab.bubbles || []) {
                                const t = typeof b.text === 'string' ? b.text : (typeof b.content === 'string' ? b.content : '');
                                if (!t) continue;
                                const role = (b.type === 'user' || b.type === 1) ? 'user' : 'assistant';
                                const ts = b?.cTime || b?.timestamp || b?.time || b?.createdAt || b?.lastUpdatedAt || tab?.lastUpdatedAt || tab?.createdAt || null;
                                pushMsg(tid, role, t, globalDb, ts);
                            }
                        }
                    } catch {}
                } finally { try { db.close(); } catch {} }
            }
        } catch {}
        }

        // 在 summary 模式下，确保每个 comp 都有一个会话占位（避免遗漏无消息但有元信息的会话）
        if (summary) {
            for (const cid of compMeta.keys()) {
                if (!sessions.has(cid)) sessions.set(cid, { messages: [], db_path: '' });
            }
        }

        // 组装输出
        for (const [cid, data] of sessions.entries()) {
            const wsId = comp2ws.get(cid) || '(unknown)';
            let project = wsProj.get(wsId) || { name: '(unknown)', rootPath: '(unknown)' };
            // 兜底：如果当前 ws 没有项目根，但全局有候选，优先取最高分的一个，避免全部落入 unknown
            if ((!project || project.rootPath === '(unknown)' || project.rootPath === '/' || !project.rootPath) && this.lastComposerProjectIndex && Array.isArray(this.lastComposerProjectIndex.globalCandidates) && this.lastComposerProjectIndex.globalCandidates.length > 0) {
                const top = this.lastComposerProjectIndex.globalCandidates[0];
                if (top && top.rootPath) {
                    project = { name: this.extractProjectNameFromPath(top.rootPath), rootPath: top.rootPath };
                }
            }
            const meta = compMeta.get(cid) || { title: '(untitled)', createdAt: null, lastUpdatedAt: null };
            out.push({ project, session: { composerId: cid, ...meta }, messages: data.messages, workspace_id: wsId, db_path: data.db_path });
        }

        // 按 lastUpdatedAt 降序
        out.sort((a, b) => ((b.session.lastUpdatedAt || 0) - (a.session.lastUpdatedAt || 0)));
        return out;
    }

    cvFormatChat(chat) {
        // 与 cursor-view 的 format_chat_for_frontend 对齐：优先使用 lastUpdatedAt，其次 createdAt，最后当前时间
        const sessionId = chat?.session?.composerId || require('crypto').randomUUID();
        let dateSec = Math.floor(Date.now() / 1000);
        if (chat?.session?.lastUpdatedAt) {
            dateSec = Math.floor((chat.session.lastUpdatedAt) / 1000);
        } else if (chat?.session?.createdAt) {
            dateSec = Math.floor((chat.session.createdAt) / 1000);
        }
        let project = chat.project || { name: 'Unknown Project', rootPath: '/' };
        // 若根仍然过浅或未知，尝试从 lastComposerProjectIndex 全局候选兜底一次
        try{
            const shallow = /^\/[A-Za-z]%3A\/?$/.test(project?.rootPath||'') || project?.rootPath === '/' || !project?.rootPath || project?.name === '(unknown)';
            if (shallow && this.lastComposerProjectIndex && Array.isArray(this.lastComposerProjectIndex.globalCandidates) && this.lastComposerProjectIndex.globalCandidates.length > 0){
                const top = this.lastComposerProjectIndex.globalCandidates[0];
                if (top && top.rootPath){ project = { name: this.extractProjectNameFromPath(top.rootPath), rootPath: top.rootPath }; }
            }
        }catch{}
        return {
            project,
            messages: Array.isArray(chat.messages) ? chat.messages : [],
            date: dateSec,
            session_id: sessionId,
            workspace_id: chat.workspace_id || 'unknown',
            db_path: chat.db_path || 'Unknown database path'
        };
    }

    cvLongestCommonPrefix(paths) {
        if (!paths || paths.length === 0) return '';
        let prefix = paths[0];
        for (let i = 1; i < paths.length; i++) {
            let j = 0;
            while (j < prefix.length && j < paths[i].length && prefix[j] === paths[i][j]) j++;
            prefix = prefix.slice(0, j);
            if (!prefix) break;
        }
        return prefix;
    }

    cvExtractProjectNameFromPath(rootPath) {
        if (!rootPath || rootPath === '/') return 'Root';
        const parts = rootPath.split('/').filter(Boolean);
        if (parts.length === 0) return 'Root';
        const containers = new Set(['Documents','Projects','Code','workspace','repos','git','src','codebase']);
        const last = parts[parts.length - 1];
        if (containers.has(last) && parts.length > 1) return parts[parts.length - 2];
        return last;
    }
    // 提取单个气泡的文本与角色
    extractBubbleTextAndRole(bubbleLike) {
        const b = bubbleLike || {};
        // 角色优先来源：显式 role；否则用 type 推断
        let role = typeof b.role === 'string' ? b.role : undefined;
        const type = b.type;
        if (!role) {
            if (type === 1 || type === 'user') role = 'user';
            else if (type === 2 || type === 'assistant') role = 'assistant';
            else role = 'assistant';
        }

        // 候选文本字段
        const pickString = (...cands) => {
            for (const c of cands) {
                if (typeof c === 'string' && c.trim()) return c.trim();
            }
            return '';
        };

        // 文本净化：过滤纯 ID/哈希/状态类噪声（如一串字母数字、UUID、git sha、completed/error 等）
        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const shaRe = /^[0-9a-f]{7,40}$/i;
        const longAlphaNumRe = /^[A-Za-z0-9_\-]{20,}$/;
        const statusWordRe = /^(completed|complete|success|succeeded|ok|done|error|failed|failure|cancelled|canceled|timeout)$/i;
        const toolWordRe = /^(codebase[_\.-]?search|grep|read_file|run_terminal_cmd|apply_patch|read_lints|list_dir|glob(_file_search)?|create_diagram|fetch_pull_request|update_memory|functions\.[A-Za-z0-9_]+)$/i;
        const isNoiseLine = (s) => {
            if (typeof s !== 'string') return true;
            const v = s.trim();
            if (!v) return true;
            if (uuidRe.test(v)) return true;
            if (shaRe.test(v)) return true;
            if (longAlphaNumRe.test(v)) return true;
            if (statusWordRe.test(v)) return true;
            if (toolWordRe.test(v)) return true;
            if (/^(Tool:|Arguments:|Result:)/i.test(v)) return true;
            if (/^(call_|fc_)[A-Za-z0-9_\-]+$/i.test(v)) return true;
            if (/^`{3,}$/.test(v)) return true; // 代码围栏
            return false;
        };
        const sanitizeText = (s) => {
            if (typeof s !== 'string') return '';
            const cleaned = s
                .split(/\r?\n/)
                .map(l => l.trim())
                .filter(l => l && !isNoiseLine(l));
            return cleaned.join('\n').trim();
        };

        // 直取常见字段
        let text = pickString(
            b.text,
            b.content,
            b.richText,
            b.markdown,
            b.md,
            b?.data?.content,
            b?.message?.content,
            b?.message?.text,
            b?.payload?.content
        );
        if (text) text = sanitizeText(text);

        // parts: 可能是字符串或对象数组
        if (!text && Array.isArray(b.parts)) {
            const partsText = b.parts
                .map(p => (typeof p === 'string' ? p : (typeof p?.content === 'string' ? p.content : (typeof p?.text === 'string' ? p.text : ''))))
                .filter(Boolean)
                .join('\n');
            text = sanitizeText(partsText.trim());
        }

        // messages: 某些结构把单条气泡内含多段文本
        if (!text && Array.isArray(b.messages)) {
            const msgTexts = b.messages
                .map(m => (typeof m?.content === 'string' ? m.content : (typeof m?.text === 'string' ? m.text : '')))
                .filter(Boolean)
                .join('\n');
            text = sanitizeText(msgTexts.trim());
            if (!role && typeof b.messages[0]?.role === 'string') role = b.messages[0].role;
        }

        // 深度兜底：遍历对象里与文本相关的键提取（仅当上述途径均失败时）
        if (!text) {
            const picked = [];
            const seen = new Set();
            const keyHint = /content|text|rich|markdown|md|snippet|output|result|message|delta|response|body/i;
            const ignoreKey = /(\b|\.|_)(id|ids|uuid|job|task|status|state|code|error|ok|success|completed|hash|sha|checksum|key|token|requestId|traceId|spanId)s?$/i;
            const isPlausible = (s) => {
                if (typeof s !== 'string') return false;
                const v = s.trim();
                if (!v) return false;
                if (v.startsWith('{') || v.startsWith('[')) return false;
                if (/^file:\/\//i.test(v)) return false;
                if (v.length < 3) return false;
                if (isNoiseLine(v)) return false;
                return /[\p{L}\p{N}]/u.test(v);
            };
            const walk = (obj, depth = 0) => {
                if (!obj || depth > 4) return; // 限制深度
                if (Array.isArray(obj)) {
                    for (const it of obj) walk(it, depth + 1);
                    return;
                }
                if (typeof obj === 'object') {
                    for (const [k, v] of Object.entries(obj)) {
                        if (seen.size > 12) break; // 控制数量
                        if (typeof v === 'string') {
                            if (ignoreKey.test(k)) continue;
                            if ((keyHint.test(k) || isPlausible(v)) && !isNoiseLine(v)) {
                                if (isPlausible(v)) { picked.push(v); seen.add(v); }
                            }
                        } else if (typeof v === 'object') {
                            if (keyHint.test(k)) walk(v, depth + 1);
                            else if (depth < 3) walk(v, depth + 1);
                        }
                    }
                }
            };
            walk(b);
            if (picked.length > 0) text = sanitizeText(picked.slice(0, 4).join('\n').trim());
        }

        return { text, role: role || 'assistant' };
    }

    // 基于全局/工作区 DB，按 composerId 优先聚合，构建原始会话集合（尽可能完整）
    async extractSessionsComposerFirst() {
        const sessions = new Map(); // composerId -> { sessionId, composerId, messages:[], timestamp }
        const push = (composerId, role, content, ts) => {
            if (!composerId) return;
            if (!sessions.has(composerId)) sessions.set(composerId, { sessionId: composerId, composerId, messages: [], timestamp: ts || null });
            const s = sessions.get(composerId);
            s.messages.push({ role, content: String(content || ''), timestamp: ts || null, composerId });
            if (!s.timestamp) s.timestamp = ts || null;
        };

        // 1) 全局 cursorDiskKV 的 bubbleId:%
        try {
            const path = require('path');
            const fs = require('fs');
            const globalDbPath = path.join(this.cursorStoragePath, 'User/globalStorage/state.vscdb');
            if (fs.existsSync(globalDbPath) && this.sqliteEngine.type === 'better-sqlite3') {
                const Database = require('better-sqlite3');
                const db = new Database(globalDbPath, { readonly: true });
                try {
                    const rows = db.prepare("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'").all();
                    for (const row of rows) {
                        try {
                            const value = JSON.parse(row.value);
                            const { text, role } = this.extractBubbleTextAndRole(value);
                            if (!text) continue;
                            const parts = String(row.key).split(':');
                            const composerId = parts.length >= 3 ? parts[1] : null;
                            const ts = value.cTime || value.timestamp || value.time || value.createdAt || value.lastUpdatedAt || null;
                            push(composerId, role, text, ts);
                        } catch { /* ignore malformed */ }
                    }
                } finally { try { db.close(); } catch {} }
            }
        } catch { /* ignore */ }

        // 2) 全局面板 chatdata.tabs
        try {
            const global = this.extractChatSessionsFromGlobalPane();
            for (const s of global) {
                for (const m of (s.messages || [])) push(s.composerId || s.sessionId, m.role, m.content, m.timestamp);
            }
        } catch { /* ignore */ }

        // 3) 各 workspace 的 chatdata
        try {
            const wsPane = this.extractWorkspaceChatSessions();
            for (const s of wsPane) {
                for (const m of (s.messages || [])) push(s.composerId || s.sessionId, m.role, m.content, m.timestamp);
            }
        } catch { /* ignore */ }

        // 4) 各 workspace 的 bubbleId:%（作为补充）
        try {
            const wsBubbles = await this.extractChatMessagesFromWorkspaces();
            for (const s of wsBubbles) {
                for (const m of (s.messages || [])) push(s.composerId || s.sessionId, m.role, m.content, m.timestamp);
            }
        } catch { /* ignore */ }

        // 5) composerData/aiService 等补充
        try {
            const comp = await this.extractSessionsFromComposerData();
            for (const s of comp) {
                for (const m of (s.messages || [])) push(s.composerId || s.sessionId, m.role, m.content, m.timestamp);
            }
        } catch { /* ignore */ }

        return Array.from(sessions.values());
    }

    // 初始化SQLite引擎
    initializeSQLiteEngine() {
        // 尝试不同的SQLite引擎
        const engines = [
            () => {
                console.log('🔍 尝试 better-sqlite3...');
                const Database = require('better-sqlite3');
                return { type: 'better-sqlite3', Database };
            },
            () => {
                console.log('🔍 尝试 sqlite3...');
                const sqlite3 = require('sqlite3');
                return { type: 'sqlite3', Database: sqlite3.Database };
            },
            () => {
                console.log('🔍 尝试 SQLiteReader (命令行)...');
                const SQLiteReader = require('./sqliteReader');
                return { type: 'command', SQLiteReader };
            }
        ];

        for (const engineInit of engines) {
            try {
                this.sqliteEngine = engineInit();
                console.log(`✅ 使用SQLite引擎: ${this.sqliteEngine.type}`);
                return;
            } catch (error) {
                console.log(`❌ ${this.sqliteEngine?.type || '引擎'} 不可用: ${error.message}`);
            }
        }

        console.log('⚠️ 所有SQLite引擎都不可用，使用备用模式');
        this.sqliteEngine = { type: 'fallback' };
    }

    // ========== 轻量会话索引（分钟级刷新） ==========
    scheduleSessionIndexRebuild(){
        this._indexEnabled = String(process.env.CW_ENABLE_SESSION_INDEX || '').toLowerCase() === '1';
        this._indexIntervalMs = 60 * 1000;
        this._indexBuilding = false;
        this._lastIndexBuild = 0;
        setTimeout(()=>{ try{ this.rebuildSessionIndex(); }catch{} }, 2500);
        setInterval(()=>{
            try{
                if (!this._indexEnabled) return;
                if (this._indexBuilding) return;
                if (Date.now() - (this._lastIndexBuild||0) < this._indexIntervalMs) return;
                this.rebuildSessionIndex();
            }catch{}
        }, this._indexIntervalMs);
    }

    rebuildSessionIndex(){
        if (!this._indexEnabled) return;
        if (this._indexBuilding) return;
        if (this.sqliteEngine?.type !== 'better-sqlite3') return;
        this._indexBuilding = true;
        const Database = require('better-sqlite3');
        const path = require('path');
        const fs = require('fs');
        const put = (sid, dbPath, project)=>{
            try{
                const k = String(sid);
                const prev = this._sessionDbIndex.get(k);
                if (!prev || prev.dbPath !== dbPath) this._sessionDbIndex.set(k, { dbPath, project: project||null, ts: Date.now() });
            }catch{}
        };
        const CHUNK = 1000;
        const MAX_TOTAL = 50000;
        const tasks = [];
        const globalDb = path.join(this.cursorStoragePath, 'User', 'globalStorage', 'state.vscdb');
        if (fs.existsSync(globalDb)) tasks.push({ dbPath: globalDb, project: null });
        const workspaces = this.findWorkspaceDatabases();
        for (const ws of workspaces){
            const dbPath = ws.workspaceDb || ws.dbPath || ws; if (!dbPath || !fs.existsSync(dbPath)) continue; tasks.push({ dbPath, project: null });
        }
        let totalKeys = 0;
        const started = Date.now();
        const runTask = (idx)=>{
            if (idx >= tasks.length || totalKeys >= MAX_TOTAL){ finish(); return; }
            const { dbPath, project } = tasks[idx];
            const db = new Database(dbPath, { readonly: true });
            let offset = 0; let stopped = false;
            const step = ()=>{
                if (stopped || totalKeys >= MAX_TOTAL){ try{ db.close(); }catch{}; runTask(idx+1); return; }
                try{
                    const rows1 = db.prepare("SELECT key FROM cursorDiskKV WHERE key LIKE 'bubbleId:%' LIMIT ? OFFSET ?").all(CHUNK, offset);
                    offset += rows1.length;
                    for (const r of rows1){ const k=String(r.key||''); const p=k.split(':'); if (p.length>=3 && p[0]==='bubbleId'){ put(p[1], dbPath, project); totalKeys++; } }
                    if (rows1.length < CHUNK){
                        // 再扫 composerData，同样分批
                        let off2 = 0;
                        const step2 = ()=>{
                            if (stopped || totalKeys >= MAX_TOTAL){ try{ db.close(); }catch{}; runTask(idx+1); return; }
                            try{
                                const rows2 = db.prepare("SELECT key FROM cursorDiskKV WHERE key LIKE 'composerData:%' LIMIT ? OFFSET ?").all(CHUNK, off2);
                                off2 += rows2.length;
                                for (const r of rows2){ const k=String(r.key||''); if (k.startsWith('composerData:')){ put(k.slice('composerData:'.length), dbPath, project); totalKeys++; } }
                                if (rows2.length < CHUNK){ try{ db.close(); }catch{}; runTask(idx+1); return; }
                                setTimeout(step2, 0);
                            }catch{ try{ db.close(); }catch{}; runTask(idx+1); }
                        };
                        setTimeout(step2, 0);
                        return;
                    }
                    setTimeout(step, 0);
                }catch{ try{ db.close(); }catch{}; runTask(idx+1); }
            };
            setTimeout(step, 0);
        };
        const finish = ()=>{
            this._lastIndexBuild = Date.now();
            console.log(`🔎 会话索引刷新：${totalKeys} keys, ${(Date.now()-started)}ms, indexSize=${this._sessionDbIndex.size}`);
            this._indexBuilding = false;
        };
        runTask(0);
    }

    // 获取Cursor存储路径（支持 ENV 覆盖 + Windows 下自动在 Roaming/Local 之间择优）
    getCursorStoragePath() {
        const platform = os.platform();
        const home = os.homedir();

        // 1) 明确指定优先：环境变量 CURSOR_STORAGE_PATH
        const envPath = process.env.CURSOR_STORAGE_PATH;
        if (envPath && fs.existsSync(envPath)) {
            console.log(`🔧 使用环境变量 CURSOR_STORAGE_PATH: ${envPath}`);
            return envPath;
        }

        // 2) 平台默认与自动探测
        if (platform === 'darwin') {
            return path.join(home, 'Library', 'Application Support', 'Cursor');
        }
        if (platform === 'linux') {
            return path.join(home, '.config', 'Cursor');
        }
        if (platform === 'win32') {
            const roaming = path.join(home, 'AppData', 'Roaming', 'Cursor');
            const local = path.join(home, 'AppData', 'Local', 'Cursor');

            // 候选根：优先存在且数据更“丰富”的一个
            const candidates = [roaming, local].filter(p => fs.existsSync(p));
            if (candidates.length === 0) return roaming; // 回退

            const scoreRoot = (rootDir) => {
                try {
                    const dbPath = path.join(rootDir, 'User', 'globalStorage', 'state.vscdb');
                    if (!fs.existsSync(dbPath)) return { root: rootDir, score: -1, size: 0, bubbles: -1 };
                    const size = fs.statSync(dbPath).size || 0;
                    // 尝试用 better-sqlite3 统计 bubbleId 数量
                    let bubbles = -1;
                    try {
                        const Database = require('better-sqlite3');
                        const db = new Database(dbPath, { readonly: true });
                        try {
                            const row = db.prepare("SELECT COUNT(*) AS c FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'").get();
                            bubbles = (row && row.c) || 0;
                        } finally { try { db.close(); } catch {} }
                    } catch { /* ignore */ }
                    // 评分：先看 bubbles，再看文件大小
                    const score = (bubbles >= 0 ? (bubbles * 10) : 0) + Math.min(size / (1024 * 1024), 500); // MB 上限 500 分
                    return { root: rootDir, score, size, bubbles };
                } catch {
                    return { root: rootDir, score: -1, size: 0, bubbles: -1 };
                }
            };
            const scored = candidates.map(scoreRoot).sort((a, b) => b.score - a.score);
            const chosen = scored[0];
            try {
                const detail = scored.map(s => `${s.root} (bubbles=${s.bubbles}, sizeMB=${(s.size/1048576).toFixed(1)})`).join(' | ');
                console.log(`🧭 Windows 下自动选择 Cursor 根：${chosen.root}，候选：${detail}`);
            } catch {}
            return chosen.root;
        }

        throw new Error(`不支持的平台: ${platform}`);
    }

    // 提取全局聊天消息
    async extractChatMessagesFromGlobal() {
        const globalDbPath = path.join(this.cursorStoragePath, 'User/globalStorage/state.vscdb');
        
        if (!fs.existsSync(globalDbPath)) {
            console.log('❌ 全局数据库文件不存在');
            return [];
        }

        console.log('📂 正在读取全局数据库...');

        try {
            if (this.sqliteEngine.type === 'better-sqlite3') {
                return await this.extractWithBetterSQLite(globalDbPath);
            } else if (this.sqliteEngine.type === 'sqlite3') {
                return await this.extractWithSQLite3(globalDbPath);
            } else if (this.sqliteEngine.type === 'command') {
                return await this.extractWithCommand(globalDbPath);
            } else {
                return this.getFallbackData();
            }
        } catch (error) {
            console.error('❌ 数据提取失败:', error.message);
            return this.getFallbackData();
        }
    }

    // 从全局的 chat 面板（chatdata.tabs）合成会话（cursor-view 也会展示这些）
    extractChatSessionsFromGlobalPane() {
        const sessions = [];
        try {
            const dbPath = require('path').join(this.cursorStoragePath, 'User', 'globalStorage', 'state.vscdb');
            if (!require('fs').existsSync(dbPath)) return sessions;
            const Database = require('better-sqlite3');
            const db = new Database(dbPath, { readonly: true });
            try {
                let pane = null;
                try { const r1 = db.prepare("SELECT value FROM ItemTable WHERE key='workbench.panel.aichat.view.aichat.chatdata'").get(); if (r1 && r1.value) pane = JSON.parse(r1.value); } catch {}
                if (!pane) { try { const r2 = db.prepare("SELECT value FROM cursorDiskKV WHERE key='workbench.panel.aichat.view.aichat.chatdata'").get(); if (r2 && r2.value) pane = JSON.parse(r2.value); } catch {} }
                const tabs = Array.isArray(pane?.tabs) ? pane.tabs : [];
                for (const tab of tabs) {
                    const tabId = tab?.tabId; if (!tabId) continue;
                    const bubbles = Array.isArray(tab?.bubbles) ? tab.bubbles : [];
                    const messages = [];
                    for (const bubble of bubbles) {
                        const { text, role } = this.extractBubbleTextAndRole(bubble);
                        if (!text) continue;
                        const ts = bubble?.cTime || bubble?.timestamp || bubble?.time || bubble?.createdAt || bubble?.lastUpdatedAt || tab?.lastUpdatedAt || tab?.createdAt || null;
                        messages.push({ role, content: String(text), composerId: tabId, timestamp: ts || null });
                    }
                    if (messages.length > 0) {
                        const sessTs = messages[0]?.timestamp || tab?.lastUpdatedAt || tab?.createdAt || null;
                        sessions.push({ sessionId: tabId, composerId: tabId, messages, timestamp: sessTs });
                    }
                }
            } finally { try { db.close(); } catch {} }
        } catch {}
        return sessions;
    }

    // 从各 workspace 的 state.vscdb 提取聊天气泡（对齐 cursor-view-main：按 workspace 抽取）
    async extractChatMessagesFromWorkspaces() {
        const allSessions = [];
        const workspaces = this.findWorkspaceDatabases();
        for (const ws of workspaces) {
            try {
                if (this.sqliteEngine.type === 'better-sqlite3') {
                    const Database = this.sqliteEngine.Database;
                    const db = new Database(ws.workspaceDb, { readonly: true });
                    try {
                        const bubbles = db.prepare("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'").all();
                        const sessions = this.groupIntoSessions(bubbles);
                        for (const s of sessions) {
                            s.workspaceId = ws.workspaceId;
                            s.dbPath = ws.workspaceDb;
                        }
                        allSessions.push(...sessions);
                    } finally { try { db.close(); } catch {} }
                } else if (this.sqliteEngine.type === 'sqlite3') {
                    // 简化：若非 better-sqlite3，回退到全局
                    const g = await this.extractChatMessagesFromGlobal();
                    allSessions.push(...g);
                } else if (this.sqliteEngine.type === 'command') {
                    const { SQLiteReader } = this.sqliteEngine;
                    const reader = new SQLiteReader(ws.workspaceDb);
                    try {
                        const bubbles = reader.query("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'");
                        const sessions = this.groupIntoSessions(bubbles);
                        for (const s of sessions) {
                            s.workspaceId = ws.workspaceId;
                            s.dbPath = ws.workspaceDb;
                        }
                        allSessions.push(...sessions);
                    } finally { reader.close(); }
                }
            } catch {}
        }
        return allSessions;
    }

    // 从 composerData 与 aiService.generations 合成会话（适用于无 bubble 的对话）
    async extractSessionsFromComposerData() {
        const sessions = [];
        const pickTimestamp = (obj) => {
            if (!obj || typeof obj !== 'object') return null;
            const candidate = obj.timestamp || obj.time || obj.ts || obj.createdAt || obj.lastUpdatedAt || obj.updatedAt || obj.cTime || null;
            if (candidate == null) return null;
            try {
                if (typeof candidate === 'number') {
                    const ms = candidate > 1e12 ? candidate : candidate * 1000;
                    return new Date(ms).toISOString();
                }
                const d = new Date(candidate);
                if (!isNaN(d.getTime())) return d.toISOString();
            } catch {}
            return null;
        };
        const pushIfValid = (session) => {
            if (!session) return;
            if (!Array.isArray(session.messages) || session.messages.length === 0) {
                session.messages = [
                    { role: 'assistant', content: '（composer 记录，无独立聊天气泡）', timestamp: pickTimestamp(session) }
                ];
            }
            session.timestamp = session.messages[0]?.timestamp || pickTimestamp(session) || null;
            sessions.push(session);
        };

        // 1) 全局 DB 的 composerData:% 与 aiService.generations
        try {
            const globalDbPath = require('path').join(this.cursorStoragePath, 'User', 'globalStorage', 'state.vscdb');
            if (require('fs').existsSync(globalDbPath) && this.sqliteEngine.type === 'better-sqlite3') {
                const Database = require('better-sqlite3');
                const db = new Database(globalDbPath, { readonly: true });
                try {
                    // 读取全局 generations（按 composer 归并）
                    const genByComposer = new Map();
                    try {
                        const rowG = db.prepare("SELECT value FROM ItemTable WHERE key='aiService.generations'").get();
                        if (rowG && rowG.value) {
                            try {
                                const gdata = JSON.parse(rowG.value);
                                const list = Array.isArray(gdata) ? gdata : (Array.isArray(gdata?.items) ? gdata.items : []);
                                for (const g of list) {
                                    const cid = g?.composerId || g?.id || g?.tabId; if (!cid) continue;
                                    const arr = genByComposer.get(cid) || []; arr.push(g); genByComposer.set(cid, arr);
                                }
                            } catch {}
                        }
                    } catch {}
                    const rows = db.prepare("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%'").all();
                    for (const row of rows) {
                        const key = String(row.key || '');
                        const cid = key.startsWith('composerData:') ? key.slice('composerData:'.length) : null;
                        if (!cid) continue;
                        let data = null; try { data = JSON.parse(row.value); } catch { data = null; }
                        const messages = [];
                        const tryPush = (role, text, ts) => {
                            const t = (text || '').toString().trim(); if (!t) return; messages.push({ role, content: t, timestamp: ts || null, composerId: cid });
                        };
                        if (data && typeof data === 'object') {
                            // 常见字段兜底
                            const baseTs = pickTimestamp(data);
                            tryPush('user', data.prompt || data.title || data.name || '', baseTs);
                            tryPush('assistant', data.response || data.output || data.text || data.summary || '', baseTs);
                            // 深层数组（如 messages / history / logs）
                            const arrays = [data.messages, data.history, data.logs, data.generations];
                            for (const arr of arrays) {
                                if (!Array.isArray(arr)) continue;
                                for (const it of arr) {
                                    const role = (it?.role === 'user' || it?.type === 1) ? 'user' : 'assistant';
                                    tryPush(role, it?.content || it?.text || it?.output || it?.title || '', pickTimestamp(it));
                                }
                            }
                        }
                        // 合并全局 generations
                        const gens = genByComposer.get(cid) || [];
                        for (const g of gens) {
                            const gts = pickTimestamp(g);
                            tryPush('user', g?.prompt || g?.input || '', gts);
                            tryPush('assistant', g?.text || g?.output || g?.answer || '', gts);
                        }
                        pushIfValid({ sessionId: cid, composerId: cid, messages, from: 'global-composerData' });
                    }
                } finally { try { db.close(); } catch {} }
            }
        } catch {}

        // 2) 各 workspace 的 composer.composerData 与 aiService.generations
        try {
            const workspaces = this.findWorkspaceDatabases();
            for (const ws of workspaces) {
                try {
                    const Database = require('better-sqlite3');
                    const db = new Database(ws.workspaceDb, { readonly: true });
                    try {
                        let compVal = null;
                        try { const r1 = db.prepare("SELECT value FROM ItemTable WHERE key='composer.composerData'").get(); if (r1 && r1.value) compVal = r1.value; } catch {}
                        if (!compVal) { try { const r2 = db.prepare("SELECT value FROM cursorDiskKV WHERE key='composer.composerData'").get(); if (r2 && r2.value) compVal = r2.value; } catch {} }
                        const genRows = (()=>{ try { const r = db.prepare("SELECT value FROM ItemTable WHERE key='aiService.generations'").get(); return r && r.value ? r.value : null; } catch { return null; } })();
                        let generations = null; try { generations = genRows ? JSON.parse(genRows) : null; } catch { generations = null; }
                        const genByComposer = new Map();
                        if (generations && Array.isArray(generations)) {
                            for (const g of generations) {
                                const cid = g?.composerId || g?.id || g?.tabId; if (!cid) continue;
                                const arr = genByComposer.get(cid) || []; arr.push(g); genByComposer.set(cid, arr);
                            }
                        } else if (generations && typeof generations === 'object' && Array.isArray(generations.items)) {
                            for (const g of generations.items) {
                                const cid = g?.composerId || g?.id || g?.tabId; if (!cid) continue;
                                const arr = genByComposer.get(cid) || []; arr.push(g); genByComposer.set(cid, arr);
                            }
                        }

                        if (compVal) {
                            let data = null; try { data = JSON.parse(compVal); } catch { data = null; }
                            const composers = Array.isArray(data?.allComposers) ? data.allComposers : (Array.isArray(data?.composers) ? data.composers : []);
                            for (const c of composers) {
                                const cid = c?.composerId || c?.id; if (!cid) continue;
                                const messages = [];
                                const tryPush = (role, text, ts) => { const t=(text||'').toString().trim(); if(!t) return; messages.push({ role, content: t, timestamp: ts||null, composerId: cid }); };
                                const cts = pickTimestamp(c);
                                tryPush('user', c?.prompt || c?.title || c?.name || '', cts);
                                tryPush('assistant', c?.response || c?.output || c?.text || '', cts);
                                const gens = genByComposer.get(cid) || [];
                                for (const g of gens) {
                                    const gts = pickTimestamp(g);
                                    tryPush('user', g?.prompt || g?.input || '', gts);
                                    tryPush('assistant', g?.text || g?.output || g?.answer || '', gts);
                                }
                                pushIfValid({ sessionId: cid, composerId: cid, messages, workspaceId: ws.workspaceId, dbPath: ws.workspaceDb, from: 'workspace-composerData' });
                            }
                        }
                    } finally { try { db.close(); } catch {} }
                } catch {}
            }
        } catch {}

        // 去重：同一 sessionId 仅保留一次（更多消息优先）
        const uniq = new Map();
        for (const s of sessions) {
            const prev = uniq.get(s.sessionId);
            if (!prev) { uniq.set(s.sessionId, s); continue; }
            const prevScore = (prev.messages?.length || 0);
            const curScore = (s.messages?.length || 0);
            if (curScore > prevScore) uniq.set(s.sessionId, s);
        }
        return Array.from(uniq.values());
    }

    // 提取Workspace项目信息（参考 cursor-view-main 实现思路）
    async extractWorkspaceProjects() {
        const projects = [];
        try {
            const workspaces = this.findWorkspaceDatabases();
            for (const ws of workspaces) {
                try {
                    // 多根提取：从多个键收集 folderUri 或从文件路径推导
                    const infos = this.extractMultipleProjectInfosFromWorkspace(ws.workspaceDb);
                    for (const info of infos) {
                        if (info && info.name && info.rootPath) {
                            projects.push(info);
                        }
                    }
                } catch (e) {
                    // 忽略单个工作区错误
                }
            }
        } catch (e) {
            console.warn('提取Workspace项目信息失败:', e.message);
        }
        // 去重
        const seen = new Set();
        const unique = [];
        for (const p of projects) {
            const key = `${p.name}|${p.rootPath}`;
            if (!seen.has(key)) { seen.add(key); unique.push(p); }
        }
        return unique;
    }

    // 从多个键收集项目根（尽量与 cursor-view-main 一致）
    extractMultipleProjectInfosFromWorkspace(dbPath) {
        const Database = require('better-sqlite3');
        const db = new Database(dbPath, { readonly: true });
        const keys = [
            'history.entries',
            'workbench.editor.history',
            'recentlyOpenedPathsList',
            'memento/workbench.editors.files.textFileEditor'
        ];
        const folderRoots = new Set();
        const fileSamples = [];
        const readJson = (key) => {
            let v = null;
            try { const r = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get(key); if (r && r.value) v = r.value; } catch {}
            if (!v) { try { const r2 = db.prepare("SELECT value FROM cursorDiskKV WHERE key = ?").get(key); if (r2 && r2.value) v = r2.value; } catch {} }
            if (!v) return null; try { return JSON.parse(v); } catch { return null; }
        };
        for (const k of keys) {
            const data = readJson(k);
            if (!data) continue;
            try {
                if (k === 'history.entries') {
                    const arr = Array.isArray(data?.entries) ? data.entries : Array.isArray(data) ? data : [];
                    for (const e of arr) {
                        const f = e?.folderUri || e?.workspace?.folders?.[0]?.uri;
                        if (typeof f === 'string' && f.startsWith('file:///')) {
                            const p = f.slice('file://'.length);
                            folderRoots.add(p);
                        }
                        const r = e?.editor?.resource || e?.resource;
                        if (typeof r === 'string' && r.startsWith('file:///')) fileSamples.push(r.slice('file://'.length));
                    }
                } else if (k === 'workbench.editor.history') {
                    const arr = Array.isArray(data?.entries) ? data.entries : Array.isArray(data) ? data : [];
                    for (const e of arr) {
                        const r = e?.resource || e?.editor?.resource;
                        if (typeof r === 'string' && r.startsWith('file:///')) fileSamples.push(r.slice('file://'.length));
                    }
                } else if (k === 'recentlyOpenedPathsList') {
                    const arr = Array.isArray(data?.entries) ? data.entries : Array.isArray(data) ? data : [];
                    for (const e of arr) {
                        const f = e?.folderUri || e?.uri || e?.fileUri || e?.workspace?.configPath || e?.workspaceUri;
                        if (typeof f === 'string' && f.startsWith('file:///')) {
                            const p = f.slice('file://'.length);
                            folderRoots.add(p);
                        }
                    }
                } else if (k === 'memento/workbench.editors.files.textFileEditor') {
                    const m = data?.mementos || {};
                    for (const filePath of Object.keys(m)) {
                        if (filePath.includes('/') || filePath.includes('\\')) fileSamples.push(filePath);
                    }
                }
            } catch {}
        }
        try { db.close(); } catch {}

        const results = [];
        const isLikelyFile = (p) => /\.[A-Za-z0-9]{1,6}$/.test((p||'').split('/').pop() || '');
        const dirname = (p) => p.slice(0, Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')));
        const collapseToProjectRoot = (p) => {
            // 规则：
            // 1) 优先折叠到仓库根 /.../Repos/<repo>
            // 2) 特例：llvm-msvc/llvm/cmake 保留三段；plc/PLCLadderToSTL 保留两段
            // 3) 去除通用末级目录（src/public/dist/build/.cursor/README.assets/docs）
            if (!p) return p;
            const generic = new Set(['src','public','dist','build','.cursor','readme.assets','docs','js','css','assets']);
            const parts = p.replace(/\\/g,'/').split('/').filter(Boolean);
            let arr = parts;
            if (isLikelyFile(p)) arr = parts.slice(0, -1);
            const idxRepos = arr.findIndex(seg => seg.toLowerCase() === 'repos');
            if (idxRepos !== -1 && arr.length > idxRepos + 1) {
                const seg1 = (arr[idxRepos + 1] || '').toLowerCase();
                const seg2 = (arr[idxRepos + 2] || '').toLowerCase();
                const seg3 = (arr[idxRepos + 3] || '').toLowerCase();
                // llvm-msvc/llvm/cmake → 三段
                if (seg1 === 'llvm-msvc' && seg2 === 'llvm') {
                    return '/' + arr.slice(0, Math.min(idxRepos + 4, arr.length)).join('/');
                }
                // plc/PLCLadderToSTL → 两段
                if (seg1 === 'plc' && (arr[idxRepos + 2] || '').toLowerCase() === 'plcladdertostl') {
                    return '/' + arr.slice(0, Math.min(idxRepos + 3, arr.length)).join('/');
                }
                // 其它仓库：仅取仓库根
                return '/' + arr.slice(0, idxRepos + 2).join('/');
            }
            // 非 Repos：去掉常见末级目录后取两层
            let trimmed = arr.slice();
            while (trimmed.length > 2 && generic.has((trimmed[trimmed.length-1]||'').toLowerCase())) trimmed = trimmed.slice(0,-1);
            const depth = Math.min(3, trimmed.length);
            return '/' + trimmed.slice(0, depth).join('/');
        };
        // 1) 直接使用收集到的 folder 根（折叠成项目根）
        for (let encPath of folderRoots) {
            if (isLikelyFile(encPath)) encPath = dirname(encPath);
            const collapsed = collapseToProjectRoot(encPath);
            const name = this.extractProjectNameFromPath(collapsed);
            results.push({ name, rootPath: collapsed, fileCount: 0 });
        }
        // 2) 从文件样本推导：折叠为项目根
        for (const fp of fileSamples.slice(0, 2000)) { // 限制样本量
            let root = collapseToProjectRoot(fp);
            if (root) {
                const name = this.extractProjectNameFromPath(root);
                results.push({ name, rootPath: root, fileCount: 0 });
            }
        }
        // 去重
        const seen = new Set();
        const unique = [];
        for (const r of results) {
            const key = `${r.rootPath}`;
            if (!seen.has(key)) { seen.add(key); unique.push(r); }
        }
        return unique;
    }

    // 建立 composerId/会话Id 映射到项目
    buildComposerProjectIndex() {
        const composerToProject = new Map();
        const conversationToProject = new Map();
        const composerToWorkspace = new Map();
        const workspaceToProject = new Map();
        const workspaceCandidates = new Map(); // wsId -> [{rootPath,name,score}]
        const globalCandidateScores = new Map();
        const workspaces = this.findWorkspaceDatabases();
        const tabToWorkspace = new Map();
        for (const ws of workspaces) {
            try {
                // 先计算该 workspace 的项目根，用于缺失路径时的兜底
                let workspaceProject = null;
                try { workspaceProject = this.extractProjectInfoFromWorkspace(ws.workspaceDb); } catch {}
                // 用众数根强化 workspace 项目根
                const major = this.computeWorkspaceMajorRoot(ws.workspaceDb);
                if (major) workspaceProject = major;
                if (workspaceProject) {
                    workspaceToProject.set(ws.workspaceId, { ...workspaceProject });
                }
                // 生成候选仓库列表（频次）
                try {
                    const Database = require('better-sqlite3');
                    const db = new Database(ws.workspaceDb, { readonly: true });
                    const tryRead = (key) => {
                        try { const r = db.prepare('SELECT value FROM ItemTable WHERE key=?').get(key); if (r && r.value) return r.value; } catch {}
                        try { const r2 = db.prepare('SELECT value FROM cursorDiskKV WHERE key=?').get(key); if (r2 && r2.value) return r2.value; } catch {}
                        return null;
                    };
                    const keys = ['history.entries','workbench.editor.history','recentlyOpenedPathsList','memento/workbench.editors.files.textFileEditor'];
                    const counts = new Map();
                    for (const key of keys) {
                        const val = tryRead(key);
                        if (!val) continue;
                        try {
                            const data = JSON.parse(val);
                            const push = (p) => {
                                const folded = this.collapseToProjectRootPath(this.decodeCursorViewPath(p));
                                if (!folded) return;
                                const enc = this.encodeCursorViewPath(folded);
                                counts.set(enc, (counts.get(enc)||0)+1);
                                globalCandidateScores.set(enc, (globalCandidateScores.get(enc)||0)+1);
                            };
                            if (key === 'history.entries') {
                                const arr = Array.isArray(data?.entries) ? data.entries : Array.isArray(data) ? data : [];
                                for (const e of arr) { const r = e?.editor?.resource || e?.resource; if (typeof r==='string' && r.startsWith('file:///')) push(r.slice('file://'.length)); }
                            } else if (key === 'workbench.editor.history') {
                                const arr = Array.isArray(data?.entries) ? data.entries : Array.isArray(data) ? data : [];
                                for (const e of arr) { const r = e?.resource || e?.editor?.resource; if (typeof r==='string' && r.startsWith('file:///')) push(r.slice('file://'.length)); }
                            } else if (key === 'recentlyOpenedPathsList') {
                                const arr = Array.isArray(data?.entries) ? data.entries : Array.isArray(data) ? data : [];
                                for (const e of arr) { const f = e?.folderUri || e?.uri || e?.fileUri || e?.workspace?.configPath || e?.workspaceUri; if (typeof f==='string' && f.startsWith('file:///')) push(f.slice('file://'.length)); }
                            } else if (key === 'memento/workbench.editors.files.textFileEditor') {
                                const m = data?.mementos || {}; for (const fp of Object.keys(m)) push(fp);
                            }
                        } catch {}
                    }
                    const cand = Array.from(counts.entries())
                        .filter(([root]) => !/^\/[A-Za-z]%3A\/?$/.test(root) && root !== '/')
                        .map(([root,score]) => ({ rootPath: root, name: this.extractProjectNameFromPath(root), score }))
                        .sort((a,b)=>b.score-a.score);
                    workspaceCandidates.set(ws.workspaceId, cand);
                    try { db.close(); } catch {}
                } catch {}
                // 从该 workspace 的 cursorDiskKV 中扫描 bubbleId:%，提取 composerId -> workspace 的归属
                try {
                    const Database = require('better-sqlite3');
                    const db = new Database(ws.workspaceDb, { readonly: true });
                    let rows = [];
                    try {
                        rows = db.prepare("SELECT key FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'").all();
                    } catch {}
                    for (const r of rows) {
                        const k = String(r.key || '');
                        if (!k.startsWith('bubbleId:')) continue;
                        const parts = k.split(':');
                        if (parts.length >= 3) {
                            const cid = parts[1];
                            if (cid) {
                                composerToWorkspace.set(cid, ws.workspaceId);
                                // 若该 workspace 已有项目根，则把 composer 默认映射到该项目（仅当尚未被更具体信息覆盖时）
                                const wsProj = workspaceToProject.get(ws.workspaceId);
                                if (wsProj && !composerToProject.has(cid)) {
                                    composerToProject.set(cid, { ...wsProj });
                                }
                            }
                        }
                    }
                    try { db.close(); } catch {}
                } catch {}
                // 读取 composer.composerData（ItemTable 优先，fallback 到 cursorDiskKV）
                let composerDataValue = null;
                try {
                    const Database = require('better-sqlite3');
                    const db = new Database(ws.workspaceDb, { readonly: true });
                    const row1 = db.prepare("SELECT value FROM ItemTable WHERE key = 'composer.composerData'").get();
                    if (row1 && row1.value) composerDataValue = row1.value;
                    if (!composerDataValue) {
                        const row2 = db.prepare("SELECT value FROM cursorDiskKV WHERE key = 'composer.composerData'").get();
                        if (row2 && row2.value) composerDataValue = row2.value;
                    }
                    // 读取面板 chatdata，将 tabId 视为 composerId，并映射到该 workspace 的项目
                    try {
                        const chatPane = db.prepare("SELECT value FROM ItemTable WHERE key = 'workbench.panel.aichat.view.aichat.chatdata'").get();
                        if (chatPane && chatPane.value) {
                            try {
                                const pane = JSON.parse(chatPane.value);
                                const tabs = Array.isArray(pane?.tabs) ? pane.tabs : [];
                                for (const tab of tabs) {
                                    const cid = tab?.tabId;
                                    if (!cid) continue;
                                    tabToWorkspace.set(cid, ws.workspaceId);
                                    if (workspaceProject) {
                                        const proj = { ...workspaceProject };
                                        composerToProject.set(cid, proj);
                                        conversationToProject.set(cid, proj);
                                        composerToWorkspace.set(cid, ws.workspaceId);
                                    }
                                }
                            } catch {}
                        }
                    } catch {}
                    db.close();
                } catch {}

                if (!composerDataValue) continue;
                try {
                    const data = JSON.parse(composerDataValue);
                    const arr = Array.isArray(data?.allComposers) ? data.allComposers : (Array.isArray(data?.composers) ? data.composers : []);
                    const toProjectInfo = (obj) => {
                        const rawPath = obj?.root || obj?.workspaceFolder || obj?.projectPath || obj?.cwd || obj?.path || '';
                        let rootPath = String(rawPath || '').trim();
                        rootPath = this.alignCursorViewMain ? this.encodeCursorViewPath(rootPath) : this.normalizePath(rootPath);
                        const name = obj?.name || obj?.projectName || this.extractProjectNameFromPath(rootPath) || 'Unknown Project';
                        return { name, rootPath: rootPath || '(unknown)', fileCount: 0 };
                    };
                    for (const c of arr) {
                        const id = c?.composerId || c?.id;
                        if (id) {
                            const info = toProjectInfo(c);
                            // 如果没有路径，回退到 workspace 推断的项目根
                            if ((!info.rootPath || info.rootPath === '(unknown)') && workspaceProject) {
                                const proj = { ...workspaceProject };
                                composerToProject.set(id, proj);
                                conversationToProject.set(id, proj);
                                composerToWorkspace.set(id, ws.workspaceId);
                            } else {
                                composerToProject.set(id, info);
                                conversationToProject.set(id, info);
                                composerToWorkspace.set(id, ws.workspaceId);
                            }
                        }
                    }
                    // 深度遍历，提取 conversationId → 项目
                    const walk = (node, currentProject) => {
                        if (!node || typeof node !== 'object') return;
                        const maybeProject = (node.root || node.workspaceFolder || node.projectPath || node.cwd || node.path) ? toProjectInfo(node) : currentProject;
                        const convId = node.conversationId || node.sessionId;
                        if (maybeProject && typeof convId === 'string' && convId.length > 0) {
                            conversationToProject.set(convId, maybeProject);
                            // conversation 也归属此 workspace
                            composerToWorkspace.set(convId, ws.workspaceId);
                        }
                        for (const k of Object.keys(node)) {
                            const v = node[k];
                            if (Array.isArray(v)) { for (const it of v) walk(it, maybeProject); }
                            else if (v && typeof v === 'object') walk(v, maybeProject);
                        }
                    };
                    walk(data, null);
                } catch {}
            } catch {}
        }
        // 额外：读取全局 DB 的 composerData:%，补充映射（严格来源，不引入名字启发式）
        try {
            const globalDbPath = require('path').join(this.cursorStoragePath, 'User', 'globalStorage', 'state.vscdb');
            if (require('fs').existsSync(globalDbPath)) {
                const Database = require('better-sqlite3');
                const db = new Database(globalDbPath, { readonly: true });
                let rows = [];
                try {
                    rows = db.prepare("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%'").all();
                } catch {}
                for (const row of rows) {
                    try {
                        const key = String(row.key || '');
                        const id = key.startsWith('composerData:') ? key.slice('composerData:'.length) : null;
                        if (!id) continue;
                        const val = row.value;
                        if (!val) continue;
                        let data = null; try { data = JSON.parse(val); } catch { data = null; }
                        const toProjectInfo = (obj) => {
                            const rawPath = obj?.root || obj?.workspaceFolder || obj?.projectPath || obj?.cwd || obj?.path || '';
                            let rootPath = String(rawPath || '').trim();
                            rootPath = this.alignCursorViewMain ? this.encodeCursorViewPath(rootPath) : this.normalizePath(rootPath);
                            const name = obj?.name || obj?.projectName || this.extractProjectNameFromPath(rootPath) || 'Unknown Project';
                            return { name, rootPath: rootPath || '(unknown)', fileCount: 0 };
                        };
                        if (data && typeof data === 'object') {
                            const info = toProjectInfo(data);
                            if (info.rootPath && info.rootPath !== '(unknown)') {
                                composerToProject.set(id, info);
                                conversationToProject.set(id, info);
                            }
                            // 深度遍历 value，提取嵌套的 conversationId → 项目
                            const walk = (node, currentProject) => {
                                if (!node || typeof node !== 'object') return;
                                const maybeProject = (node.root || node.workspaceFolder || node.projectPath || node.cwd || node.path) ? toProjectInfo(node) : currentProject;
                                const convId = node.conversationId || node.sessionId || node.tabId;
                                if (maybeProject && typeof convId === 'string' && convId.length > 0) {
                                    conversationToProject.set(convId, maybeProject);
                                }
                                for (const k of Object.keys(node)) {
                                    const v = node[k];
                                    if (Array.isArray(v)) { for (const it of v) walk(it, maybeProject); }
                                    else if (v && typeof v === 'object') walk(v, maybeProject);
                                }
                            };
                            walk(data, null);
                        }
                    } catch {}
                }
                // 从全局 chatdata.tabs 中读取 tabId，然后用 tabToWorkspace 归属到对应 workspace
                try {
                    let pane = null;
                    try {
                        const r1 = db.prepare("SELECT value FROM ItemTable WHERE key = 'workbench.panel.aichat.view.aichat.chatdata'").get();
                        if (r1 && r1.value) pane = JSON.parse(r1.value);
                    } catch {}
                    if (!pane) {
                        try {
                            const r2 = db.prepare("SELECT value FROM cursorDiskKV WHERE key = 'workbench.panel.aichat.view.aichat.chatdata'").get();
                            if (r2 && r2.value) pane = JSON.parse(r2.value);
                        } catch {}
                    }
                    const tabs = Array.isArray(pane?.tabs) ? pane.tabs : [];
                    for (const tab of tabs) {
                        const cid = tab?.tabId;
                        if (!cid) continue;
                        const wsId = tabToWorkspace.get(cid);
                        if (wsId) {
                            composerToWorkspace.set(cid, wsId);
                            const wsProj = workspaceToProject.get(wsId);
                            if (wsProj && !composerToProject.has(cid)) {
                                composerToProject.set(cid, { ...wsProj });
                                conversationToProject.set(cid, { ...wsProj });
                            }
                        }
                    }
                } catch {}
                // 从全局 bubbleId:% 中深挖路径线索（严格字段：root/workspaceFolder/projectPath/cwd/path）
                try {
                    const bubbleRows = db.prepare("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'").all();
                    for (const row of bubbleRows) {
                        try {
                            const key = String(row.key || '');
                            const parts = key.split(':');
                            if (parts.length < 3) continue;
                            const cid = parts[1]; // 作为 composerId
                            let data = null; try { data = JSON.parse(row.value); } catch { data = null; }
                            if (!data || typeof data !== 'object') continue;
                            const toProjectInfo = (obj) => {
                                const rawPath = obj?.root || obj?.workspaceFolder || obj?.projectPath || obj?.cwd || obj?.path || '';
                                let rootPath = String(rawPath || '').trim();
                                rootPath = this.alignCursorViewMain ? this.encodeCursorViewPath(rootPath) : this.normalizePath(rootPath);
                                const name = obj?.name || obj?.projectName || this.extractProjectNameFromPath(rootPath) || 'Unknown Project';
                                return { name, rootPath: rootPath || '(unknown)', fileCount: 0 };
                            };
                            const hasPath = (node) => !!(node && typeof node==='object' && (node.root || node.workspaceFolder || node.projectPath || node.cwd || node.path));
                            let proj = null;
                            if (hasPath(data)) proj = toProjectInfo(data);
                            // 常见嵌套位置
                            if (!proj && hasPath(data?.composer)) proj = toProjectInfo(data.composer);
                            if (!proj && hasPath(data?.info)) proj = toProjectInfo(data.info);
                            if (!proj && hasPath(data?.meta)) proj = toProjectInfo(data.meta);
                            if (proj && proj.rootPath && proj.rootPath !== '(unknown)') {
                                composerToProject.set(cid, proj);
                                const convId = data.conversationId || data.sessionId || cid;
                                conversationToProject.set(convId, proj);
                            }
                        } catch {}
                    }
                } catch {}
                try { db.close(); } catch {}
            }
        } catch {}
        // 生成全局候选列表
        const globalCandidates = Array.from(globalCandidateScores.entries())
            .filter(([root]) => !/^\/[A-Za-z]%3A\/?$/.test(root) && root !== '/')
            .map(([root,score]) => ({ rootPath: root, name: this.extractProjectNameFromPath(root), score }))
            .sort((a,b)=>b.score-a.score);
        return { composerToProject, conversationToProject, composerToWorkspace, workspaceToProject, workspaceCandidates, globalCandidates };
    }

    // 查找工作区数据库（仅返回存在 state.vscdb 的工作区）
    findWorkspaceDatabases() {
        const results = [];
        const pathLib = require('path');
        const fsLib = require('fs');
        const workspaceStorage = pathLib.join(this.cursorStoragePath, 'User', 'workspaceStorage');
        if (!fsLib.existsSync(workspaceStorage)) {
            return results;
        }
        const dirs = fsLib.readdirSync(workspaceStorage);
        for (const dir of dirs) {
            const dbPath = pathLib.join(workspaceStorage, dir, 'state.vscdb');
            if (fsLib.existsSync(dbPath)) {
                results.push({ workspaceDb: dbPath, workspaceId: dir });
            }
        }
        return results;
    }

    // 从workspace的state.vscdb中提取项目路径与名称（对齐 cursor-view-main：基于 history.entries/editor.resource 求公共前缀目录）
    extractProjectInfoFromWorkspace(dbPath) {
        try {
            const Database = require('better-sqlite3');
            const db = new Database(dbPath, { readonly: true });
            // 1) 读取 history.entries（ItemTable 优先，cursorDiskKV 兜底）
            let entriesJson = null;
            const rowItem = db.prepare("SELECT value FROM ItemTable WHERE key = 'history.entries'").get();
            if (rowItem && rowItem.value) entriesJson = rowItem.value;
            if (!entriesJson) {
                const rowKV = db.prepare("SELECT value FROM cursorDiskKV WHERE key = 'history.entries'").get();
                if (rowKV && rowKV.value) entriesJson = rowKV.value;
            }
            db.close();

            if (!entriesJson) return { name: 'Unknown Project', rootPath: '/', fileCount: 0 };

            // 2) 解析 editor.resource 列表（对齐 cursor-view-main）
            let entries = [];
            try { entries = JSON.parse(entriesJson) || []; } catch {}
            const filePaths = [];
            for (const entry of Array.isArray(entries) ? entries : []) {
                const res = entry?.editor?.resource || '';
                if (typeof res === 'string' && res.startsWith('file:///')) {
                    let p = res.slice('file://'.length);
                    if (!this.alignCursorViewMain) {
                        try { p = decodeURIComponent(p); } catch {}
                    }
                    filePaths.push(p);
                }
            }

            if (filePaths.length === 0) return { name: 'Unknown Project', rootPath: '/', fileCount: 0 };

            // 3) 求公共前缀（cursor-view-main 方式）或使用“合理化”方式
            let root;
            if (this.alignCursorViewMain) {
                // 直接字符级公共前缀并回退一段
                let common = this.getCommonPrefix(filePaths);
                let lastSlash = Math.max(common.lastIndexOf('/'), common.lastIndexOf('\\'));
                root = lastSlash > 0 ? common.substring(0, lastSlash) : common;
                // 避免落到盘符或容器目录，尽量深入一层（参考 cursor-view 的视觉效果）
                const shallow = /^(?:\/[A-Za-z]:|\/[A-Za-z]%3A)?\/?$/; // d:/、/d:/、/d%3A、/d%3A/
                if (shallow.test(root) || /\/repos\/?$/i.test(root)) {
                    // 从样本里选择出现频率最高的下一层目录
                    // 使用 collapseToProjectRootPath 对每个样本折叠到更合理的项目根，并根据频次选最优
                    const freq = new Map();
                    for (const fp of filePaths) {
                        const folded = this.collapseToProjectRootPath(fp);
                        if (!folded) continue;
                        const enc = this.encodeCursorViewPath(folded);
                        freq.set(enc, (freq.get(enc) || 0) + 1);
                    }
                    let bestRoot = null, bestCount = 0;
                    for (const [r, c] of freq.entries()) {
                        if (c > bestCount) { bestRoot = r; bestCount = c; }
                    }
                    if (bestRoot) root = bestRoot;
                }
                // 统一为 /d%3A/... 风格
                root = this.encodeCursorViewPath(root);
            } else {
                root = this.chooseReasonableRootFromFiles(filePaths);
                const gitRoot = this.resolveGitRoot(root);
                if (gitRoot && gitRoot !== root) root = gitRoot;
            }
            const name = this.extractProjectNameFromPath(root);
            return { name, rootPath: root, fileCount: filePaths.length };
        } catch (e) {
            return { name: 'Unknown Project', rootPath: '/', fileCount: 0 };
        }
    }

    extractPathsFromValue(value, key) {
        const result = { files: [], folders: [] };
        try {
            const data = JSON.parse(value);
            if (key === 'history.entries') {
                const collectFromEntry = (entry) => {
                    const folderUri = entry?.folderUri || entry?.workspace?.folders?.[0]?.uri;
                    if (folderUri) {
                        let f = String(folderUri).replace('file:///', '').replace('file://', '');
                        try { f = decodeURIComponent(f); } catch {}
                        if (f.includes(':') && !f.startsWith('/')) f = f.replace(/^\//, '');
                        result.folders.push(f);
                    }
                    const resource = entry?.editor?.resource || entry?.resource;
                    if (resource) {
                        let p = String(resource).replace('file:///', '').replace('file://', '');
                        try { p = decodeURIComponent(p); } catch {}
                        if (p.includes(':') && !p.startsWith('/')) p = p.replace(/^\//, '');
                        result.files.push(p);
                    }
                };
                if (data?.entries && Array.isArray(data.entries)) {
                    for (const entry of data.entries) collectFromEntry(entry);
                } else if (Array.isArray(data)) {
                    for (const entry of data) collectFromEntry(entry);
                } else if (data && typeof data === 'object') {
                    collectFromEntry(data);
                }
            } else if (key === 'debug.selectedroot') {
                if (data && typeof data === 'string') result.folders.push(data);
            } else if (key === 'memento/workbench.editors.files.textFileEditor') {
                if (data && data.mementos) {
                    for (const filePath of Object.keys(data.mementos)) {
                        if (filePath.includes('/') || filePath.includes('\\')) result.files.push(filePath);
                    }
                }
            }
        } catch {}
        return result;
    }

    findCommonPath(paths) {
        if (!paths || paths.length === 0) return '/';
        if (paths.length === 1) return require('path').dirname(paths[0]);
        const prefix = this.getCommonPrefix(paths);
        try {
            const fsLib = require('fs');
            const pathLib = require('path');
            if (fsLib.existsSync(prefix) && fsLib.statSync(prefix).isFile()) {
                return pathLib.dirname(prefix);
            }
        } catch {}
        return prefix;
    }

    // 提取公共前缀（按字符），返回目录路径
    getCommonPrefix(paths) {
        const pathLib = require('path');
        const normalized = paths.map(p => this.normalizePath(p));
        const first = normalized[0];
        let prefixLen = first.length;
        for (let i = 1; i < normalized.length; i++) {
            const s = normalized[i];
            let j = 0;
            const max = Math.min(prefixLen, s.length);
            while (j < max && first[j] === s[j]) j++;
            prefixLen = j;
            if (prefixLen === 0) break;
        }
        let prefix = first.substring(0, prefixLen);
        // 截断到目录边界
        const lastSlash = Math.max(prefix.lastIndexOf('/'), prefix.lastIndexOf('\\'));
        if (lastSlash > 0) prefix = prefix.substring(0, lastSlash);
        if (!prefix) prefix = pathLib.parse(first).root || '/';
        return prefix;
    }

    normalizePath(p) {
        if (!p) return '';
        let s = String(p).replace(/\\/g, '/');
        // 统一去除开头的 file:///
        s = s.replace(/^file:\/\//, '');
        try { s = decodeURIComponent(s); } catch {}
        // 将 /d:/Repos 归一为 d:/Repos，便于与消息中的路径匹配
        if (/^\/[A-Za-z]:\//.test(s)) {
            s = s.substring(1);
        }
        // 将 /d:（无斜杠）归一为 d:/
        if (/^\/[A-Za-z]:$/.test(s)) {
            s = s.substring(1) + '/';
        }
        return s;
    }

    // 将 /d%3A/Repos/... → d:/Repos/... 用于匹配
    decodeCursorViewPath(p) {
        if (!p) return '';
        let s = String(p);
        if (/^\/[A-Za-z]%3A\//.test(s)) {
            const drive = s.charAt(1).toLowerCase();
            s = `${drive}:/` + s.slice(6); // /d%3A/ → d:/
        }
        return this.normalizePath(s);
    }

    // 折叠路径为仓库根或特例多段根（供消息线索与样本共用）
    collapseToProjectRootPath(p) {
        if (!p) return p;
        const isFile = /\.[A-Za-z0-9]{1,6}$/.test((p||'').split('/').pop() || '');
        const parts = String(p).replace(/\\/g,'/').split('/').filter(Boolean);
        let arr = parts;
        if (isFile) arr = parts.slice(0, -1);
        const idxRepos = arr.findIndex(seg => seg.toLowerCase() === 'repos');
        const generic = new Set(['src','public','dist','build','.cursor','readme.assets','docs','js','css','assets']);
        if (idxRepos !== -1 && arr.length > idxRepos + 1) {
            const seg1 = (arr[idxRepos + 1] || '').toLowerCase();
            const seg2 = (arr[idxRepos + 2] || '').toLowerCase();
            if (seg1 === 'llvm-msvc' && seg2 === 'llvm') {
                return '/' + arr.slice(0, Math.min(idxRepos + 4, arr.length)).join('/');
            }
            if (seg1 === 'plc' && (arr[idxRepos + 2] || '').toLowerCase() === 'plcladdertostl') {
                return '/' + arr.slice(0, Math.min(idxRepos + 3, arr.length)).join('/');
            }
            return '/' + arr.slice(0, idxRepos + 2).join('/');
        }
        let trimmed = arr.slice();
        while (trimmed.length > 2 && generic.has((trimmed[trimmed.length-1]||'').toLowerCase())) trimmed = trimmed.slice(0,-1);
        const depth = Math.min(3, trimmed.length);
        return '/' + trimmed.slice(0, depth).join('/');
    }

    // 将 Windows 路径转换为 cursor-view-main 风格路径：/d%3A/Repos/xxx
    encodeCursorViewPath(p) {
        if (!p) return '';
        let s = String(p).replace(/\\/g, '/');
        // 归一掉前导斜杠形式的盘符
        if (/^\/[A-Za-z]:/.test(s)) s = s.substring(1);
        if (/^\/[A-Za-z]%3A\//.test(s)) return s; // 已编码
        s = s.replace(/^([A-Za-z]):\/?/, (m, d) => `/${d.toLowerCase()}%3A/`);
        if (!s.startsWith('/')) s = '/' + s;
        return s;
    }

    // 选择更合理的项目根：避免过浅（如 d:/ 或 d:/Repos），按出现频率投票确定类似 d:/Repos/<project>
    chooseReasonableRootFromFiles(filePaths) {
        const paths = (filePaths || []).map(p => this.normalizePath(p)).filter(Boolean);
        if (paths.length === 0) return '/';

        const toSegments = (p) => p.split('/').filter(Boolean);
        const joinDepth = (segs, depth) => segs.slice(0, Math.min(depth, segs.length)).join('/');

        const depthCandidates = [4, 3]; // 优先更具体的深度
        for (const depth of depthCandidates) {
            const freq = new Map();
            for (const p of paths) {
                const segs = toSegments(p);
                if (segs.length < 2) continue;
                // 如果最后一段像文件名，忽略最后一段
                let cut = segs;
                if (/\.[A-Za-z0-9]{1,6}$/.test(segs[segs.length - 1])) {
                    cut = segs.slice(0, -1);
                }
                const cand = joinDepth(cut, depth);
                if (!cand) continue;
                freq.set(cand, (freq.get(cand) || 0) + 1);
            }
            // 选择出现最多的候选
            let best = null, bestCount = 0;
            for (const [cand, count] of freq.entries()) {
                if (count > bestCount) { best = cand; bestCount = count; }
            }
            // 若有明显众数（>=2），返回该候选
            if (best && bestCount >= 2) {
                // Windows 盘符前导斜杠去除
                const win = process.platform === 'win32' && /^\/[A-Za-z]:\//.test(best) ? best.replace(/^\//, '') : best;
                return win;
            }
        }

        // 退化为公共前缀目录
        const prefix = this.getCommonPrefix(paths);
        const lastSlash = Math.max(prefix.lastIndexOf('/'), prefix.lastIndexOf('\\'));
        if (lastSlash > 0) {
            const base = prefix.substring(0, lastSlash);
            const win = process.platform === 'win32' && /^\/[A-Za-z]:\//.test(base) ? base.replace(/^\//, '') : base;
            return win;
        }
        return prefix || '/';
    }

    // 如果存在 Git 仓库，以 Git 根目录为准
    resolveGitRoot(startPath) {
        if (!startPath) return startPath;
        const fsLib = require('fs');
        const pathLib = require('path');
        let current = this.normalizePath(startPath);
        // Windows 盘符前导斜杠去除
        if (process.platform === 'win32' && /^\/[A-Za-z]:\//.test(current)) current = current.replace(/^\//, '');
        // 向上查找 .git 目录或文件
        let prev = '';
        for (let i = 0; i < 20 && current && current !== prev; i++) {
            const gitPath = pathLib.join(current, '.git');
            try {
                if (fsLib.existsSync(gitPath)) {
                    return current;
                }
            } catch {}
            prev = current;
            current = pathLib.dirname(current);
        }
        return startPath;
    }

    extractProjectNameFromPath(projectPath) {
        if (!projectPath) return 'Unknown Project';
        const norm = String(projectPath).replace(/\\/g,'/');
        if (norm === '/' || /^\/[A-Za-z]%3A\/?$/.test(norm)) return 'Unknown Project';
        const parts = norm.split('/').filter(Boolean);
        return parts.length ? parts[parts.length - 1] : 'Unknown Project';
    }

    // 计算某个 workspace 的“众数项目根”：从多个键收集文件样本 → 折叠为仓库根 → 频次投票
    computeWorkspaceMajorRoot(workspaceDbPath) {
        try {
            const Database = require('better-sqlite3');
            const db = new Database(workspaceDbPath, { readonly: true });
            const tryRead = (key) => {
                try {
                    const r1 = db.prepare('SELECT value FROM ItemTable WHERE key=?').get(key);
                    if (r1 && r1.value) return r1.value;
                } catch {}
                try {
                    const r2 = db.prepare('SELECT value FROM cursorDiskKV WHERE key=?').get(key);
                    if (r2 && r2.value) return r2.value;
                } catch {}
                return null;
            };
            const keys = [
                'history.entries',
                'workbench.editor.history',
                'recentlyOpenedPathsList',
                'memento/workbench.editors.files.textFileEditor'
            ];
            const fileSamples = [];
            for (const key of keys) {
                const val = tryRead(key);
                if (!val) continue;
                try {
                    const data = JSON.parse(val);
                    if (key === 'history.entries') {
                        const arr = Array.isArray(data?.entries) ? data.entries : Array.isArray(data) ? data : [];
                        for (const e of arr) {
                            const r = e?.editor?.resource || e?.resource;
                            if (typeof r === 'string' && r.startsWith('file:///')) fileSamples.push(r.slice('file://'.length));
                        }
                    } else if (key === 'workbench.editor.history') {
                        const arr = Array.isArray(data?.entries) ? data.entries : Array.isArray(data) ? data : [];
                        for (const e of arr) {
                            const r = e?.resource || e?.editor?.resource;
                            if (typeof r === 'string' && r.startsWith('file:///')) fileSamples.push(r.slice('file://'.length));
                        }
                    } else if (key === 'recentlyOpenedPathsList') {
                        const arr = Array.isArray(data?.entries) ? data.entries : Array.isArray(data) ? data : [];
                        for (const e of arr) {
                            const f = e?.folderUri || e?.uri || e?.fileUri || e?.workspace?.configPath || e?.workspaceUri;
                            if (typeof f === 'string' && f.startsWith('file:///')) fileSamples.push(f.slice('file://'.length));
                        }
                    } else if (key === 'memento/workbench.editors.files.textFileEditor') {
                        const m = data?.mementos || {};
                        for (const fp of Object.keys(m)) if (fp.includes('/') || fp.includes('\\')) fileSamples.push(fp);
                    }
                } catch {}
            }
            try { db.close(); } catch {}
            if (fileSamples.length === 0) return null;
            const counts = new Map();
            for (const fp of fileSamples) {
                const folded = this.collapseToProjectRootPath(this.decodeCursorViewPath(fp));
                if (!folded) continue;
                const enc = this.encodeCursorViewPath(folded);
                counts.set(enc, (counts.get(enc) || 0) + 1);
            }
            let best = null, bestCount = 0;
            for (const [root, cnt] of counts.entries()) {
                // 过滤盘符/根
                if (/^\/[A-Za-z]%3A\/?$/.test(root) || root === '/') continue;
                if (cnt > bestCount) { best = root; bestCount = cnt; }
            }
            if (!best) {
                // 兜底：取任意一个折叠根
                const first = counts.keys().next().value;
                best = first || '/';
            }
            return { name: this.extractProjectNameFromPath(best), rootPath: best, fileCount: fileSamples.length };
        } catch (e) {
            return null;
        }
    }

    // 从会话消息中提取可能的路径线索
    extractPathHintsFromMessages(messages) {
        const hints = new Set();
        const winAbs = /[A-Za-z]:\\[^\s<>:"|?*\n\r]+/g;
        const unixAbs = /\/(?:[^\s<>:"|?*\n\r\/]+\/)+[^\s<>:"|?*\n\r]*/g;
        const encWin = /\/[A-Za-z]%3A\/[\S]+/g;
        const fileUri = /file:\/\/\/[A-Za-z]%3A\/[\S]+/g;
        const projSeg = /(?:(?:src|app|components|pages|utils|lib|modules|services|api|public|assets)[\/\\][^\s\n\r]+)/gi;
        for (const m of messages || []) {
            const text = m?.content || '';
            const addMatches = (re) => {
                const all = text.match(re) || [];
                for (const v of all) {
                    hints.add(v);
                    try { hints.add(this.normalizePath(v)); } catch {}
                    try { hints.add(this.decodeCursorViewPath(v)); } catch {}
                    if (typeof v === 'string' && v.startsWith('file:///')) {
                        const p = v.replace('file:///', '');
                        hints.add(p);
                        hints.add(this.decodeCursorViewPath(p));
                    }
                }
            };
            addMatches(winAbs);
            addMatches(unixAbs);
            addMatches(encWin);
            addMatches(fileUri);
            addMatches(projSeg);
        }
        return Array.from(hints).filter(Boolean);
    }

    // 依据路径线索与 workspace 根目录进行匹配
    matchSessionToProjectByPathHints(session, projectsArray) {
        if (!projectsArray || projectsArray.length === 0) return null;
        const hints = this.extractPathHintsFromMessages(session.messages)
            .map(h => this.normalizePath(this.decodeCursorViewPath(h)).toLowerCase());
        if (hints.length === 0) return null;
        let best = null;
        let bestScore = 0;
        for (const project of projectsArray) {
            const root = this.normalizePath(project.rootPath).toLowerCase();
            if (!root || root === '/') continue;
            let score = 0;
            for (const hint of hints) {
                if (hint.startsWith(root)) {
                    score += 25; // 明确前缀匹配
                } else {
                    // 片段重合度
                    const rootParts = root.split('/').filter(x => x.length > 1);
                    const hit = rootParts.reduce((acc, part) => acc + (hint.includes(part) ? 1 : 0), 0);
                    score += hit;
                }
            }
            // 仓库尾段/双段命中加权
            const parts = root.split('/').filter(Boolean);
            const tail = parts.slice(-1)[0];
            const tail2 = parts.slice(-2).join('/');
            const text = (session.messages || []).map(m => m.content || '').join(' ').toLowerCase();
            if (tail && text.includes(tail.toLowerCase())) score += 3;
            if (tail2 && text.includes(tail2.toLowerCase())) score += 5;
            if (score > bestScore) { bestScore = score; best = project; }
        }
        return best && bestScore >= 3 ? best : null;
    }

    // 名称启发式：根据仓库名或根目录最后一段在会话文本中的出现来匹配
    heuristicMatchByRepoName(session, projectsArray) {
        if (!projectsArray || projectsArray.length === 0) return null;
        const text = (session.messages || []).map(m => m.content || '').join(' ').toLowerCase();
        if (!text) return null;
        let best = null; let bestScore = 0;
        for (const p of projectsArray) {
            const root = String(p.rootPath || '').replace(/\\/g,'/');
            const name = (p.name || '').toLowerCase();
            const last = root.split('/').filter(Boolean).pop() || '';
            let score = 0;
            if (name && text.includes(name)) score += 5;
            if (last && text.includes(last.toLowerCase())) score += 5;
            // 如果路径中有双段（如 plc/PLCLadderToSTL），分别加分
            const parts = root.split('/').filter(Boolean);
            const tail2 = parts.slice(-2).join('/').toLowerCase();
            if (tail2 && text.includes(tail2)) score += 6;
            if (score > bestScore) { bestScore = score; best = p; }
        }
        return bestScore >= 6 ? best : null;
    }

    // 将容器目录（如 d:/Repos、/home/user/Projects）细化为具体子项目目录
    refineContainerProjectRoot(project, messages) {
        if (!project || !project.rootPath) return project;
        const genericNames = ['repos', 'projects', 'code', 'workspace', 'work', 'dev'];
        const normRoot = this.normalizePath(project.rootPath);
        const parts = normRoot.split('/').filter(Boolean);
        const base = parts.length ? parts[parts.length - 1].toLowerCase() : '';
        const isGeneric = genericNames.includes(base) || parts.length <= 2; // 过浅
        if (!isGeneric) return project;

        // 统计该会话路径线索在容器下的子目录频次
        const hints = this.extractPathHintsFromMessages(messages).map(h => this.normalizePath(h));
        const container = normRoot.endsWith('/') ? normRoot : normRoot + '/';
        const counts = new Map();
        for (const h of hints) {
            if (!h.startsWith(container)) continue;
            const rest = h.substring(container.length);
            const seg = rest.split('/')[0];
            if (!seg) continue;
            const child = container + seg;
            counts.set(child, (counts.get(child) || 0) + 1);
        }
        // 选择出现最多的子目录
        let bestChild = null, bestCount = 0;
        for (const [child, count] of counts.entries()) {
            if (count > bestCount) { bestChild = child; bestCount = count; }
        }
        if (bestChild) {
            return {
                ...project,
                rootPath: bestChild,
                name: this.extractProjectNameFromPath(bestChild)
            };
        }
        return project;
    }

    // 判断是否为容器/过浅目录（不宜作为项目根展示）
    isContainerRoot(p) {
        if (!p) return true;
        const norm = this.normalizePath(p);
        const parts = norm.split('/').filter(Boolean);
        const base = parts[parts.length - 1]?.toLowerCase() || '';
        const generic = ['repos', 'projects', 'code', 'workspace', 'work', 'dev'];
        return parts.length <= 2 || generic.includes(base);
    }
    // 将会话匹配到真实项目（路径与名称优先）
    matchSessionToRealProject(session, projectsArray) {
        if (!projectsArray || projectsArray.length === 0) return null;
        const firstUserMessage = session.messages.find(m => m.role === 'user');
        if (!firstUserMessage) return null;
        const content = (firstUserMessage.content || '').toLowerCase();
        let best = null;
        let bestScore = 0;
        for (const project of projectsArray) {
            let score = 0;
            const name = (project.name || '').toLowerCase();
            const root = (project.rootPath || '').toLowerCase();
            if (name && content.includes(name)) score += 10;
            const parts = root.split(/[\\\/]/).filter(p => p.length > 2);
            for (const part of parts) {
                if (content.includes(part)) score += 3;
            }
            score += this.getTechStackMatches(content, project);
            if (score > bestScore && score >= 5) { bestScore = score; best = project; }
        }
        return best;
    }

    // 使用better-sqlite3提取数据
    async extractWithBetterSQLite(dbPath) {
        const { Database } = this.sqliteEngine;
        const db = new Database(dbPath, { readonly: true });
        
        try {
            // 获取所有聊天气泡
            const bubbles = db.prepare("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'").all();
            console.log(`💬 找到 ${bubbles.length} 个聊天气泡`);
            
            const sessions = this.groupIntoSessions(bubbles);
            return sessions;
        } finally {
            db.close();
        }
    }

    // 读取各 workspace 的 ItemTable 聊天数据，聚合为会话（严格参考 cursor-view-main）
    extractWorkspaceChatSessions() {
        const sessions = [];
        const workspaces = this.findWorkspaceDatabases();
        for (const ws of workspaces) {
            try {
                const Database = require('better-sqlite3');
                const db = new Database(ws.workspaceDb, { readonly: true });
                // 读取 workbench.panel.aichat.view.aichat.chatdata
                let pane = null;
                try {
                    const row = db.prepare("SELECT value FROM ItemTable WHERE key = 'workbench.panel.aichat.view.aichat.chatdata'").get();
                    if (row && row.value) pane = JSON.parse(row.value);
                } catch {}
                if (!pane) {
                    try {
                        const row2 = db.prepare("SELECT value FROM cursorDiskKV WHERE key = 'workbench.panel.aichat.view.aichat.chatdata'").get();
                        if (row2 && row2.value) pane = JSON.parse(row2.value);
                    } catch {}
                }
                if (!pane || !Array.isArray(pane?.tabs)) { try { db.close(); } catch {}; continue; }
                for (const tab of pane.tabs) {
                    const tabId = tab?.tabId;
                    if (!tabId) continue;
                    const bubbles = Array.isArray(tab?.bubbles) ? tab.bubbles : [];
                    const messages = [];
                    for (const bubble of bubbles) {
                        const type = bubble?.type;
                        let text = '';
                        if (typeof bubble?.text === 'string') text = bubble.text;
                        else if (typeof bubble?.content === 'string') text = bubble.content;
                        if (!text) continue;
                        const role = (type === 'user' || type === 1) ? 'user' : 'assistant';
                        const ts = bubble?.cTime || bubble?.timestamp || bubble?.time || bubble?.createdAt || bubble?.lastUpdatedAt || tab?.lastUpdatedAt || tab?.createdAt || null;
                        messages.push({ role, content: String(text), composerId: tabId, timestamp: ts || null });
                    }
                    if (messages.length > 0) {
                        const sessTs = messages[0]?.timestamp || tab?.lastUpdatedAt || tab?.createdAt || null;
                        sessions.push({ sessionId: tabId, composerId: tabId, messages, timestamp: sessTs });
                    }
                }
                try { db.close(); } catch {}
            } catch {}
        }
        return sessions;
    }

    // 使用sqlite3提取数据
    async extractWithSQLite3(dbPath) {
        return new Promise((resolve, reject) => {
            const { Database } = this.sqliteEngine;
            const db = new Database(dbPath, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                db.all("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'", [], (err, rows) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    console.log(`💬 找到 ${rows.length} 个聊天气泡`);
                    const sessions = this.groupIntoSessions(rows);
                    resolve(sessions);
                    db.close();
                });
            });
        });
    }

    // 使用命令行提取数据
    async extractWithCommand(dbPath) {
        const { SQLiteReader } = this.sqliteEngine;
        const reader = new SQLiteReader(dbPath);
        
        try {
            const bubbles = reader.query("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'");
            console.log(`💬 找到 ${bubbles.length} 个聊天气泡`);
            
            const sessions = this.groupIntoSessions(bubbles);
            return sessions;
        } finally {
            reader.close();
        }
    }

    // 将气泡分组为会话
    groupIntoSessions(bubbles) {
        // 保存每个会话的消息与 composerId 统计
        const sessionGroups = new Map(); // id -> {messages: [], composerCount: Map}
        
        for (const row of bubbles) {
            try {
                const bubbleData = JSON.parse(row.value);
                if (!bubbleData || typeof bubbleData !== 'object') {
                    continue;
                }
                
                // 兼容不同数据结构：优先使用 value 内的 conversationId；否则从 key 解析
                let conversationId = bubbleData?.conversationId;
                let keyComposerId = null;
                if (typeof row.key === 'string' && row.key.startsWith('bubbleId:')) {
                    const parts = row.key.split(':');
                    if (parts.length >= 3) {
                        keyComposerId = parts[1];
                        if (!conversationId) conversationId = keyComposerId; // 对齐 cursor-view：用 composerId 作为聚类键
                    }
                }
                if (!conversationId) continue;
                
                if (!sessionGroups.has(conversationId)) {
                    sessionGroups.set(conversationId, { messages: [], composerCount: new Map() });
                }
                const group = sessionGroups.get(conversationId);
                
                // 统一消息结构（通过辅助函数提取）
                const { text, role } = this.extractBubbleTextAndRole(bubbleData);
                const timestamp = bubbleData.cTime || bubbleData.timestamp || bubbleData.time || bubbleData.createdAt || bubbleData.lastUpdatedAt || null;
                const composerId = bubbleData.composerId || bubbleData.composerID || keyComposerId || null;
                
                if (composerId) {
                    group.composerCount.set(composerId, (group.composerCount.get(composerId) || 0) + 1);
                }
                if (text) {
                    group.messages.push({ role, content: text, timestamp, composerId: composerId || undefined });
                }
            } catch (error) {
                console.warn('⚠️ 解析气泡数据失败:', error.message);
            }
        }
        
        const sessions = [];
        for (const [conversationId, data] of sessionGroups) {
            const messages = data.messages;
            if (messages.length === 0) continue;
            
            // 排序
            messages.sort((a, b) => {
                const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                return ta - tb;
            });
            // 取出现频率最高的 composerId
            let topComposerId = null; let best = 0;
            for (const [cid, cnt] of data.composerCount.entries()) {
                if (cnt > best) { best = cnt; topComposerId = cid; }
            }
            
            sessions.push({
                sessionId: conversationId,
                composerId: topComposerId || null,
                messages,
                timestamp: messages[0]?.timestamp || null
            });
        }
        
        console.log(`📚 提取到 ${sessions.length} 个会话`);
        return sessions;
    }

    // 获取备用数据
    getFallbackData() {
        console.log('🔄 使用备用数据');
        return [
            {
                sessionId: 'fallback-1',
                messages: [
                    {
                        role: 'user',
                        content: '这是一个备用示例消息',
                        timestamp: new Date().toISOString()
                    },
                    {
                        role: 'assistant',
                        content: '这是备用模式的AI回复。请安装SQLite引擎以获取真实数据。',
                        timestamp: new Date().toISOString()
                    }
                ],
                timestamp: new Date().toISOString()
            }
        ];
    }

    // 推断项目信息
    inferProjectFromMessages(messages, sessionIndex) {
        const allText = messages.map(m => m.content).join(' ').toLowerCase();
        
        // 技术栈关键词匹配
        const techKeywords = {
            'React开发': ['react', 'jsx', 'component', 'usestate', 'useeffect'],
            'Vue开发': ['vue', 'vuejs', 'nuxt', 'composition api'],
            'Node.js开发': ['node', 'express', 'npm', 'package.json'],
            'Python开发': ['python', 'django', 'flask', 'pip', 'requirements.txt'],
            'AI/ML咨询': ['机器学习', 'ai', 'model', 'training', 'neural'],
            'Web开发': ['html', 'css', 'javascript', 'web', 'frontend'],
            '数据库设计': ['sql', 'database', 'mysql', 'postgresql', 'mongodb']
        };
        
        for (const [projectType, keywords] of Object.entries(techKeywords)) {
            if (keywords.some(keyword => allText.includes(keyword))) {
                return {
                    name: projectType,
                    rootPath: `C:\\Projects\\${projectType.replace(/[^a-zA-Z0-9]/g, '_')}`,
                    fileCount: Math.floor(Math.random() * 50) + 10
                };
            }
        }
        
        return {
            name: 'Cursor通用对话',
            rootPath: 'C:\\Projects\\General',
            fileCount: 5
        };
    }

    // 获取所有聊天会话
    async getChats(options = {}) {
        const includeUnmapped = !!(options && (options.includeUnmapped === true || options.includeUnmapped === 'true' || options.includeUnmapped === 1 || options.includeUnmapped === '1'));
        const segmentMinutes = Number(options?.segmentMinutes || 0); // 默认不分段；>0 时按分钟切分
        console.log(`📚 获取聊天会话...`);

        // 轻量缓存：按 (mode, segmentMinutes, includeUnmapped) 维度缓存“未按 openPath 过滤”的全集
        const now = Date.now();
        if (!this._historyCache) this._historyCache = new Map();
        const cacheKey = JSON.stringify({
            mode: options && options.mode ? String(options.mode) : 'default',
            segment: segmentMinutes || 0,
            includeUnmapped: includeUnmapped ? 1 : 0,
            summary: (options && (options.summary === true || options.summary === 'true' || options.summary === 1 || options.summary === '1')) ? 1 : 0
        });
        const cached = this._historyCache.get(cacheKey);
        if (cached && (now - cached.ts) < this.cacheTimeout) {
            let base = cached.items;
            // 如传入 openPath，则在缓存基础上做过滤
            if (options && options.filterOpenPath) {
                const basePath = this.normalizePath(options.filterOpenPath).toLowerCase();
                const baseCv = this.encodeCursorViewPath(options.filterOpenPath).toLowerCase();
                const ensureSlash = (s) => (s.endsWith('/') ? s : s + '/');
                const isPrefix = (root) => {
                    if (!root) return false;
                    const r1 = this.normalizePath(root).toLowerCase();
                    const r2 = this.encodeCursorViewPath(root).toLowerCase();
                    const ok1 = r1 === basePath || r1.startsWith(ensureSlash(basePath)) || basePath.startsWith(ensureSlash(r1));
                    const ok2 = r2 === baseCv || r2.startsWith(ensureSlash(baseCv)) || baseCv.startsWith(ensureSlash(r2));
                    return ok1 || ok2;
                };
                base = base.filter(c => isPrefix(c?.project?.rootPath || ''));
            }
            console.log(`📚 使用缓存的历史记录: ${base.length} 个会话`);
            return base;
        }

        // 优先：cursor-view 等价实现（显式启用）
        if (options && options.mode === 'cv') {
            try {
                const isSummary = !!(options && (options.summary === true || options.summary === 'true' || options.summary === 1 || options.summary === '1'));
                const cvChats = this.getChatsCursorView(isSummary);
                const normalizedAll = cvChats.map(c => ({
                    sessionId: c.session_id,
                    project: c.project,
                    messages: isSummary ? [] : (Array.isArray(c.messages) ? c.messages : []),
                    date: typeof c.date === 'number' ? new Date(c.date * 1000).toISOString() : (c.date || new Date().toISOString()),
                    workspaceId: c.workspace_id || 'unknown',
                    dbPath: c.db_path || '',
                    isRealData: true,
                    dataSource: 'cursor-view'
                }));
                // 写入缓存（未按 openPath 过滤的全集）
                this._historyCache.set(cacheKey, { ts: now, items: normalizedAll });
                let normalized = normalizedAll;
                // 若指定 openPath 过滤，在 CV 模式同样生效
                if (options && options.filterOpenPath) {
                    const base = this.normalizePath(options.filterOpenPath).toLowerCase();
                    const baseCv = this.encodeCursorViewPath(options.filterOpenPath).toLowerCase();
                    const ensureSlash = (s) => (s.endsWith('/') ? s : s + '/');
                    const isPrefix = (root) => {
                        if (!root) return false;
                        const r1 = this.normalizePath(root).toLowerCase();
                        const r2 = this.encodeCursorViewPath(root).toLowerCase();
                        const ok1 = r1 === base || r1.startsWith(ensureSlash(base)) || base.startsWith(ensureSlash(r1));
                        const ok2 = r2 === baseCv || r2.startsWith(ensureSlash(baseCv)) || baseCv.startsWith(ensureSlash(r2));
                        return ok1 || ok2;
                    };
                    normalized = normalized.filter(c => isPrefix(c?.project?.rootPath || ''));
                }
                console.log(`📊 返回 ${normalized.length} 个聊天会话`);
                return normalized;
            } catch (e) {
                console.error('❌ CV 模式失败:', e.message);
                return [];
            }
        }
        
        try {
            // 1) 采用“composerId 优先”的会话聚合（对齐 Cursor-view）：
            const sessions = await this.extractSessionsComposerFirst();
            // 同步补充：面板/工作区/全局的 chatdata 与 composerData（尽量增强消息完整性）
            try { const globalPaneSessions = this.extractChatSessionsFromGlobalPane(); for (const s of globalPaneSessions) sessions.push(s); } catch {}
            try { const wsPaneSessions = this.extractWorkspaceChatSessions(); for (const s of wsPaneSessions) sessions.push(s); } catch {}
            try { const wsBubbleSessions = await this.extractChatMessagesFromWorkspaces(); for (const s of wsBubbleSessions) sessions.push(s); } catch {}
            try { const composerSessions = await this.extractSessionsFromComposerData(); for (const s of composerSessions) sessions.push(s); } catch {}

            // 2) 提取所有 workspace 项目信息（根目录）
            let projectsArray = await this.extractWorkspaceProjects();
            console.log(`📁 workspace 项目信息: ${projectsArray.length} 条`);
            // 消弥已编码/未编码差异：保留一份未编码版本用于匹配
            const projectsArrayForMatch = projectsArray.map(p => ({
                ...p,
                rootPathRaw: p.rootPath,
                rootPath:
                    p.rootPath && /^\/[A-Za-z]%3A\//.test(p.rootPath)
                        ? decodeURIComponent(p.rootPath.replace(/^\//, '').replace('%3A', ':'))
                        : this.normalizePath(p.rootPath)
            }));

            // 3) 主映射：composerId -> 项目（对齐 cursor-view-main）
            const { composerToProject, conversationToProject, composerToWorkspace, workspaceToProject, workspaceCandidates, globalCandidates } = this.buildComposerProjectIndex();
            // 保存一份全局候选，供 cvExtractChats 兜底
            this.lastComposerProjectIndex = { composerToProject, conversationToProject, composerToWorkspace, workspaceToProject, workspaceCandidates, globalCandidates };
            console.log(`🔗 composer 映射条数: ${composerToProject.size}, 会话映射: ${conversationToProject.size}`);

            // 预先构建便于匹配的数组
            const projectRootsForLongest = [];

            // 可选：对每个会话按时间进行分段切割
            const splitSessionsByTime = (session) => {
                if (!Array.isArray(session.messages) || session.messages.length === 0 || segmentMinutes <= 0) {
                    return [session];
                }
                const thresholdMs = segmentMinutes * 60 * 1000;
                // 按时间升序
                const ordered = [...session.messages].sort((a, b) => {
                    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                    return ta - tb;
                });
                const segments = [];
                let current = [];
                let lastTs = null;
                for (const m of ordered) {
                    const ts = m.timestamp ? new Date(m.timestamp).getTime() : null;
                    if (current.length === 0) {
                        current.push(m);
                        lastTs = ts;
                        continue;
                    }
                    if (ts != null && lastTs != null && (ts - lastTs) > thresholdMs) {
                        segments.push(current);
                        current = [m];
                    } else {
                        current.push(m);
                    }
                    lastTs = ts;
                }
                if (current.length > 0) segments.push(current);
                // 生成分段会话
                const out = segments.map((msgs, idx) => ({
                    ...session,
                    sessionId: `${session.sessionId}#${idx + 1}`,
                    messages: msgs,
                    timestamp: msgs[0]?.timestamp || session.timestamp
                }));
                return out;
            };

            // 展开分段
            const expandedSessions = segmentMinutes > 0 ? sessions.flatMap(splitSessionsByTime) : sessions;

            const allChats = expandedSessions.map((session) => {
                // 严格对齐 cursor-view：优先 conversation → project，再 composer → project，再 composer → workspace → projectRoot
                let projectInfo = null;
                const baseId = String(session.sessionId || '').split('#')[0];
                if (!projectInfo && conversationToProject.has(session.sessionId)) projectInfo = { ...conversationToProject.get(session.sessionId) };
                if (!projectInfo && baseId && conversationToProject.has(baseId)) projectInfo = { ...conversationToProject.get(baseId) };
                if (!projectInfo && session.composerId && conversationToProject.has(session.composerId)) projectInfo = { ...conversationToProject.get(session.composerId) };
                if (!projectInfo && session.composerId && composerToProject.has(session.composerId)) projectInfo = { ...composerToProject.get(session.composerId) };
                if (!projectInfo && composerToProject.has(session.sessionId)) projectInfo = { ...composerToProject.get(session.sessionId) };
                if (!projectInfo && baseId && composerToProject.has(baseId)) projectInfo = { ...composerToProject.get(baseId) };
                if (!projectInfo) {
                    const wsId = composerToWorkspace.get(session.sessionId) || (session.composerId && composerToWorkspace.get(session.composerId));
                    const wsProj = wsId && workspaceToProject.get(wsId);
                    if (wsProj && wsProj.rootPath && wsProj.rootPath !== '/') {
                        projectInfo = { ...wsProj };
                    }
                }
                // 若名称无效（如 d%3A、/），用路径末段修正
                if (projectInfo) {
                    const nm = (projectInfo.name||'').toLowerCase();
                    if (!nm || nm === 'd%3a' || nm === 'unknown project' || nm === 'root') {
                        projectInfo = { ...projectInfo, name: this.extractProjectNameFromPath(projectInfo.rootPath) };
                    }
                }
                if (projectInfo) {
                    if ((!projectInfo.rootPath || projectInfo.rootPath === '(unknown)') && projectInfo.name) {
                        const byName = projectsArray.find(p => (p.name || '').toLowerCase() === projectInfo.name.toLowerCase());
                        if (byName) projectInfo = { ...projectInfo, rootPath: byName.rootPath };
                    }
                    // 对齐 cursor-view-main：当 rootPath 仍为空/unknown 时，回退到该会话所属 workspace 的项目根
                    if (!projectInfo.rootPath || projectInfo.rootPath === '(unknown)') {
                        const wsIdForUnknown = composerToWorkspace.get(session.sessionId) || (session.composerId && composerToWorkspace.get(session.composerId));
                        const wsProjForUnknown = wsIdForUnknown && workspaceToProject.get(wsIdForUnknown);
                        if (wsProjForUnknown && wsProjForUnknown.rootPath && wsProjForUnknown.rootPath !== '/') {
                            projectInfo = { ...projectInfo, rootPath: wsProjForUnknown.rootPath, name: projectInfo.name || wsProjForUnknown.name };
                        }
                    }
                    // KISS：若根为盘符/根或容器（Repos/Code/Projects/workspace/src），视为未知，不再做任何推断
                    const normRoot = this.normalizePath(projectInfo.rootPath);
                    const invalidRoot = !normRoot || /^(?:[A-Za-z]:)?\/?$/.test(normRoot) || /\/(repos|code|projects|workspace|src)\/?$/i.test(normRoot);
                    if (invalidRoot) {
                        projectInfo = { ...projectInfo, rootPath: '(unknown)', name: projectInfo.name || '(unknown)' };
                    }
                    if (!this.alignCursorViewMain) {
                        // 仅在不对齐 cursor-view-main 时做归一
                        const gitRoot = this.resolveGitRoot(projectInfo.rootPath);
                        if (gitRoot && gitRoot !== projectInfo.rootPath) {
                            projectInfo = { ...projectInfo, rootPath: gitRoot, name: this.extractProjectNameFromPath(gitRoot) };
                        }
                        projectInfo = this.refineContainerProjectRoot(projectInfo, session.messages);
                        if (this.isContainerRoot(projectInfo.rootPath)) {
                            projectInfo = null;
                        }
                    }
                }
                // 与 cursor-view-main 一致：默认无映射的会话不计入列表；如显式要求则保留为“未映射”
                if (!projectInfo) {
                    if (!includeUnmapped) return null;
                    // 对齐 cursor-view：未映射统一归入 "(unknown)"
                    projectInfo = { name: '(unknown)', rootPath: '(unknown)', fileCount: 0 };
                }
                
                return {
                    sessionId: session.sessionId,
                    project: projectInfo,
                    messages: session.messages,
                    date: (session.messages && session.messages.length > 0 ? (session.messages[session.messages.length - 1].timestamp || session.timestamp) : session.timestamp),
                    workspaceId: 'global',
                    dbPath: 'global',
                    isRealData: this.sqliteEngine.type !== 'fallback',
                    dataSource: this.sqliteEngine.type,
                    isUnmapped: projectInfo.name === '未映射'
                };
            });
            
            // 过滤掉无映射会话
            const mappedChats = allChats.filter(Boolean);
            // 去重：按 sessionId 保留消息更多或时间更新的一条
            const uniq = new Map();
            for (const chat of mappedChats) {
                const id = chat.sessionId;
                const prev = uniq.get(id);
                if (!prev) {
                    uniq.set(id, chat);
                } else {
                    const prevScore = (prev.messages?.length || 0);
                    const curScore = (chat.messages?.length || 0);
                    const newer = new Date(chat.date) > new Date(prev.date);
                    if (curScore > prevScore || newer) uniq.set(id, chat);
                }
            }
            const deduped = Array.from(uniq.values());
            // 按日期排序
            deduped.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            // 先写入缓存（未按 openPath 过滤的全集）
            this._historyCache.set(cacheKey, { ts: now, items: deduped });
            
            // 若指定了 openPath 过滤（不改变账号根，仅过滤结果集）
            let filtered = deduped;
            if (options && options.filterOpenPath) {
                const base = this.normalizePath(options.filterOpenPath).toLowerCase();
                const baseCv = this.encodeCursorViewPath(options.filterOpenPath).toLowerCase();
                const ensureSlash = (s) => (s.endsWith('/') ? s : s + '/');
                const isPrefix = (root) => {
                    if (!root) return false;
                    const r1 = this.normalizePath(root).toLowerCase();
                    const r2 = this.encodeCursorViewPath(root).toLowerCase();
                    const b1 = base; const b2 = baseCv;
                    // 前缀或相等（双向，防止 openPath 更深或更浅时误判）
                    const ok1 = r1 === b1 || r1.startsWith(ensureSlash(b1)) || b1.startsWith(ensureSlash(r1));
                    const ok2 = r2 === b2 || r2.startsWith(ensureSlash(b2)) || b2.startsWith(ensureSlash(r2));
                    return ok1 || ok2;
                };
                filtered = deduped.filter(c => {
                    const pr = c?.project?.rootPath || '';
                    return isPrefix(pr);
                });
            }

            console.log(`📊 返回 ${filtered.length} 个聊天会话`);
            return filtered;
            
        } catch (error) {
            console.error('❌ 获取聊天失败:', error.message);
            return this.getFallbackData().map(session => ({
                ...session,
                project: { name: '未匹配项目', rootPath: '', fileCount: 0 },
                date: session.timestamp,
                workspaceId: 'fallback',
                dbPath: 'fallback',
                isRealData: false,
                dataSource: 'fallback'
            }));
        }
    }

    // 获取聊天记录列表（支持 summary 精简）
    async getHistory(options = {}) {
        const { limit = 50, offset = 0, summary = false } = options;
        
        const chats = await this.getChats(options);
        let paginatedChats = chats.slice(offset, offset + limit);

        if (summary) {
            paginatedChats = paginatedChats.map(chat => {
                const idA = chat.sessionId || chat.session_id || null;
                const idB = chat.session_id || chat.sessionId || null;
                const msgs = Array.isArray(chat.messages) ? chat.messages.slice(-3) : [];
                return {
                    sessionId: idA,
                    session_id: idB,
                    project: chat.project || null,
                    date: chat.date || null,
                    timestamp: chat.timestamp || chat.date || null,
                    messages: msgs
                };
            });
        }
        
        return {
            items: paginatedChats,
            total: chats.length,
            offset: offset,
            limit: limit,
            hasMore: offset + limit < chats.length
        };
    }

    // 获取单个聊天记录（支持透传 options，例如 mode=cv）
    async getHistoryItem(sessionId, options = {}) {
        try{
            const maxAge = Math.max(0, Math.min(Number(options.maxAgeMs||0) || 0, 10000));
            const now = Date.now();
            const key = String(sessionId);
            const cached = this._historyItemCache.get(key);
            if (cached && (!maxAge || (now - cached.ts) <= maxAge)) return cached.item;

            // 仅走精准提取，避免全库扫描导致阻塞；未命中直接返回 null
            const fast = await this.getHistoryItemFast(sessionId, options);
            if (fast) {
                this._historyItemCache.set(key, { ts: now, item: fast });
                return fast;
            }
            return null;
        }catch(e){ return null; }
    }

    /**
     * 精准提取单会话（仅访问包含该会话ID的相关键）
     * 仅实现 better-sqlite3 路径，其它引擎回退全量
     */
    async getHistoryItemFast(sessionId, options = {}){
        try{
            if (!sessionId) return null;
            if (this.sqliteEngine?.type !== 'better-sqlite3') return null;
            const Database = require('better-sqlite3');
            const messages = [];
            let project = null;
            let lastTs = null;
            let sourceDbPath = null;
            const MAX_MSGS = 2000; // 防止极端超长会话阻塞解析

            const push = (role, content, ts) => {
                const text = (content||'').toString(); if (!text.trim()) return;
                if (messages.length >= MAX_MSGS) return;
                messages.push({ role, content: text, timestamp: ts || null });
                if (ts) lastTs = lastTs ? Math.max(lastTs, new Date(ts).getTime()) : new Date(ts).getTime();
            };

            // 工具：从 DB 快速收集此 session 的消息
            const collectFromDb = (dbPath) => {
                const db = new Database(dbPath, { readonly: true });
                try {
                    const t0 = Date.now(); let readRows = 0;
                    const before = messages.length;
                    // bubbleId:sessionId:* 优先，用区间查询便于命中索引
                    let hadBubble = false;
                    try{
                        const lower = `bubbleId:${sessionId}:`;
                        const upper = lower + String.fromCharCode(0xffff);
                        const stmt = db.prepare("SELECT key, value FROM cursorDiskKV WHERE key >= ? AND key < ?");
                        const rows = stmt.all(lower, upper);
                        readRows += rows.length;
                        for (const row of rows){
                            try{
                                const v = row.value ? JSON.parse(row.value) : null; if (!v) continue;
                                const { text, role } = this.extractBubbleTextAndRole(v);
                                const ts = v?.cTime || v?.timestamp || v?.time || v?.createdAt || v?.lastUpdatedAt || null;
                                if (text) push(role||'assistant', text, ts);
                            }catch{}
                        }
                        hadBubble = rows.length > 0;
                    }catch{}
                    // composerData:sessionId
                    try{
                        const r = db.prepare("SELECT value FROM cursorDiskKV WHERE key=?").get(`composerData:${sessionId}`);
                        if (!hadBubble && r && r.value){
                            try{
                                const data = JSON.parse(r.value);
                                const arrs = [data?.conversation, data?.messages, data?.history, data?.logs, data?.generations];
                                const toTs = (o)=> o?.timestamp || o?.time || o?.createdAt || o?.lastUpdatedAt || null;
                                for (const arr of arrs){
                                    if (!Array.isArray(arr)) continue;
                                    for (const m of arr){
                                        const role = (m?.role==='user'||m?.type===1) ? 'user' : 'assistant';
                                        const t = m?.content || m?.text || m?.output || '';
                                        if (t) push(role, t, toTs(m));
                                    }
                                }
                                if (typeof data?.prompt === 'string') push('user', data.prompt, data?.createdAt);
                                if (typeof data?.response === 'string') push('assistant', data.response, data?.lastUpdatedAt||data?.createdAt);
                            }catch{}
                        }
                    }catch{}
                    // 面板 chatdata.tabs 里查找该 tabId
                    try{
                        const r = db.prepare("SELECT value FROM ItemTable WHERE key='workbench.panel.aichat.view.aichat.chatdata'").get();
                        const pane = r && r.value ? JSON.parse(r.value) : null;
                        const tabs = Array.isArray(pane?.tabs) ? pane.tabs : [];
                        for (const tab of tabs){
                            if (String(tab?.tabId) !== String(sessionId)) continue;
                            for (const b of (tab?.bubbles||[])){
                                const { text, role } = this.extractBubbleTextAndRole(b);
                                const ts = b?.cTime || b?.timestamp || b?.time || b?.createdAt || b?.lastUpdatedAt || tab?.lastUpdatedAt || tab?.createdAt || null;
                                if (text) push(role||'assistant', text, ts);
                            }
                        }
                    }catch{}
                    if (options.debug){
                        const ms = Date.now()-t0;
                        console.log(`⏱️  getHistoryItemFast scan ${dbPath} rows≈${readRows} in ${ms}ms`);
                    }
                    return messages.length - before;
                } finally { try{ db.close(); }catch{} }
            };

            // 若有历史索引，先尝试命中的 DB，命中则直接返回
            try{
                const hit = this._sessionDbIndex.get(String(sessionId));
                if (hit && require('fs').existsSync(hit.dbPath)){
                    const addedHit = collectFromDb(hit.dbPath);
                    if (addedHit > 0){
                        sourceDbPath = hit.dbPath;
                        if (!project && hit.project) project = hit.project;
                    }
                }
            }catch{}

            // 查询全局 DB
            const path = require('path');
            const fs = require('fs');
            const globalDb = path.join(this.cursorStoragePath, 'User', 'globalStorage', 'state.vscdb');
            if (!messages.length && fs.existsSync(globalDb)){
                const added = collectFromDb(globalDb);
                if (added > 0){ sourceDbPath = globalDb; /* project 可能仍为空，后续在 workspace 命中时补 */ }
            }

            // 查询各 workspace DB，顺便确定 project 根
            const workspaces = this.findWorkspaceDatabases();
            for (const ws of workspaces){
                try{
                    const dbPath = ws.workspaceDb || ws.dbPath || ws;
                    if (!dbPath || !fs.existsSync(dbPath)) continue;
                    if (messages.length && project){ break; }
                    const added = collectFromDb(dbPath);
                    if (added > 0 && !project){
                        // 仅当此 workspace 命中该会话时，读取一次项目根（单条 ItemTable）
                        const Database2 = new Database(dbPath, { readonly: true });
                        try{
                            let proj = { name: '(unknown)', rootPath: '(unknown)' };
                            try{
                                const row = Database2.prepare("SELECT value FROM ItemTable WHERE key='history.entries'").get();
                                const entries = row && row.value ? JSON.parse(row.value) : [];
                                const paths = [];
                                for (const e of entries){ const r = e?.editor?.resource || ''; if (typeof r==='string' && r.startsWith('file:///')) paths.push(r.slice('file:///'.length)); }
                                if (paths.length>0){
                                    const pref = this.cvLongestCommonPrefix(paths);
                                    const last = pref.lastIndexOf('/');
                                    const root = last>0 ? pref.slice(0,last) : pref;
                                    const name = this.cvExtractProjectNameFromPath(root);
                                    proj = { name: name || '(unknown)', rootPath: '/' + String(root).replace(/^\/+/,'') };
                                }
                            }catch{}
                            // 兜底 debug.selectedroot
                            if (!proj || !proj.rootPath || proj.rootPath==='(unknown)' || proj.rootPath==='/'){
                                try{
                                    const r2 = Database2.prepare("SELECT value FROM ItemTable WHERE key='debug.selectedroot'").get();
                                    const sel = r2 && r2.value ? JSON.parse(r2.value) : null;
                                    if (typeof sel==='string' && sel.startsWith('file:///')){
                                        const root = sel.slice('file:///'.length);
                                        const name = this.cvExtractProjectNameFromPath(root);
                                        proj = { name: name || '(unknown)', rootPath: '/' + String(root).replace(/^\/+/,'') };
                                    }
                                }catch{}
                            }
                            project = proj;
                        } finally { try{ Database2.close(); }catch{} }
                        sourceDbPath = dbPath;
                        // 已找到消息且拿到项目后，提前结束扫描（避免遍历所有 workspace）
                        break;
                    }
                }catch{}
            }

            if (messages.length === 0) return null;
            const date = lastTs ? new Date(lastTs).toISOString() : (messages[0]?.timestamp || new Date().toISOString());
            if (!project) project = { name: 'Unknown Project', rootPath: '/' };
            const item = {
                sessionId: String(sessionId),
                project,
                messages,
                date,
                workspaceId: 'fast',
                dbPath: 'fast',
                isRealData: true,
                dataSource: 'better-sqlite3'
            };
            // 写入 session -> dbPath 索引，便于后续快速命中
            try{ if (sourceDbPath) this._sessionDbIndex.set(String(sessionId), { dbPath: sourceDbPath, project, ts: Date.now() }); }catch{}
            return item;
        }catch(e){ return null; }
    }

    // 获取统计信息
    async getStatistics(options = {}) {
        const chats = await this.getChats(options);
        const stats = {
            total: chats.length,
            byType: {},
            byDay: {},
            recentActivity: []
        };

        // 按项目统计
        chats.forEach(chat => {
            const projectName = chat.project?.name || 'Unknown';
            stats.byType[projectName] = (stats.byType[projectName] || 0) + 1;
        });

        // 按天统计
        chats.forEach(chat => {
            const date = new Date(chat.date || Date.now());
            const dayKey = date.toISOString().split('T')[0];
            stats.byDay[dayKey] = (stats.byDay[dayKey] || 0) + 1;
        });

        // 最近活动
        stats.recentActivity = chats.slice(0, 10).map(chat => ({
            id: chat.sessionId,
            type: 'chat',
            timestamp: new Date(chat.date).getTime(),
            summary: `${chat.project?.name}: ${chat.messages.length} 条消息`
        }));

        return stats;
    }

    // 其他方法保持与原版本兼容
    clearCache() {
        this.cachedHistory = null;
        this.lastCacheTime = 0;
        this._historyCache = new Map();
        console.log('🗑️ 历史记录缓存已清除');
    }

    async addHistory(item) {
        console.log('⚠️ 不支持添加历史记录到Cursor数据库');
        return false;
    }

    async deleteHistory(id) {
        console.log('⚠️ 不支持从Cursor数据库删除历史记录');
        return false;
    }

    async clearHistory() {
        console.log('⚠️ 不支持清除Cursor数据库历史记录');
        return false;
    }

    async searchHistory(query, options = {}) {
        const chats = await this.getChats();
        
        const filtered = chats.filter(chat => {
            const content = chat.messages.map(m => m.content).join(' ').toLowerCase();
            const projectName = (chat.project?.name || '').toLowerCase();
            return content.includes(query.toLowerCase()) || projectName.includes(query.toLowerCase());
        });

        return {
            items: filtered,
            total: filtered.length,
            query: query
        };
    }

    async exportHistory(format = 'json') {
        const chats = await this.getChats();
        
        switch (format) {
            case 'json':
                return JSON.stringify(chats, null, 2);
            case 'csv':
                let csv = 'Project,Date,MessageCount,FirstMessage\n';
                chats.forEach(chat => {
                    const project = chat.project?.name || '';
                    const date = chat.date || '';
                    const count = chat.messages.length;
                    const first = chat.messages[0]?.content || '';
                    csv += `"${project}","${date}","${count}","${first.substring(0, 100)}"\n`;
                });
                return csv;
            default:
                return JSON.stringify(chats, null, 2);
        }
    }

    // 汇总唯一项目列表，便于与 cursor-view-main 对比
    async getProjectsSummary(options = {}) {
        // 与 cursor-view-main 一致：直接依据 workspace 派生的项目根列表
        const projectsArray = await this.extractWorkspaceProjects();
        // 去重保持稳定顺序
        const seen = new Set();
        const unique = [];
        for (const p of projectsArray) {
            const key = p.rootPath;
            if (seen.has(key)) continue;
            seen.add(key);
            unique.push({ name: p.name, rootPath: p.rootPath, chatCount: 0 });
        }
        // 若指定 openPath 过滤，保留命中的项目根
        if (options && options.filterOpenPath) {
            const base = this.normalizePath(options.filterOpenPath).toLowerCase();
            const baseCv = this.encodeCursorViewPath(options.filterOpenPath).toLowerCase();
            const ensureSlash = (s) => (s.endsWith('/') ? s : s + '/');
            const isPrefix = (root) => {
                if (!root) return false;
                const r1 = this.normalizePath(root).toLowerCase();
                const r2 = this.encodeCursorViewPath(root).toLowerCase();
                const ok1 = r1 === base || r1.startsWith(ensureSlash(base)) || base.startsWith(ensureSlash(r1));
                const ok2 = r2 === baseCv || r2.startsWith(ensureSlash(baseCv)) || baseCv.startsWith(ensureSlash(r2));
                return ok1 || ok2;
            };
            return unique.filter(p => isPrefix(p.rootPath));
        }
        return unique;
    }
}

module.exports = CursorHistoryManager;