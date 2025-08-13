/**
 * ChatTimeline - 主页聊天时间线（基于历史拉取展示）
 * - 渲染目标容器：#messages-container
 * - 不依赖注入端的 html_content，发送后通过 HTTP 轮询获取助手回复
 */
class ChatTimeline {
  constructor() {
    this.container = document.getElementById('messages-container');
    if (!this.container) {
      console.warn('ChatTimeline: 未找到 #messages-container');
      return;
    }
    // 清理欢迎引导
    const welcome = this.container.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    // 创建时间线容器
    this.timeline = this.container.querySelector('.chat-timeline');
    if (!this.timeline) {
      this.timeline = document.createElement('div');
      this.timeline.className = 'chat-timeline';
      this.container.appendChild(this.timeline);
    }

    // 索引/状态
    this.msgIdToEl = new Map(); // msgId -> user message element（用于进度条）
    this.renderedHashSet = new Set(); // 渲染去重
    this.stickToBottom = true; // 用户未上滑时保持吸底
    this.typingMsgIdToEl = new Map(); // 兼容旧逻辑（不再使用 DOM 占位）
    this.streamBuffer = new Map(); // msgId -> 思考增量缓冲（仅内存，不渲染 DOM 占位）

    // 思考气泡显示开关（默认关闭）；支持 URL ?thinking=1 或 localStorage 'cw_show_thinking'='1'
    try {
      let on = false;
      try {
        const u = new URL(window.location.href);
        const q = u.searchParams.get('thinking');
        if (q === '1' || q === 'true') on = true;
        if (q === '0' || q === 'false') on = false;
      } catch {}
      if (!on) {
        try { const v = localStorage.getItem('cw_show_thinking'); if (v === '1' || v === 'true') on = true; } catch {}
      }
      this.showThinking = !!on;
    } catch { this.showThinking = false; }

    // 思考分段启发式开关（默认关闭，仅在 <think> 缺失时启用标题样式分段）
    try {
      let h = false;
      try {
        const u = new URL(window.location.href);
        const q = u.searchParams.get('thinkheur') || u.searchParams.get('thinkingHeuristic');
        if (q === '1' || q === 'true') h = true;
        if (q === '0' || q === 'false') h = false;
      } catch {}
      if (!h) { try { const v = localStorage.getItem('cw_thinking_heuristic'); if (v === '1' || v === 'true') h = true; } catch {} }
      this.useThinkingHeuristic = !!h;
    } catch { this.useThinkingHeuristic = false; }

    // 本地持久化（按实例隔离）
    this.MAX_PERSISTED_ITEMS = 200;
    this._isRestoring = false;
    this.storageKey = this._computeStorageKey();

    // 监听用户滚动，若上滑则暂时关闭吸底
    if (this.container) {
      this.container.addEventListener('scroll', () => {
        try {
          const nearBottom = (this.container.scrollTop + this.container.clientHeight) >= (this.container.scrollHeight - 30);
          this.stickToBottom = nearBottom;
        } catch {}
      });
    }

    // 启动时尝试恢复时间线
    try { this.restoreFromStorage(); } catch {}
  }

  // ======== 本地持久化 ========
  _computeStorageKey(){
    try{
      let iid = null;
      try { const u = new URL(window.location.href); iid = u.searchParams.get('instance') || null; } catch {}
      if (!iid) { try { iid = (window.InstanceUtils && InstanceUtils.get && InstanceUtils.get()) || null; } catch {} }
      if (!iid) iid = 'default';
      return `cw_timeline_${iid}`;
    }catch{ return 'cw_timeline_default'; }
  }
  _persistLoad(){
    try{
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    }catch{ return []; }
  }
  _persistSave(list){
    try{ localStorage.setItem(this.storageKey, JSON.stringify(list || [])); }catch{}
  }
  _persistAppend(item){
    const list = this._persistLoad();
    list.push({ role: String(item.role||'assistant'), content: String(item.content||''), timestamp: Number(item.timestamp||Date.now()), collapsed: item.collapsed===true });
    if (list.length > this.MAX_PERSISTED_ITEMS) list.splice(0, list.length - this.MAX_PERSISTED_ITEMS);
    this._persistSave(list);
  }
  restoreFromStorage(){
    let list = this._persistLoad();
    if (!list.length) return;
    // TTL 过期清理（默认 30 分钟）
    try { list = this._expireOldThinking(list, 30*60*1000); this._persistSave(list); } catch {}
    // 启动恢复前清洁一次：若思考后窗口内已有最终，则丢弃该思考
    try { list = this._cleanupPersistedThinking(list, 5*60*1000); this._persistSave(list); } catch {}
    this._isRestoring = true;
    try{
      for (const it of list){
        const role = String(it.role||'assistant');
        const ts = Number(it.timestamp||Date.now());
        const text = String(it.content||'');
        if (role === 'assistant_thinking') this.appendThinkingBubble(text, ts, it.collapsed!==false);
        else if (role === 'user') this.appendUserMessage(text, null, ts);
        else this.appendMessage('assistant', this.cleanMessageText(text, { keepThinking:false }), ts);
      }
    } finally { this._isRestoring = false; }
  }

  // 粗粒度解析“思考/最终”结构
  extractThinkingAndFinal(raw){
    try{
      const s = String(raw || '');
      let m = s.match(/<think>([\s\S]*?)<\/think>\s*([\s\S]*)$/i);
      if (m) return { thinking: m[1].trim(), final: (m[2]||'').trim() };
      if (this.useThinkingHeuristic) {
        const re = /^(?:\s*(?:思考|思考过程|推理|反思|Reasoning|Thoughts?|Chain[- ]?of[- ]?Thoughts?|CoT)\s*[:：]\s*)([\s\S]+?)(?:\n{2,}|\r?\n)(?:\s*(?:最终|答案|结论|结果|Final|Answer|Response|Conclusion)\s*[:：]\s*)([\s\S]*)$/i;
        m = s.match(re);
        if (m) return { thinking: m[1].trim(), final: (m[2]||'').trim() };
      }
      return { thinking: '', final: s };
    }catch{ return { thinking: '', final: String(raw||'') }; }
  }

  appendThinkingBubble(text, timestamp, collapsed = true){
    if (!this.timeline) return;
    if (!this.showThinking) return;
    const content = this.cleanMessageText(text, { keepThinking: true });
    if (!content) return;
    const item = document.createElement('div');
    item.className = `chat-message assistant-message thinking-message${collapsed ? ' collapsed' : ''}`;
    const ts = timestamp || Date.now();
    item.innerHTML = `
      <div class="bubble">
        <div class="meta">🤔 思考 · ${new Date(ts).toLocaleTimeString()} <button class="think-toggle" style="margin-left:8px;font-size:12px;">${collapsed?'展开':'收起'}</button></div>
        <div class="content thinking-content" style="${collapsed?'display:none;':''}">${this.sanitize(content)}</div>
      </div>`;
    this.timeline.appendChild(item);
    try{
      const btn = item.querySelector('.think-toggle');
      const cnt = item.querySelector('.thinking-content');
      btn?.addEventListener('click', ()=>{
        const hidden = cnt && getComputedStyle(cnt).display === 'none';
        if (cnt) cnt.style.display = hidden ? '' : 'none';
        if (btn) btn.textContent = hidden ? '收起' : '展开';
      });
    }catch{}
    this.scrollToLatest(item);
    try { if (!this._isRestoring) this._persistAppend({ role: 'assistant_thinking', content: String(text||''), timestamp: ts, collapsed: !!collapsed }); } catch {}
  }

  scrollToLatest(element){
    try{ if (element && element.scrollIntoView) element.scrollIntoView({ block:'end', behavior:'smooth' }); }catch{}
    try{ window.scrollTo({ top: document.documentElement.scrollHeight, behavior:'smooth' }); }catch{ try{ window.scrollTo(0, document.documentElement.scrollHeight || document.body.scrollHeight || 0); }catch{} }
  }

  // 过滤与净化：对助手消息应用与历史页相近的清洗规则
  cleanMessageText(rawText, options = {}) {
    try {
      const text = String(rawText == null ? '' : rawText);
      // 移除隐形标记（零宽编码、旧版 MSG:）与旧的 HTML 注释标记
      const stripMarkers = (s)=> s
        .replace(/\u2063[\u200B\u200C\u200D\u2060\u2062]+\u2063/g,'')
        .replace(/\u2063MSG:[^\u2063]+\u2063/g,'')
        .replace(/<!--#msg:[^>]+-->/g,'');
      const norm = stripMarkers(text);
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const shaRe = /^[0-9a-f]{7,40}$/i;
      const longAlphaNumRe = /^[A-Za-z0-9_\-]{20,}$/;
      const statusWordRe = /^(completed|complete|success|succeeded|ok|done|error|failed|failure|cancelled|canceled|timeout)$/i;
      const toolWordRe = /^(codebase[_\.-]?search|grep|read_file|run_terminal_cmd|apply_patch|read_lints|list_dir|glob(_file_search)?|create_diagram|fetch_pull_request|update_memory|functions\.[A-Za-z0-9_]+)$/i;
      const thinkHeadRe = /^(思考|思考过程|推理|反思|Reasoning|Thoughts?|Chain[- ]?of[- ]?Thoughts?|CoT)\s*[:：]/i;
      const techHeadRe = /^(Tool|Arguments|Result|Observation|工具调用|工具参数|工具结果|观察)\s*[:：]/i;
      const onlyUrlRe = /^(https?:\/\/[^\s]+)$/i;
      const fileLikeRe = /^(file:\/\/\/|vscode-file:\/\/|vscode-webview:\/\/|devtools:\/\/) /i;
      const fenceRe = /^`{3,}$/;

      const isNoiseLine = (s) => {
        if (typeof s !== 'string') return true;
        const v = s.trim();
        if (!v) return true;
        if (uuidRe.test(v)) return true;
        if (shaRe.test(v)) return true;
        if (longAlphaNumRe.test(v)) return true;
        if (statusWordRe.test(v)) return true;
        if (toolWordRe.test(v)) return true;
        if (techHeadRe.test(v)) return true;
        if (!options.keepThinking && thinkHeadRe.test(v)) return true;
        if (fenceRe.test(v)) return true;
        if (onlyUrlRe.test(v)) return true;
        if (/^(file:\/\/|vscode-)/i.test(v)) return true;
        return false;
      };

      const cleaned = norm
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l && !isNoiseLine(l))
        .join('\n')
        .trim();
      return cleaned;
    } catch { return String(rawText || ''); }
  }

  highlightCodeIn(element){
    try{
      if (!element) return;
      const nodes = element.querySelectorAll('pre code');
      nodes.forEach(node => {
        try {
          // 规范化 language-xxx（兼容 ```cpp:test.cpp 这类带附加信息的围栏）
          const classes = String(node.className || '').split(/\s+/).filter(Boolean);
          const langClass = classes.find(c => c.startsWith('language-')) || '';
          let lang = langClass ? langClass.replace(/^language-/, '') : '';
          if (window.MarkdownRenderer && typeof window.MarkdownRenderer.normalizeLanguage === 'function'){
            lang = window.MarkdownRenderer.normalizeLanguage(lang);
          } else {
            if (lang && /[:/]/.test(lang)) { lang = lang.split(/[:/]/)[0]; }
            const map = { 'c#':'csharp', 'cs':'csharp', 'c++':'cpp', 'ts':'typescript', 'tsx':'typescript', 'js':'javascript', 'jsx':'javascript', 'py':'python', 'shell':'bash', 'sh':'bash', 'md':'markdown', 'html':'markup', 'xml':'markup' };
            lang = map[String(lang||'').toLowerCase()] || lang;
          }
          if (!lang) lang = 'none';
          const rest = classes.filter(c => !c.startsWith('language-'));
          node.className = `language-${lang}` + (rest.length ? ` ${rest.join(' ')}` : '');
        } catch {}
      });
      try { if (window.Prism && window.Prism.highlightAllUnder) requestIdleCallback?.(()=>window.Prism.highlightAllUnder(element)); } catch {}
    }catch{}
  }

  sanitize(text) {
    try {
      if (window.MarkdownRenderer) {
        return window.MarkdownRenderer.renderMarkdown(String(text || ''), { breaks: false });
      }
      const div = document.createElement('div');
      div.textContent = String(text || '');
      return div.innerHTML;
    } catch { return ''; }
  }

  appendMessage(role, content, timestamp) {
    if (!this.timeline) return;
    const key = this.hashMessage(role, content, timestamp);
    if (this.renderedHashSet.has(key)) return;
    this.renderedHashSet.add(key);
    const item = document.createElement('div');
    item.className = `chat-message ${role === 'user' ? 'user-message' : 'assistant-message'}`;
    item.innerHTML = `
      <div class="bubble">
        <div class="meta">${role === 'user' ? '👤 我' : '🤖 助手'} · ${timestamp ? new Date(timestamp).toLocaleTimeString() : ''}</div>
        <div class="content">${this.sanitize(content)}</div>
      </div>
    `;
    this.timeline.appendChild(item);
    if (window.MarkdownRenderer) {
      window.MarkdownRenderer.highlight(item);
      try { requestAnimationFrame(()=> window.MarkdownRenderer.highlight(item)); } catch {}
    } else {
      this.highlightCodeIn(item);
      try { requestAnimationFrame(()=> this.highlightCodeIn(item)); } catch {}
    }
    this.scrollToLatest(item);
    try { if (!this._isRestoring) this._persistAppend({ role, content: String(content||''), timestamp: timestamp||Date.now() }); } catch {}
  }

  hashMessage(role, content) {
    try {
      const s = `${role}|${String(content||'')}`;
      let h = 0;
      for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
      return String(h);
    } catch { return String(Date.now()); }
  }

  appendUserMessage(text, msgId, timestamp) {
    const ts = timestamp || Date.now();
    this.appendMessage('user', text, ts);
    const last = this.timeline?.lastElementChild;
    if (last){
      const bar = document.createElement('div');
      bar.className = 'msg-progress';
      bar.innerHTML = `
        <span class=\"stage s-send on\">已发送</span>
        <span class=\"stage s-route\">已路由</span>
        <span class=\"stage s-deliver\">已提交</span>
        <span class=\"stage s-reply\">已回复</span>`;
      last.appendChild(bar);
      if (msgId) this.msgIdToEl.set(msgId, last);
    }
  }

  appendAssistantMessage(text, timestamp) {
    this.clearTypingPlaceholders();
    const { thinking, final } = this.extractThinkingAndFinal(String(text||''));
    const ts = timestamp || Date.now();
    try { this._removeRecentThinking(ts); } catch {}
    if (final) {
      if (thinking) this.appendThinkingBubble(thinking, ts, true);
      const cleanedFinal = this.cleanMessageText(final, { keepThinking: false });
      if (cleanedFinal) this.appendMessage('assistant', cleanedFinal, ts);
      return;
    }
    const cleaned = this.cleanMessageText(text, { keepThinking: false });
    if (!cleaned) return;
    this.appendMessage('assistant', cleaned, ts);
  }

  // 不再渲染“正在生成”占位，只初始化内存缓冲
  showTyping(msgId) { try { if (msgId) this.streamBuffer.set(msgId, ''); } catch {} }

  // 仅在内存缓冲增量
  appendTypingChunk(msgId, delta) {
    try {
      if (!msgId) return;
      const chunk = String(delta == null ? '' : delta);
      if (!chunk) return;
      const prev = this.streamBuffer.get(msgId) || '';
      this.streamBuffer.set(msgId, prev + chunk);
    } catch {}
  }

  // 用真实文本收尾（将缓冲作为思考泡渲染，可选）
  replaceTyping(msgId, text, timestamp) {
    try {
      const ts = timestamp || Date.now();
      const buffered = this._stripTypingPrefix(this.streamBuffer.get(msgId) || '');
      this.streamBuffer.delete(msgId);
      try { this._removeRecentThinking(ts); } catch {}
      const { thinking, final } = this.extractThinkingAndFinal(String(text||''));
      const finalClean = this.cleanMessageText(final || String(text||''), { keepThinking: false });
      const anyThought = (thinking && thinking.trim()) || (buffered && buffered.trim());
      if (anyThought && this.showThinking) {
        const thoughtText = this._stripTypingPrefix(String(thinking || buffered || ''));
        if (thoughtText) this.appendThinkingBubble(thoughtText, ts, true);
      }
      if (finalClean) this.appendMessage('assistant', finalClean, ts);
      const realHash = this.hashMessage('assistant', String(final || text || ''));
      this.renderedHashSet.add(realHash);
      return true;
    } catch { return false; }
  }

  clearTypingPlaceholders(){
    try{
      for (const [id, el] of this.typingMsgIdToEl.entries()){
        try { el.remove(); } catch {}
        this.typingMsgIdToEl.delete(id);
      }
      this.streamBuffer.clear();
    }catch{}
  }

  markRouted(msgId){ const el = this.msgIdToEl.get(msgId); if(!el) return; const s = el.querySelector('.msg-progress .s-route'); if(s) s.classList.add('on'); }
  markDelivered(msgId){ const el = this.msgIdToEl.get(msgId); if(!el) return; const s = el.querySelector('.msg-progress .s-deliver'); if(s) s.classList.add('on'); }
  markReplied(msgId){ const el = this.msgIdToEl.get(msgId); if(!el) return; const s = el.querySelector('.msg-progress .s-reply'); if(s) s.classList.add('on'); }

  clear() {
    if (this.timeline) this.timeline.innerHTML = '';
    try { localStorage.removeItem(this.storageKey); } catch {}
  }

  // 去掉占位前缀“正在生成…”等噪声
  _stripTypingPrefix(text){
    try{
      let s = String(text || '');
      s = s.replace(/^\s*(正在生成(?:…|\.{3}|中)?[:：]?)\s*/i, '');
      s = s.replace(/^\s*(typing|generating|loading)\s*(?:…|\.{3})?\s*/i, '');
      return s;
    }catch{ return String(text||''); }
  }

  // 本地“思考”清理：若思考后 windowMs 内紧跟助手最终，则丢弃该思考
  _cleanupPersistedThinking(list, windowMs){
    try{
      const arr = Array.isArray(list) ? list.slice() : [];
      const keep = [];
      for (let i = 0; i < arr.length; i++){
        const it = arr[i];
        if (String(it.role) !== 'assistant_thinking') { keep.push(it); continue; }
        const t0 = Number(it.timestamp||0);
        let hasFinalNearby = false;
        for (let j = i + 1; j < Math.min(i + 40, arr.length); j++){
          const jt = arr[j];
          if (String(jt.role) === 'assistant'){
            const t1 = Number(jt.timestamp||0);
            if (!t0 || !t1 || Math.abs(t1 - t0) <= windowMs) { hasFinalNearby = true; break; }
          }
        }
        if (!hasFinalNearby) keep.push(it);
      }
      return keep;
    }catch{ return Array.isArray(list) ? list : []; }
  }

  // 到达“最终”时立即清理最近思考（DOM + 本地存储）
  _removeRecentThinking(){
    try{
      const list = this._persistLoad();
      if (Array.isArray(list) && list.length){
        const cleaned = this._cleanupPersistedThinking(list, 5*60*1000);
        this._persistSave(cleaned);
      }
      try{
        const last = this.timeline?.lastElementChild;
        if (last && String(last.className||'').includes('thinking-message')) last.remove();
      }catch{}
    }catch{}
  }

  // TTL 过期：丢弃过旧的“思考”项
  _expireOldThinking(list, ttlMs){
    try{
      const now = Date.now();
      const arr = Array.isArray(list) ? list : [];
      return arr.filter(it => {
        if (String(it.role) !== 'assistant_thinking') return true;
        const ts = Number(it.timestamp||0);
        if (!ts) return false; // 无时间戳的思考，直接抛弃
        return (now - ts) <= ttlMs;
      });
    }catch{ return Array.isArray(list) ? list : []; }
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChatTimeline;
} else {
  window.ChatTimeline = ChatTimeline;
}

// 历史记录路由
const express = require('express');
const router = express.Router();

class HistoryRoutes {
    constructor(historyManager) {
        this.historyManager = historyManager;
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
            
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('获取历史记录失败：', error);
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
            const debugOn = (String(req.query.debug||'').toLowerCase()==='1'||String(req.query.debug||'').toLowerCase()==='true');
            const t0 = Date.now();
            const options = { mode: req.query.mode, includeUnmapped: req.query.includeUnmapped, segmentMinutes: req.query.segmentMinutes, instanceId: req.query.instance || null, maxAgeMs: req.query.maxAgeMs || null, debug: debugOn };
            let t1 = Date.now(); let t2 = null; let t3 = null;
            if (options.instanceId) {
                const openPath = this.resolveInstanceOpenPath(options.instanceId);
                if (openPath) options.filterOpenPath = openPath;
            }
            t2 = Date.now();
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
            console.error('获取历史记录详情失败：', error);
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
            console.error('添加历史记录失败：', error);
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
            console.error('删除历史记录失败：', error);
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
            console.error('清除历史记录失败：', error);
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
            console.error('搜索历史记录失败：', error);
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
            console.error('获取统计信息失败：', error);
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
            console.error('导出历史记录失败：', error);
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
            console.error('获取项目列表失败：', error);
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

            // 尝试测试 SQLite
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
            console.error('获取调试信息失败：', error);
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

    getRouter() {
        return router;
    }
}

module.exports = HistoryRoutes;