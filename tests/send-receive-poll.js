/*
 End-to-end send & poll test
 - Check that a connected cursor client exists for target instance
 - Send user_message via WebSocket with embedded msgId marker
 - Poll /api/chats?instance=... for assistant reply after the marker
 Usage: node tests/send-receive-poll.js [instanceId]
*/
const WebSocket = require('ws');

const instanceId = process.argv[2] || process.env.INSTANCE_ID || 'cursor-1';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const WSURL = process.env.WS_URL || 'ws://127.0.0.1:3000';

function uuid(){ return (global.crypto?.randomUUID?.() || (Date.now().toString(36)+Math.random().toString(16).slice(2))); }

async function fetchJson(url){
  const r = await fetch(url);
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { raw: t, status: r.status }; }
}

function embedId(text, id){ return `${text} \n<!--#msg:${id}-->`; }

function findReplyByMarker(chats, msgId, afterTs){
  if(!Array.isArray(chats)) return { session:null, message:null };
  let best = { session:null, userIdx:-1, userTs:0 };
  for(const s of chats){
    const msgs = Array.isArray(s.messages)? s.messages : [];
    for(let i=msgs.length-1;i>=0;i--){
      const m = msgs[i];
      const role = String(m?.role||'');
      const text = String(m?.content||m?.text||'');
      const mt = Number(m?.timestamp||0);
      const hit = role==='user' && text.includes(`<!--#msg:${msgId}-->`) && (!afterTs || !mt || mt>=afterTs);
      if (hit){
        const score = mt || (new Date(s.date||s.timestamp||0).getTime()) || Date.now();
        if (score >= best.userTs){ best = { session:s, userIdx:i, userTs:score }; }
        break;
      }
    }
  }
  if (!best.session || best.userIdx<0) return { session:null, message:null };
  const msgs = Array.isArray(best.session.messages)? best.session.messages : [];
  for(let j=best.userIdx+1;j<msgs.length;j++){
    const r = msgs[j];
    const rRole = String(r?.role||'');
    if (rRole==='assistant' || rRole==='assistant_bot'){
      return { session: best.session, message: r };
    }
  }
  return { session: best.session, message: null };
}

async function ensureCursorOnline(iid){
  const j = await fetchJson(`${BASE}/api/inject/clients`);
  const arr = Array.isArray(j?.data) ? j.data : (Array.isArray(j)? j: []);
  const ok = arr.some(c => c && c.role==='cursor' && c.instanceId===iid && c.online);
  return ok;
}

async function main(){
  console.log('Instance:', instanceId);
  const online = await ensureCursorOnline(instanceId);
  if (!online){
    console.error('No cursor client online for instance:', instanceId);
    console.error('Please run injection or open Cursor with injection.');
    process.exit(2);
  }

  // Prepare baseline
  const url0 = `${BASE}/api/chats?instance=${encodeURIComponent(instanceId)}&mode=cv&maxAgeMs=0`;
  let baseline = await fetchJson(url0).catch(()=>null);
  baseline = Array.isArray(baseline) ? baseline : (baseline?.data || baseline?.value || []);

  // WS connect and send
  const ws = new WebSocket(WSURL);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ type:'register', role:'web', instanceId }));

  const msgId = uuid();
  const text = embedId(`E2E test ${new Date().toLocaleTimeString()}`, msgId);
  ws.send(JSON.stringify({ type:'user_message', data: text, targetInstanceId: instanceId, msgId }));
  const sentAt = Date.now();
  console.log('Sent message with msgId:', msgId);

  // Poll for reply
  const delays = [1500, 2000, 3000, 5000, 8000, 10000, 10000];
  for (let i=0;i<delays.length;i++){
    await new Promise(r => setTimeout(r, delays[i]));
    try {
      // first try nocache
      const ts = Date.now();
      const url = `${BASE}/api/chats?instance=${encodeURIComponent(instanceId)}&mode=cv&maxAgeMs=0&nocache=1&_=${ts}`;
      let raw = await fetchJson(url);
      const chats = Array.isArray(raw) ? raw : (raw?.data || raw?.value || []);
      const { message } = findReplyByMarker(chats, msgId, sentAt);
      if (message){
        console.log('Got assistant reply. Len:', String(message.content||message.text||'').length);
        console.log('Preview:', String(message.content||message.text||'').slice(0, 160).replace(/\n/g,' '));
        try { ws.close(); } catch {}
        process.exit(0);
      }
      if (i === 2) {
        try { await fetchJson(`${BASE}/api/history/cache/clear`); } catch {}
      }
    } catch {}
  }
  try { ws.close(); } catch {}
  console.error('Timeout: no assistant reply detected.');
  process.exit(1);
}

main().catch((e)=>{ console.error('E2E test error:', e?.message||e); process.exit(1); });



