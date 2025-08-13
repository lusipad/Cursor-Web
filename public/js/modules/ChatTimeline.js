/**
 * ChatTimeline - 基于轮询历史构建的轻量聊天界面
 * - 依赖页面存在 #messages-container
 * - 不依赖注入的 html_content，同样可工作
 */
class ChatTimeline {
  constructor() {
    this.container = document.getElementById('messages-container');
    if (!this.container) {
      console.warn('ChatTimeline: 未找到 #messages-container');
      return;
    }
    // 清除欢迎引导
    const welcome = this.container.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    // 创建时间线容器
    this.timeline = this.container.querySelector('.chat-timeline');
    if (!this.timeline) {
      this.timeline = document.createElement('div');
      this.timeline.className = 'chat-timeline';
      this.container.appendChild(this.timeline);
    }
    // 维护消息索引：msgId -> element；已渲染去重：hash -> true
    this.msgIdToEl = new Map();
    this.renderedHashSet = new Set();
    this.stickToBottom = true; // 用户未上滑时保持吸底
    this.typingMsgIdToEl = new Map();

		// 思考气泡显示开关（默认关闭）；支持 URL ?thinking=1 或 localStorage 'cw_show_thinking'='1'
		try{
			let on = false;
			try{ const u=new URL(window.location.href); const q=u.searchParams.get('thinking'); if(q==='1'||q==='true') on=true; if(q==='0'||q==='false') on=false; }catch{}
			if (!on){ try{ const v=localStorage.getItem('cw_show_thinking'); if(v==='1'||v==='true') on=true; }catch{} }
			this.showThinking = !!on;
		}catch{ this.showThinking = false; }

		// 思考分段启发式开关（默认关闭，仅在 <think> 缺失时启用标题样式分段）
		try{
			let h = false;
			try{ const u=new URL(window.location.href); const q=u.searchParams.get('thinkheur')||u.searchParams.get('thinkingHeuristic'); if(q==='1'||q==='true') h=true; if(q==='0'||q==='false') h=false; }catch{}
			if (!h){ try{ const v=localStorage.getItem('cw_thinking_heuristic'); if(v==='1'||v==='true') h=true; }catch{} }
			this.useThinkingHeuristic = !!h;
		}catch{ this.useThinkingHeuristic = false; }

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
    const list = this._persistLoad();
    if (!list.length) return;
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
      const fileLikeRe = /^(file:\/\/\/|vscode-file:\/\/|vscode-webview:\/\/|devtools:\/\/)/i;
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
        if (fileLikeRe.test(v)) return true; // vscode/file 路径类
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
      // 延迟触发一次高亮，避免频繁阻塞主线程
      try { if (window.Prism && window.Prism.highlightAllUnder) requestIdleCallback?.(()=>window.Prism.highlightAllUnder(element)); } catch {}
    }catch{}
  }

  sanitize(text) {
    try {
      if (window.MarkdownRenderer) {
        return window.MarkdownRenderer.renderMarkdown(String(text || ''), { breaks: false });
      }
      // 回退
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
    // 渲染后尝试触发 Prism 高亮（针对新增节点）
    if (window.MarkdownRenderer) {
      window.MarkdownRenderer.highlight(item);
      try { requestAnimationFrame(()=> window.MarkdownRenderer.highlight(item)); } catch {}
    } else {
      // 无 Prism，仅规范化类名
      this.highlightCodeIn(item);
      try { requestAnimationFrame(()=> this.highlightCodeIn(item)); } catch {}
    }
    // 直接滚动到最新
    this.scrollToLatest(item);
    // 持久化（跳过恢复阶段）
    try { if (!this._isRestoring) this._persistAppend({ role, content: String(content||''), timestamp: timestamp||Date.now() }); } catch {}
  }

  // 基于 角色 + 文本 的去重，避免同一条回复因不同时间戳重复渲染
  hashMessage(role, content, timestamp) {
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
    // 为最近一条 user 附状态条
    const last = this.timeline?.lastElementChild;
    if (last){
      const bar = document.createElement('div');
      bar.className = 'msg-progress';
      bar.innerHTML = `
        <span class="stage s-send on">已发送</span>
        <span class="stage s-route">已路由</span>
        <span class="stage s-deliver">已提交</span>
        <span class="stage s-reply">已回复</span>`;
      last.appendChild(bar);
      if (msgId) this.msgIdToEl.set(msgId, last);
    }
  }

  appendAssistantMessage(text, timestamp) {
    // 有新的助手回复时，移除任何遗留的占位，避免错乱
    this.clearTypingPlaceholders();
    const { thinking, final } = this.extractThinkingAndFinal(String(text||''));
    const ts = timestamp || Date.now();
    if (final) {
      if (thinking) this.appendThinkingBubble(thinking, ts, true);
      const cleanedFinal = this.cleanMessageText(final, { keepThinking: false });
      if (cleanedFinal) this.appendMessage('assistant', cleanedFinal, ts);
      return;
    }
    const cleaned = this.cleanMessageText(text, { keepThinking: false });
    if (!cleaned) return; // 全噪声则不渲染
    this.appendMessage('assistant', cleaned, ts);
    // 不再触发 Prism
  }

  // 显示“正在生成”占位气泡（与 msgId 关联）
  showTyping(msgId) {
    try {
      if (!msgId || !this.timeline) return;
      // 清理任何遗留的占位，避免多条“正在生成”导致错乱
      this.clearTypingPlaceholders();
      // 若已存在占位，跳过
      if (this.typingMsgIdToEl.has(msgId)) return;
      const ts = Date.now();
      const item = document.createElement('div');
      item.className = 'chat-message assistant-message';
      item.innerHTML = `
        <div class="bubble typing">
          <div class="meta">🤖 助手 · ${new Date(ts).toLocaleTimeString()}</div>
          <div class="content">正在生成…</div>
        </div>`;
      this.timeline.appendChild(item);
      this.typingMsgIdToEl.set(msgId, item);
      // 滚到底部
      this.scrollToLatest(item);
    } catch {}
  }

  // 追加增量内容到正在生成的占位
  appendTypingChunk(msgId, delta) {
    try {
      if (!msgId) return;
      const el = this.typingMsgIdToEl.get(msgId);
      if (!el) return;
      const contentEl = el.querySelector('.content');
      if (!contentEl) return;
      const cleaned = String(delta == null ? '' : delta);
      if (!cleaned) return;
      // 思考增量直接累加到占位的 content 区域
      contentEl.innerHTML += this.sanitize(cleaned);
      // 滚动到底部
      this.scrollToLatest(el);
    } catch {}
  }

  // 用真实文本替换占位，并将真实消息哈希登记到去重集合
  replaceTyping(msgId, text, timestamp) {
    try {
      const el = this.typingMsgIdToEl.get(msgId);
      if (!el) return false;
      const contentEl = el.querySelector('.content');
      const prevHtml = (contentEl && contentEl.innerHTML) ? contentEl.innerHTML.trim() : '';
      const prevPlain = (contentEl && contentEl.textContent ? contentEl.textContent.trim() : '');
      const { thinking, final } = this.extractThinkingAndFinal(String(text||''));
      const finalClean = this.cleanMessageText(final || String(text||''), { keepThinking: false });
      const ts = timestamp || Date.now();
      const hasThoughts = (thinking && thinking.trim()) || (prevHtml && prevPlain && prevPlain !== '正在生成…');
      // 移除占位
      try { el.remove(); } catch {}
      this.typingMsgIdToEl.delete(msgId);
      // 若有“思考”则先渲染折叠块
      if (hasThoughts && this.showThinking) {
        const thoughtText = prevPlain && prevPlain !== '正在生成…' ? prevPlain : String(thinking||'');
        if (thoughtText) this.appendThinkingBubble(thoughtText, ts, true);
      }
      if (finalClean) this.appendMessage('assistant', finalClean, ts);
      const realHash = this.hashMessage('assistant', String(final || text || ''));
      this.renderedHashSet.add(realHash);
      return true;
    } catch { return false; }
  }

  // 移除所有“正在生成”占位气泡
  clearTypingPlaceholders(){
    try{
      for (const [id, el] of this.typingMsgIdToEl.entries()){
        try { el.remove(); } catch {}
        this.typingMsgIdToEl.delete(id);
      }
    }catch{}
  }

  markRouted(msgId){
    const el = this.msgIdToEl.get(msgId); if(!el) return;
    const s = el.querySelector('.msg-progress .s-route'); if(s) s.classList.add('on');
  }
  markDelivered(msgId){
    const el = this.msgIdToEl.get(msgId); if(!el) return;
    const s = el.querySelector('.msg-progress .s-deliver'); if(s) s.classList.add('on');
  }
  markReplied(msgId){
    const el = this.msgIdToEl.get(msgId); if(!el) return;
    const s = el.querySelector('.msg-progress .s-reply'); if(s) s.classList.add('on');
  }

  clear() {
    if (this.timeline) this.timeline.innerHTML = '';
    try { localStorage.removeItem(this.storageKey); } catch {}
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChatTimeline;
} else {
  window.ChatTimeline = ChatTimeline;
}


