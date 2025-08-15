/*
 * cursor-browser.js — Cursor 注入脚本
 * 功能：
 * 1) 连接 WebSocket 并发送 register(role:'cursor', injected:true)
 * 2) 接收 user_message → 注入到 Cursor 输入框并触发发送
 * 3) 按结果回传 delivery_ack / delivery_error，并提示 assistant_hint
 * 4) 支持内容同步到服务器
 */
(() => {
  const log = (...args) => { try { console.log('[cursor-browser]', ...args); } catch {} };

  // 由后端在注入时写入（见 injectRoutes）：
  // - window.__cursorWS  优先作为候选地址（通常是 ws://localhost:3000）
  // - window.__cursorInstanceId 作为实例标识
  const instanceId = (window.__cursorInstanceId && String(window.__cursorInstanceId)) || null;
  const candidates = [];
  try { if (typeof window.__cursorWS === 'string' && /^wss?:\/\//i.test(window.__cursorWS)) candidates.push(window.__cursorWS); } catch {}
  // 常见本地回退地址（避免 localhost 在部分环境解析为 ::1 带来的问题）
  candidates.push('ws://127.0.0.1:3000', 'ws://localhost:3000');

  let ws;
  let wsIndex = 0;
  let opened = false;
  let syncInterval = null;
  let lastContent = '';
  let retryCount = 0;
  const maxRetries = 3;

  function safeSend(obj){
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(obj));
      }
    } catch {}
  }

  function findCursorInput(){
    try {
      // Cursor 目前常见输入框
      const el = document.querySelector('div.aislash-editor-input[contenteditable="true"]');
      if (el && el.offsetParent !== null) return el;
    } catch {}
    // 回退：常见可编辑区域
    try {
      const el = document.querySelector('[contenteditable="true"], textarea, [role="textbox"]');
      if (el && el.offsetParent !== null) return el;
    } catch {}
    return null;
  }

  function findChatContainer(){
    const selectorCandidates = [
      '[aria-label*="Chat" i] .interactive-session .monaco-list-rows',
      '[aria-label*="Chat" i] .monaco-list-rows',
      '.part.sidebar.right .interactive-session .monaco-list-rows',
      '.interactive-session .monaco-list-rows',
      '.chat-view .monaco-list-rows',
      '[data-testid="chat-container"]',
      '.chat-view',
      '.conversations'
    ];

    const nodes = [];
    for (const sel of selectorCandidates) {
      try { nodes.push(...document.querySelectorAll(sel)); } catch {}
    }

    if (nodes.length === 0) return null;

    // 评分函数：优先选择内容多、可见的容器
    const scoreOf = (el) => {
      try {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return -1;
        const textLen = (el.textContent || '').length;
        const childCount = el.children.length;
        return textLen + childCount * 10;
      } catch {
        return -1;
      }
    };

    let best = null;
    for (const el of nodes) {
      const score = scoreOf(el);
      if (score > 0 && (!best || score > best.score)) {
        best = { el, score };
      }
    }

    return best ? best.el : null;
  }

  function clickSendButton(){
    try {
      const btn = document.querySelector('.anysphere-icon-button .codicon-arrow-up-two')?.parentElement;
      if (btn && btn.offsetParent !== null && !btn.disabled) { btn.click(); return true; }
      const fallback = [
        '.anysphere-icon-button .codicon-arrow-up-two',
        '.codicon-arrow-up-two',
        'button .codicon-arrow-up-two',
        '[class*="anysphere-icon-button"]',
        'button[class*="send"]'
      ];
      for (const sel of fallback){
        const el = document.querySelector(sel);
        const b = el?.closest('button') || el?.parentElement;
        if (b && b.offsetParent !== null && !b.disabled) { b.click(); return true; }
      }
    } catch {}
    // 最后回退：尝试回车
    try {
      const input = findCursorInput();
      if (input){
        input.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true, cancelable:true }));
        return true;
      }
    } catch {}
    return false;
  }

  async function handleUserMessage(message){
    const msgId = message?.msgId || null;
    try {
      const text = (typeof message?.data === 'string') ? message.data : JSON.stringify(message?.data||'');
      const input = findCursorInput();
      if (!input) throw new Error('input_not_found');

      input.focus();
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const paste = new ClipboardEvent('paste', { bubbles:true, cancelable:true, clipboardData: dt });
      input.dispatchEvent(paste);

      setTimeout(() => { try { clickSendButton(); } catch {} }, 100);

      safeSend({ type:'delivery_ack', msgId, instanceId, timestamp: Date.now() });
      safeSend({ type:'assistant_hint', msgId, instanceId, timestamp: Date.now() });
      log('message injected');
    } catch (e) {
      safeSend({ type:'delivery_error', msgId, instanceId, reason: String(e?.message||'inject_failed'), timestamp: Date.now() });
      log('inject failed:', e?.message||e);
    }
  }

  function collectChatContent(){
    try {
      const chatContainer = findChatContainer();
      if (!chatContainer) return null;

      const text = (chatContainer.textContent || '').trim();
      if (!text || text === lastContent) return null;

      lastContent = text;
      return {
        html: chatContainer.innerHTML,
        text: text,
        contentLength: text.length,
        url: window.location.href,
        timestamp: Date.now()
      };
    } catch (error) {
      log('collect content failed:', error);
      return null;
    }
  }

  function syncContent(){
    try {
      const content = collectChatContent();
      if (!content) return;

      // 发送内容到服务器
      fetch('/api/content/html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceId: instanceId,
          ...content
        })
      }).catch(err => {
        log('sync content failed:', err);
        retryCount++;
        if (retryCount >= maxRetries) {
          log('max retries reached, stopping sync');
          stopSync();
        }
      });
    } catch (error) {
      log('sync error:', error);
    }
  }

  function startSync(){
    if (syncInterval) return;
    log('starting content sync');
    syncInterval = setInterval(syncContent, 5000); // 每5秒同步一次
  }

  function stopSync(){
    if (syncInterval) {
      clearInterval(syncInterval);
      syncInterval = null;
      log('content sync stopped');
    }
  }

  function tryNext(){
    if (wsIndex >= candidates.length){ log('no more ws candidates'); return; }
    const url = candidates[wsIndex++];
    log('ws try:', url);
    try { ws && ws.close(); } catch {}
    ws = new WebSocket(url);
    const timeout = setTimeout(()=>{ try{ if (!opened && ws && ws.readyState === WebSocket.CONNECTING){ ws.close(); } }catch{} }, 10000);
    ws.onopen = () => {
      clearTimeout(timeout);
      opened = true;
      retryCount = 0;
      log('ws open → register cursor');
      safeSend({ type:'register', role:'cursor', injected:true, instanceId, url: String(location.href||'') });
      startSync(); // 开始内容同步
    };
    ws.onmessage = (ev) => {
      let data; try { data = JSON.parse(String(ev.data||'')); } catch { return; }
      if (!data || typeof data !== 'object') return;
      if (data.type === 'user_message') return handleUserMessage(data);
      if (data.type === 'ping') return safeSend({ type:'pong', timestamp: Date.now() });
    };
    ws.onerror = () => { log('ws error'); };
    ws.onclose = () => {
      clearTimeout(timeout);
      stopSync(); // 停止内容同步
      if (opened){ log('ws close'); return; }
      // 未成功打开时，尝试下一个候选
      tryNext();
    };
  }

  // 全局控制函数
  window.stopCursorSync = () => {
    stopSync();
    try { ws && ws.close(); } catch {}
    log('cursor sync stopped');
  };

  window.restartCursorSync = () => {
    window.stopCursorSync();
    setTimeout(() => {
      wsIndex = 0;
      opened = false;
      retryCount = 0;
      tryNext();
    }, 1000);
  };

  window.debugCursorSync = () => {
    log('=== Cursor Sync Debug Info ===');
    log('Instance ID:', instanceId);
    log('WebSocket State:', ws ? ws.readyState : 'null');
    log('Opened:', opened);
    log('Sync Interval:', syncInterval ? 'running' : 'stopped');
    log('Chat Container:', findChatContainer());
    log('Input Element:', findCursorInput());
    log('Last Content Length:', lastContent.length);
    log('Retry Count:', retryCount);
  };

  // 页面卸载时清理
  window.addEventListener('beforeunload', () => {
    window.stopCursorSync();
  });

  // 启动
  try { 
    log('cursor-browser.js loaded, starting...');
    tryNext(); 
  } catch (e) { 
    log('startup failed', e?.message||e); 
  }

  log('✅ Cursor 注入脚本已加载');
  log('💡 调试命令：');
  log('  - stopCursorSync() - 停止同步');
  log('  - restartCursorSync() - 重启同步');
  log('  - debugCursorSync() - 查看调试信息');
})();

