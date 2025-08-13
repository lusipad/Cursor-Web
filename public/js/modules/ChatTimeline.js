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
  _persistAppend(item){ const list=this._persistLoad(); list.push(item); if(list.length>200) list.splice(0, list.length-200); this._persistSave(list); }

  restoreFromStorage(){
    try{
      const list = this._persistLoad();
      if (!Array.isArray(list) || !list.length) return;
      for (const it of list){
        const role = String(it.role||'assistant');
        const ts = Number(it.timestamp||Date.now());
        const text = String(it.content||'');
        if (!text) continue;
        if (role === 'user') this.appendUserMessage(text, null, ts);
        else this.appendAssistantMessage(text, ts);
      }
    }catch{}
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
    const key = this.hashMessage(role, content);
    if (this.renderedHashSet.has(key)) return;
    this.renderedHashSet.add(key);
    const item = document.createElement('div');
    item.className = `chat-message ${role==='user'?'user-message':'assistant-message'}`;
    item.innerHTML = `
      <div class="bubble">
        <div class="meta">${role==='user'?'👤 我':'🤖 助手'} · ${timestamp?new Date(timestamp).toLocaleTimeString():''}</div>
        <div class="content">${this.sanitize(content)}</div>
      </div>`;
    this.timeline.appendChild(item);
    if (window.MarkdownRenderer) { try{ window.MarkdownRenderer.highlight(item); requestAnimationFrame(()=>window.MarkdownRenderer.highlight(item)); }catch{} }
    this.scrollToLatest(item);
    try { this._persistAppend({ role, content:String(content||''), timestamp: Number(timestamp||Date.now()) }); } catch {}
  }

  appendUserMessage(text, msgId, timestamp){
    const ts = timestamp || Date.now();
    this.appendMessage('user', text, ts);
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
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChatTimeline;
} else {
  window.ChatTimeline = ChatTimeline;
}

 
