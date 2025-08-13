/*
 * inject-lite.js — 极简 Cursor 注入脚本（KISS）
 * 仅负责三件事：
 * 1) 连接 WebSocket 并发送 register(role:'cursor', injected:true)
 * 2) 接收 user_message → 注入到 Cursor 输入框并触发发送
 * 3) 按结果回传 delivery_ack / delivery_error，并提示 assistant_hint
 */
(() => {
  const log = (...args) => { try { console.log('[inject-lite]', ...args); } catch {} };

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
      log('ws open → register cursor');
      safeSend({ type:'register', role:'cursor', injected:true, instanceId, url: String(location.href||'') });
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
      if (opened){ log('ws close'); return; }
      // 未成功打开时，尝试下一个候选
      tryNext();
    };
  }

  try { tryNext(); } catch (e) { log('wire failed', e?.message||e); }
})();


