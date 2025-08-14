/**
 * ChatTimeline - 主页聊天时间线（基于历史拉取展示）
 * 渲染目标容器：#messages-container 内部动态创建 .chat-timeline
 */
class ChatTimeline {
  constructor() {
    this.container = document.getElementById('messages-container');
    if (!this.container) {
      console.warn('ChatTimeline: 未找到 #messages-container');
      return;
    }

    // 移除欢迎文案
    try { this.container.querySelector('.welcome-message')?.remove(); } catch {}

    // 时间线容器
    this.timeline = this.container.querySelector('.chat-timeline');
    if (!this.timeline) {
      this.timeline = document.createElement('div');
      this.timeline.className = 'chat-timeline';
      this.container.appendChild(this.timeline);
    }

    this.msgIdToEl = new Map();
    this.renderedHashSet = new Set();
    this.streamBuffer = new Map();

    // 是否显示思考
    this.showThinking = false;
    try {
      const u = new URL(window.location.href);
      const q = u.searchParams.get('thinking');
      if (q === '1' || q === 'true') this.showThinking = true;
      if (!this.showThinking) {
        const v = localStorage.getItem('cw_show_thinking');
        this.showThinking = (v === '1' || v === 'true');
      }
    } catch {}

    // 本地存储键（按实例隔离）
    this.storageKey = this._computeStorageKey();
    
    // 消息类型过滤设置
    this.messageFilters = {
      showUserMessages: true,      // 显示用户消息
      showAssistantMessages: true, // 显示助手回复
      maxMessages: 100,            // 最多显示100条消息（从30增加到100）
      minMessageLength: 1          // 最小消息长度（从5减少到1，避免过滤掉短消息）
    };
    
    try { this.restoreFromStorage(); } catch {}
  }

  _computeStorageKey(){
    try{
      let iid = null;
      try { const u = new URL(window.location.href); iid = u.searchParams.get('instance') || null; } catch {}
      if (!iid) { try { iid = (window.InstanceUtils && InstanceUtils.get && InstanceUtils.get()) || null; } catch {} }
      if (!iid) iid = 'default';
      return `cw_timeline_${iid}`;
    }catch{ return 'cw_timeline_default'; }
  }
  
  _persistLoad(){ try{ const raw = localStorage.getItem(this.storageKey); return raw ? (JSON.parse(raw)||[]) : []; }catch{ return []; } }
  _persistSave(list){ try{ localStorage.setItem(this.storageKey, JSON.stringify(list||[])); }catch{} }
  _persistAppend(item){ 
    const list=this._persistLoad(); 
    list.push(item); 
    // 限制存储的消息数量，避免占用过多空间
    if(list.length > this.messageFilters.maxMessages * 2) {
      list.splice(0, list.length - this.messageFilters.maxMessages * 2); 
    }
    this._persistSave(list); 
  }

  // 判断消息类型
  _getMessageType(message) {
    const content = String(message.content || message.text || message.value || '');
    const role = String(message.role || 'assistant');
    
    // 系统消息检测 - 更严格的检测条件
    if (role === 'system' && (content.startsWith('System:') || content.startsWith('系统:'))) {
      return 'system';
    }
    
    // 调试消息检测 - 更严格的检测条件
    if (content.includes('DEBUG:') && content.includes('调试:') && 
        content.includes('console.log') && content.includes('错误:')) {
      return 'debug';
    }
    
    // 用户消息
    if (role === 'user') {
      return 'user';
    }
    
    // 助手回复
    if (role === 'assistant') {
      return 'assistant';
    }
    
    return 'unknown';
  }

  // 过滤消息
  _filterMessage(message) {
    const messageType = this._getMessageType(message);
    
    // 根据过滤设置决定是否显示
    switch (messageType) {
      case 'user':
        return this.messageFilters.showUserMessages;
      case 'assistant':
        return this.messageFilters.showAssistantMessages;
      case 'system':
        return false; // 系统消息仍然不显示
      case 'debug':
        return false; // 调试消息仍然不显示
      case 'unknown':
        return true;  // 未知类型的消息也显示，避免过度过滤
      default:
        return true;  // 默认显示，避免过度过滤
    }
  }

  restoreFromStorage(){
    try{
      const list = this._persistLoad();
      if (!Array.isArray(list) || !list.length) return;
      
      // 过滤并排序消息
      const filteredMessages = list
        .filter(msg => this._filterMessage(msg))
        .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0))
        .slice(-this.messageFilters.maxMessages); // 只显示最新的消息
      
      // 清空现有内容
      if (this.timeline) {
        this.timeline.innerHTML = '';
      }
      
      // 渲染过滤后的消息
      for (const msg of filteredMessages) {
        const role = String(msg.role || 'assistant');
        const ts = Number(msg.timestamp || Date.now());
        const text = String(msg.content || '');
        if (!text) continue;
        
        if (role === 'user') {
          this.appendUserMessage(text, null, ts);
        } else {
          this.appendAssistantMessage(text, ts);
        }
      }
      
      // 显示消息统计
      this._showMessageStats(list.length, filteredMessages.length);
      
    }catch(e) {
      console.error('恢复聊天记录失败:', e);
    }
  }

  // 显示消息统计信息
  _showMessageStats(totalMessages, filteredMessages) {
    if (totalMessages === filteredMessages) return;
    
    const statsEl = document.createElement('div');
    statsEl.className = 'message-stats';
    statsEl.innerHTML = `
      <div class="stats-info">
        <span>📊 显示 ${filteredMessages} 条聊天记录</span>
        <span class="stats-detail">（已过滤 ${totalMessages - filteredMessages} 条系统/调试消息）</span>
        <button class="btn-show-all" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
    `;
    
    if (this.timeline && this.timeline.firstChild) {
      this.timeline.insertBefore(statsEl, this.timeline.firstChild);
    } else if (this.timeline) {
      this.timeline.appendChild(statsEl);
    }
  }

  sanitize(text){
    try {
      if (window.MarkdownRenderer) return window.MarkdownRenderer.renderMarkdown(String(text||''), { breaks:false });
      const div = document.createElement('div'); div.textContent = String(text||''); return div.innerHTML;
    } catch { return ''; }
  }

  hashMessage(role, content){
    try{ const s = `${role}|${String(content||'')}`; let h=0; for(let i=0;i<s.length;i++){ h=((h<<5)-h)+s.charCodeAt(i); h|=0; } return String(h); }catch{ return String(Date.now()); }
  }

  scrollToLatest(el){
    try{ el?.scrollIntoView?.({ block:'end', behavior:'smooth' }); }catch{}
    try{ this.container.scrollTop = this.container.scrollHeight; }catch{}
  }

  appendMessage(role, content, timestamp){
    if (!this.timeline) return;
    
    // 检查消息是否符合过滤条件
    const message = { role, content, timestamp };
    if (!this._filterMessage(message)) return;
    
    const key = this.hashMessage(role, content);
    if (this.renderedHashSet.has(key)) return;
    this.renderedHashSet.add(key);
    
    const item = document.createElement('div');
    item.className = `chat-message ${role==='user'?'user-message':'assistant-message'}`;
    
    // 根据消息类型添加不同的图标和样式
    const messageType = this._getMessageType(message);
    let icon = '🤖';
    let typeClass = '';
    
    if (role === 'user') {
      icon = '👤';
    } else if (messageType === 'system') {
      icon = '⚙️';
      typeClass = 'system-message';
    } else if (messageType === 'debug') {
      icon = '🐛';
      typeClass = 'debug-message';
    }
    
    item.innerHTML = `
      <div class="bubble ${typeClass}">
        <div class="meta">${icon} ${role==='user'?'我':'助手'} · ${timestamp?new Date(timestamp).toLocaleTimeString():''}</div>
        <div class="content">${this.sanitize(content)}</div>
      </div>`;
    
    this.timeline.appendChild(item);
    
    // 限制显示的消息数量
    this._limitDisplayedMessages();
    
    if (window.MarkdownRenderer) { 
      try{ window.MarkdownRenderer.highlight(item); 
      requestAnimationFrame(()=>window.MarkdownRenderer.highlight(item)); }catch{} 
    }
    
    this.scrollToLatest(item);
    try { this._persistAppend({ role, content:String(content||''), timestamp: Number(timestamp||Date.now()) }); } catch {}
  }

  // 限制显示的消息数量
  _limitDisplayedMessages() {
    if (!this.timeline) return;
    
    const messages = this.timeline.querySelectorAll('.chat-message');
    if (messages.length > this.messageFilters.maxMessages) {
      // 移除最旧的消息，保留统计信息
      const statsEl = this.timeline.querySelector('.message-stats');
      const messagesToRemove = messages.length - this.messageFilters.maxMessages;
      
      for (let i = 0; i < messagesToRemove; i++) {
        if (messages[i] && !messages[i].classList.contains('message-stats')) {
          messages[i].remove();
        }
      }
    }
  }

  appendUserMessage(text, msgId, timestamp){
    const ts = timestamp || Date.now();
    this.appendMessage('user', text, ts);
    const last = this.timeline?.lastElementChild;
    if (last && last.classList.contains('user-message')){
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

  appendAssistantMessage(text, timestamp){
    const ts = timestamp || Date.now();
    const cleaned = this._cleanText(String(text||''));
    if (!cleaned) return;
    this.appendMessage('assistant', cleaned, ts);
  }

  _cleanText(raw){
    try{
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const shaRe = /^[0-9a-f]{7,40}$/i;
      const fenceRe = /^`{3,}$/;
      const toolWordRe = /^(codebase[_\.-]?search|grep|read_file|run_terminal_cmd|apply_patch|read_lints|list_dir|glob(_file_search)?|create_diagram|fetch_pull_request|update_memory|functions\.[A-Za-z0-9_]+)$/i;
      const isNoise=(s)=>{ const v=String(s||'').trim(); if(!v) return true; if(uuidRe.test(v)) return true; if(shaRe.test(v)) return true; if(fenceRe.test(v)) return true; if(toolWordRe.test(v)) return true; return false; };
      return String(raw).split(/\r?\n/).map(l=>l.trim()).filter(l=>l && !isNoise(l)).join('\n').trim();
    }catch{ return String(raw||''); }
  }

  showTyping(msgId){ try{ if (msgId) this.streamBuffer.set(msgId, ''); }catch{} }
  appendTypingChunk(msgId, delta){ try{ if(!msgId) return; const prev=this.streamBuffer.get(msgId)||''; this.streamBuffer.set(msgId, prev+String(delta||'')); }catch{} }
  replaceTyping(msgId, text, timestamp){ try{ this.streamBuffer.delete(msgId); this.appendAssistantMessage(text, timestamp); return true; }catch{ return false; } }

  markRouted(msgId){ const el=this.msgIdToEl.get(msgId); if(!el) return; const s=el.querySelector('.msg-progress .s-route'); if(s) s.classList.add('on'); }
  markDelivered(msgId){ const el=this.msgIdToEl.get(msgId); if(!el) return; const s=el.querySelector('.msg-progress .s-deliver'); if(s) s.classList.add('on'); }
  markReplied(msgId){ const el=this.msgIdToEl.get(msgId); if(!el) return; const s=el.querySelector('.msg-progress .s-reply'); if(s) s.classList.add('on'); }

  clear(){
    try { if (this.timeline) this.timeline.innerHTML = ''; } catch {}
    try { localStorage.removeItem(this.storageKey); } catch {}
  }
  
  // 设置消息过滤选项
  setMessageFilters(filters) {
    Object.assign(this.messageFilters, filters);
    // 重新加载消息
    this.restoreFromStorage();
  }
  
  // 获取当前过滤设置
  getMessageFilters() {
    return { ...this.messageFilters };
  }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChatTimeline;
} else {
  window.ChatTimeline = ChatTimeline;
}

 
