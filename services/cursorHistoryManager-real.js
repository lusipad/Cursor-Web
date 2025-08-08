// Cursor历史记录管理器 - 真实数据版本
const fs = require('fs');
const path = require('path');
const os = require('os');

class CursorHistoryManager {
    constructor() {
        this.cursorStoragePath = this.getCursorStoragePath();
        this.cachedHistory = null;
        this.lastCacheTime = 0;
        this.cacheTimeout = 30000; // 30秒缓存
        this.sqliteEngine = null;
        // 对齐 cursor-view-main 的项目提取与分组表现：
        // - 不做 Git 根提升
        // - 不做容器目录细化
        // - history.entries 中的路径保持原始编码（如 /d%3A/...）用于项目根
        this.alignCursorViewMain = true;
        
        console.log(`📁 Cursor数据路径: ${this.cursorStoragePath}`);
        this.initializeSQLiteEngine();
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

    // 获取Cursor存储路径
    getCursorStoragePath() {
        const platform = os.platform();
        const home = os.homedir();
        
        switch (platform) {
            case 'darwin': // macOS
                return path.join(home, 'Library', 'Application Support', 'Cursor');
            case 'win32': // Windows
                return path.join(home, 'AppData', 'Roaming', 'Cursor');
            case 'linux': // Linux
                return path.join(home, '.config', 'Cursor');
            default:
                throw new Error(`不支持的平台: ${platform}`);
        }
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
        if (!projectPath || projectPath === '/') return 'Unknown Project';
        const parts = projectPath.replace(/\\/g, '/').split('/').filter(Boolean);
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
                        messages.push({ role, content: String(text), composerId: tabId });
                    }
                    if (messages.length > 0) {
                        sessions.push({ sessionId: tabId, composerId: tabId, messages, timestamp: messages[0]?.timestamp || new Date().toISOString() });
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
                
                // 统一消息结构
                const type = bubbleData.type;
                const role = (type === 1 || type === 'user') ? 'user' : (type === 2 || type === 'assistant') ? 'assistant' : 'assistant';
                const text = (bubbleData.text || bubbleData.richText || '').trim();
                const timestamp = bubbleData.cTime || bubbleData.timestamp || null;
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
                timestamp: messages[0]?.timestamp || new Date().toISOString()
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
    async getChats() {
        console.log(`📚 获取聊天会话...`);
        
        try {
            // 1) 从全局提取会话（cursor-view-main 读取全局 bubbleId），并合并 workspace chatdata 补充
            const sessions = await this.extractChatMessagesFromGlobal();
            try {
                const wsSessions = this.extractWorkspaceChatSessions();
                for (const s of wsSessions) sessions.push(s);
            } catch {}

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
            const { composerToProject, conversationToProject, composerToWorkspace, workspaceToProject } = this.buildComposerProjectIndex();
            console.log(`🔗 composer 映射条数: ${composerToProject.size}, 会话映射: ${conversationToProject.size}`);

            // 预先构建便于匹配的数组
            const projectRootsForLongest = [];

            const allChats = sessions.map((session) => {
                // 严格对齐 cursor-view：优先 conversation → project，再 composer → project，再 composer → workspace → projectRoot
                let projectInfo = null;
                if (!projectInfo && conversationToProject.has(session.sessionId)) projectInfo = { ...conversationToProject.get(session.sessionId) };
                if (!projectInfo && session.composerId && conversationToProject.has(session.composerId)) projectInfo = { ...conversationToProject.get(session.composerId) };
                if (!projectInfo && session.composerId && composerToProject.has(session.composerId)) projectInfo = { ...composerToProject.get(session.composerId) };
                if (!projectInfo && composerToProject.has(session.sessionId)) projectInfo = { ...composerToProject.get(session.sessionId) };
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
                    // 强约束：若根为盘符/根或容器（Repos），用 workspace 项目根替换
                    const normRoot = this.normalizePath(projectInfo.rootPath);
                    const isShallow = /^(?:[A-Za-z]:)?\/?$/.test(normRoot) || /\/repos\/?$/i.test(normRoot);
                    if (isShallow) {
                        // 优先使用会话所属 workspace 的项目根
                        const wsId = composerToWorkspace.get(session.sessionId) || (session.composerId && composerToWorkspace.get(session.composerId));
                        const wsProj = wsId && workspaceToProject.get(wsId);
                        if (wsProj) {
                            projectInfo = { ...projectInfo, rootPath: wsProj.rootPath, name: wsProj.name };
                        } else {
                            // 退化为名称匹配或末段名称
                            const byName = projectsArray.find(p => (p.name||'').toLowerCase() === (projectInfo.name||'').toLowerCase());
                            if (byName) {
                                projectInfo = { ...projectInfo, rootPath: byName.rootPath, name: byName.name };
                            } else if (projectsArray.length > 0) {
                                const picked = projectsArray[0];
                                projectInfo = { ...projectInfo, rootPath: picked.rootPath, name: picked.name };
                            } else {
                                projectInfo = { ...projectInfo, name: this.extractProjectNameFromPath(projectInfo.rootPath) };
                            }
                        }
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
                // 与 cursor-view-main 一致：无映射的会话不计入列表
                if (!projectInfo) return null;

                return {
                    sessionId: session.sessionId,
                    project: projectInfo,
                    messages: session.messages,
                    date: (session.messages && session.messages.length > 0 ? (session.messages[session.messages.length - 1].timestamp || session.timestamp) : session.timestamp),
                    workspaceId: 'global',
                    dbPath: 'global',
                    isRealData: this.sqliteEngine.type !== 'fallback',
                    dataSource: this.sqliteEngine.type
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
            
            console.log(`📊 返回 ${deduped.length} 个聊天会话`);
            return deduped;
            
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

    // 获取聊天记录列表（兼容原有API）
    async getHistory(options = {}) {
        const { limit = 50, offset = 0 } = options;
        
        const chats = await this.getChats();
        const paginatedChats = chats.slice(offset, offset + limit);
        
        return {
            items: paginatedChats,
            total: chats.length,
            offset: offset,
            limit: limit,
            hasMore: offset + limit < chats.length
        };
    }

    // 获取单个聊天记录
    async getHistoryItem(sessionId) {
        const chats = await this.getChats();
        const chat = chats.find(chat => chat.sessionId === sessionId);
        return chat;
    }

    // 获取统计信息
    async getStatistics() {
        const chats = await this.getChats();
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
    async getProjectsSummary() {
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
        return unique;
    }
}

module.exports = CursorHistoryManager;