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
    try { return String(text || '').replace(/[<>]/g, s => ({'<':'&lt;','>':'&gt;'}[s])).replace(/\n/g, '<br/>'); } catch { return ''; }
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

  hashMessage(role, content, timestamp) {
    try {
      const s = `${role}|${String(content||'')}|${String(timestamp||'')}`;
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
    this.appendMessage('assistant', text, Date.now());
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


