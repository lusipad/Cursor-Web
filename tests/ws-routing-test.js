/*
 Simple WS routing test:
 - Connect two cursor clients: cursor-1, cursor-2
 - Connect one web client (web-1) and register with instanceId=cursor-1
 - Send user_message(targetInstanceId=cursor-1) and expect only cursor-1 receives
 - Send user_message(targetInstanceId=cursor-2) and expect only cursor-2 receives
*/
const WebSocket = require('ws');

function openClient(role, instanceId) {
  return new Promise((resolve, reject) => {
    const url = (process.env.WS_URL || 'ws://127.0.0.1:3000');
    const ws = new WebSocket(url);
    const timer = setTimeout(() => reject(new Error('open timeout')), 8000);
    ws.once('open', () => {
      try { ws.send(JSON.stringify({ type: 'register', role, instanceId })); } catch {}
    });
    const msgHandler = (data) => {
      try {
        const j = JSON.parse(String(data));
        if (j && j.type === 'register_ack') {
          clearTimeout(timer);
          ws.off('message', msgHandler);
          resolve(ws);
        }
      } catch {}
    };
    ws.on('message', msgHandler);
    ws.once('error', (e) => { clearTimeout(timer); try{ ws.off('message', msgHandler);}catch{} reject(e); });
  });
}

function awaitMessage(ws, predicate, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try { ws.off('message', handler); } catch {}
      reject(new Error('message timeout'));
    }, timeoutMs);
    const handler = (evt) => {
      try {
        const data = JSON.parse(String(evt));
        if (predicate(data)) {
          clearTimeout(timer);
          try { ws.off('message', handler); } catch {}
          resolve(data);
        }
      } catch {}
    };
    ws.on('message', handler);
  });
}

(async () => {
  const c1 = await openClient('cursor', 'cursor-1');
  const c2 = await openClient('cursor', 'cursor-2');
  const w1 = await openClient('web', 'cursor-1');

  // Test route to cursor-1
  const msg1 = { type: 'user_message', data: 'hello to 1', targetInstanceId: 'cursor-1', msgId: 'm1' };
  w1.send(JSON.stringify(msg1));
  await awaitMessage(c1, (d) => d && d.type === 'user_message' && d.data === 'hello to 1');
  console.log('OK: routed to cursor-1');

  // Ensure cursor-2 does not receive msg1 within short window
  let leaked = false;
  try { await awaitMessage(c2, (d) => d && d.type === 'user_message' && d.data === 'hello to 1', 1200); leaked = true; } catch {}
  if (leaked) throw new Error('leak: cursor-2 received message for cursor-1');

  // Test route to cursor-2
  const msg2 = { type: 'user_message', data: 'hello to 2', targetInstanceId: 'cursor-2', msgId: 'm2' };
  w1.send(JSON.stringify(msg2));
  await awaitMessage(c2, (d) => d && d.type === 'user_message' && d.data === 'hello to 2');
  console.log('OK: routed to cursor-2');

  // Ensure cursor-1 does not receive msg2 within short window
  leaked = false;
  try { await awaitMessage(c1, (d) => d && d.type === 'user_message' && d.data === 'hello to 2', 1200); leaked = true; } catch {}
  if (leaked) throw new Error('leak: cursor-1 received message for cursor-2');

  try { c1.close(); c2.close(); w1.close(); } catch {}
  console.log('All WS routing assertions passed.');
  process.exit(0);
})().catch((e) => { console.error('WS routing test failed:', e?.message || e); process.exit(1); });


