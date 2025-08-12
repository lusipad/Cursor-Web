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

    // 监听用户滚动，若上滑则暂时关闭吸底
    if (this.container) {
      this.container.addEventListener('scroll', () => {
        try {
          const nearBottom = (this.container.scrollTop + this.container.clientHeight) >= (this.container.scrollHeight - 30);
          this.stickToBottom = nearBottom;
        } catch {}
      });
    }
  }

  scrollToLatest(element){
    try{ if (element && element.scrollIntoView) element.scrollIntoView({ block:'end', behavior:'smooth' }); }catch{}
    try{ window.scrollTo({ top: document.documentElement.scrollHeight, behavior:'smooth' }); }catch{ try{ window.scrollTo(0, document.documentElement.scrollHeight || document.body.scrollHeight || 0); }catch{} }
  }

  // 过滤与净化：对助手消息应用与历史页相近的清洗规则
  cleanMessageText(rawText) {
    try {
      const text = String(rawText == null ? '' : rawText);
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
        if (thinkHeadRe.test(v)) return true;
        if (fenceRe.test(v)) return true;
        if (onlyUrlRe.test(v)) return true;
        if (fileLikeRe.test(v)) return true; // vscode/file 路径类
        return false;
      };

      const cleaned = text
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
          if (lang && /[:/]/.test(lang)) { lang = lang.split(/[:/]/)[0]; }
          if (!lang) lang = 'none';
          const rest = classes.filter(c => !c.startsWith('language-'));
          node.className = `language-${lang}` + (rest.length ? ` ${rest.join(' ')}` : '');
        } catch {}
      });
      try { window.Prism && window.Prism.highlightAllUnder && window.Prism.highlightAllUnder(element); } catch {}
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
      this.highlightCodeIn(item);
      try { requestAnimationFrame(()=> this.highlightCodeIn(item)); } catch {}
    }
    // 直接滚动到最新
    this.scrollToLatest(item);
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
    const cleaned = this.cleanMessageText(text);
    if (!cleaned) return; // 全噪声则不渲染
    this.appendMessage('assistant', cleaned, timestamp || Date.now());
    try { Prism && Prism.highlightAllUnder && this.timeline && Prism.highlightAllUnder(this.timeline); } catch {}
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

  // 用真实文本替换占位，并将真实消息哈希登记到去重集合
  replaceTyping(msgId, text, timestamp) {
    try {
      const el = this.typingMsgIdToEl.get(msgId);
      if (!el) return false;
      const contentEl = el.querySelector('.content');
      const cleaned = this.cleanMessageText(String(text||''));
      if (!cleaned) { try { el.remove(); } catch {} this.typingMsgIdToEl.delete(msgId); return false; }
      if (contentEl) contentEl.innerHTML = this.sanitize(cleaned);
      this.highlightCodeIn(el);
      const metaEl = el.querySelector('.meta');
      if (metaEl && timestamp) metaEl.textContent = `🤖 助手 · ${new Date(timestamp).toLocaleTimeString()}`;
      // 取消 typing 样式
      try { el.querySelector('.bubble')?.classList?.remove('typing'); } catch {}
      // 登记去重哈希
      const realHash = this.hashMessage('assistant', String(text||''));
      this.renderedHashSet.add(realHash);
      // 滚到底部
      try { this.container.scrollTop = this.container.scrollHeight; } catch {}
      this.typingMsgIdToEl.delete(msgId);
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
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChatTimeline;
} else {
  window.ChatTimeline = ChatTimeline;
}


