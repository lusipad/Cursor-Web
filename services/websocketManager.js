// WebSocket 管理器（精简稳定版）
const { WebSocketServer } = require('ws');
const serverConfig = require('../config/serverConfig');

class WebSocketManager {
  constructor(server, chatManager, historyManager){
    this.wss = new WebSocketServer({ server });
    this.connectedClients = new Set();
    this.chatManager = chatManager;
    this.historyManager = historyManager;
    this.setup();
    this.setupHeartbeat();
  }

  setup(){
    this.wss.on('connection', (ws, req) => {
      const ip = req.socket.remoteAddress;
      ws._meta = { role:'unknown', instanceId:null, ip, connectedAt: Date.now(), lastPongAt:null, injected:false, url:null };
      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; ws._meta.lastPongAt = Date.now(); });
      this.connectedClients.add(ws);
      ws.on('message', (buf)=>{ this.handleMessage(ws, buf); });
      ws.on('close', ()=>{ this.connectedClients.delete(ws); });
      ws.on('error', ()=>{ this.connectedClients.delete(ws); });
    });
  }

  handleMessage(ws, data){
    let msg; try{ msg = JSON.parse(data.toString()); }catch{ return; }
    const t = msg.type;
    if (t==='register') return this.handleRegister(ws, msg);
    if (t==='html_content') return this.handleHtmlContent(ws, msg);
    if (t==='user_message') return this.handleUserMessage(ws, msg);
    if (t==='ping') return ws.send(JSON.stringify({ type:'pong', timestamp:Date.now() }));
    if (t==='delivery_ack' || t==='delivery_error') return this.handleDeliveryEvent(ws, msg);
    if (t==='assistant_hint') return this.handleAssistantHint(ws, msg);
  }

  handleRegister(ws, message){
    const role = typeof message.role==='string' ? message.role : 'unknown';
    const instanceId = (typeof message.instanceId==='string' && message.instanceId.trim()) ? message.instanceId.trim() : null;
    ws._meta = { ...(ws._meta||{}), role, instanceId, injected: Boolean(message.injected), url: typeof message.url==='string'? message.url : null };
    try{ ws.send(JSON.stringify({ type:'register_ack', ok:true, role, instanceId })); }catch{}
  }

  handleHtmlContent(ws, message){
    // 更新当前会话 HTML（仅用于演示，实际项目可移除）
    try{ this.chatManager.updateContent?.(message.data?.html||'', message.data?.timestamp||Date.now()); }catch{}
    // 根据配置决定是否广播到所有客户端（默认关闭，仅调试用）
    if (serverConfig?.websocket?.broadcastHtmlEnabled) {
      this.broadcastToClients(message, ws);
    }
  }

  broadcastToClients(message, sender){
    const msg = JSON.stringify(message);
    this.connectedClients.forEach(client => {
      if (client!==sender && client.readyState===client.OPEN){
        try{ client.send(msg); }catch{ this.connectedClients.delete(client); }
      }
    });
  }

  handleUserMessage(ws, message){
    const target = typeof message.targetInstanceId==='string' && message.targetInstanceId.trim() ? message.targetInstanceId.trim() : null;
    const payload = { type:'user_message', data: message.data, timestamp: Date.now(), targetInstanceId: target||undefined, msgId: message.msgId||null };
    const msgStr = JSON.stringify(payload);
    if (!target) return this.broadcastToClients(payload, ws);

    // 只选匹配实例的最新一个 cursor 客户端
    let best=null;
    this.connectedClients.forEach(c=>{
      if (c!==ws && c.readyState===c.OPEN){
        const m=c._meta||{}; if (m.role==='cursor' && m.instanceId===target){ if(!best || (m.connectedAt||0)>(best._meta?.connectedAt||0)) best=c; }
      }
    });
    if (best){ try{ best.send(msgStr); }catch{ this.connectedClients.delete(best); } }
    else { // 通知 web 端无目标
      const fb = JSON.stringify({ type:'delivery_error', msgId: message.msgId||null, instanceId: target, reason:'no_target', timestamp: Date.now() });
      this.connectedClients.forEach(c=>{ if (c!==ws && c.readyState===c.OPEN && (c._meta?.role==='web' && c._meta?.instanceId===target)) { try{ c.send(fb); }catch{ this.connectedClients.delete(c);} } });
    }
  }

  handleDeliveryEvent(ws, message){
    const payload = { type: message.type, msgId: message.msgId||null, instanceId: message.instanceId||null, reason: message.reason||null, timestamp: message.timestamp||Date.now() };
    const msgStr = JSON.stringify(payload);
    this.connectedClients.forEach(c=>{
      if (c!==ws && c.readyState===c.OPEN){ const m=c._meta||{}; if (m.role==='web' && (!payload.instanceId || m.instanceId===payload.instanceId)) { try{ c.send(msgStr); }catch{ this.connectedClients.delete(c);} } }
    });
  }

  handleAssistantHint(ws, message){
    const payload = { type:'assistant_hint', msgId: message.msgId||null, instanceId: message.instanceId||ws._meta?.instanceId||null, timestamp: message.timestamp||Date.now() };
    const msgStr = JSON.stringify(payload);
    this.connectedClients.forEach(c=>{ if (c!==ws && c.readyState===c.OPEN){ const m=c._meta||{}; if (m.role==='web' && (!payload.instanceId || m.instanceId===payload.instanceId)){ try{ c.send(msgStr); }catch{ this.connectedClients.delete(c);} } } });
  }

  setupHeartbeat(){
    setInterval(()=>{
      this.connectedClients.forEach(ws=>{
        if (ws.readyState===ws.OPEN){
          if (ws.isAlive===false){ try{ ws.terminate(); }catch{} this.connectedClients.delete(ws); return; }
          ws.isAlive=false; try{ ws.ping(); }catch{}
        }
      });
    }, 30000);
  }

  getClientsOverview(){
    const map = ['CONNECTING','OPEN','CLOSING','CLOSED'];
    const out=[]; this.connectedClients.forEach(ws=>{ const m=ws._meta||{}; out.push({ role:m.role||'unknown', instanceId:m.instanceId||null, ip:m.ip||null, connectedAt:m.connectedAt||null, lastPongAt:m.lastPongAt||null, injected:Boolean(m.injected), url:m.url||null, online: ws.readyState===ws.OPEN, readyState: map[ws.readyState]||String(ws.readyState) }); });
    return out;
  }

  getConnectedClientsCount(){
    let count = 0;
    this.connectedClients.forEach(ws=>{ if (ws && ws.readyState===ws.OPEN) count++; });
    return count;
  }

  close(){ try{ this.wss.close(); }catch{} }
}

module.exports = WebSocketManager;




