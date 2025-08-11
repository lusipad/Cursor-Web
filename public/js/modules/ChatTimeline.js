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

  sanitize(text) {
    try {
      let s = String(text || '');
      // 移除我们用于关联的隐藏标记，避免在UI显示
      s = s.replace(/<!--\s*#msg:[^>]*-->/gi, '');
      return s.replace(/[<>]/g, ch => ({'<':'&lt;','>':'&gt;'}[ch]))
              .replace(/\n/g, '<br/>');
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
    // 滚动到底部（延迟确保渲染完成）
    const doScroll = () => {
      if (!this.container) return;
      if (!this.stickToBottom) return;
      try { this.container.scrollTop = this.container.scrollHeight; } catch {}
    };
    doScroll();
    try { requestAnimationFrame(() => setTimeout(doScroll, 0)); } catch {}
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

  appendUserMessage(text, msgId) {
    const ts = Date.now();
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

  appendAssistantMessage(text) {
    // 有新的助手回复时，移除任何遗留的占位，避免错乱
    this.clearTypingPlaceholders();
    this.appendMessage('assistant', text, Date.now());
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
      try { this.container.scrollTop = this.container.scrollHeight; } catch {}
      try { requestAnimationFrame(()=>{ try{ this.container.scrollTop = this.container.scrollHeight; }catch{} }); } catch {}
    } catch {}
  }

  // 用真实文本替换占位，并将真实消息哈希登记到去重集合
  replaceTyping(msgId, text, timestamp) {
    try {
      const el = this.typingMsgIdToEl.get(msgId);
      if (!el) return false;
      const contentEl = el.querySelector('.content');
      if (contentEl) contentEl.innerHTML = this.sanitize(String(text||''));
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


