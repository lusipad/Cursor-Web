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
      console.log(`🔌 新的WebSocket连接: ${ip}`);
      ws._meta = { role:'unknown', instanceId:null, ip, connectedAt: Date.now(), lastPongAt:null, injected:false, url:null };
      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; ws._meta.lastPongAt = Date.now(); });
      this.connectedClients.add(ws);
      console.log(`📊 当前连接数: ${this.connectedClients.size}`);
      ws.on('message', (buf)=>{ this.handleMessage(ws, buf); });
      ws.on('close', ()=>{ 
        console.log(`❌ WebSocket连接关闭: ${ws._meta?.role || 'unknown'} (${ws._meta?.instanceId || 'no-instance'})`);
        this.connectedClients.delete(ws); 
        console.log(`📊 当前连接数: ${this.connectedClients.size}`);
      });
      ws.on('error', (err)=>{ 
        console.log(`⚠️ WebSocket错误: ${err.message}`);
        this.connectedClients.delete(ws); 
      });
    });
  }

  handleMessage(ws, data){
    try {
      let msg;
      try { 
        msg = JSON.parse(data.toString()); 
      } catch (e) { 
        console.log('⚠️ 无法解析WebSocket消息:', data.toString().substring(0, 100)); 
        return; 
      }
      
      const t = msg.type;
      console.log(`📥 收到消息: ${t} 来自 ${ws._meta?.role || 'unknown'} (${ws._meta?.instanceId || 'no-instance'})`);
      
      if (t==='register') return this.handleRegister(ws, msg);
      if (t==='html_content') return this.handleHtmlContent(ws, msg);
      if (t==='user_message') return this.handleUserMessage(ws, msg);
      if (t==='assistant_stream' || t==='assistant_done') return this.handleAssistantStream(ws, msg);
      if (t==='ping') {
        try {
          ws.send(JSON.stringify({ type:'pong', timestamp:Date.now() }));
        } catch (e) {
          console.log('⚠️ 发送pong失败:', e.message);
          this.connectedClients.delete(ws);
        }
        return;
      }
      if (t==='delivery_ack' || t==='delivery_error') return this.handleDeliveryEvent(ws, msg);
      if (t==='assistant_hint') return this.handleAssistantHint(ws, msg);
      console.log(`❓ 未知消息类型: ${t}`);
    } catch (error) {
      console.error('💥 handleMessage中发生错误:', error.message);
      console.error('💥 错误堆栈:', error.stack);
      // 不要让错误传播，避免崩溃
    }
  }

  handleRegister(ws, message){
    const role = typeof message.role==='string' ? message.role : 'unknown';
    const instanceId = (typeof message.instanceId==='string' && message.instanceId.trim()) ? message.instanceId.trim() : null;
    const injected = Boolean(message.injected);
    console.log(`✅ 客户端注册: role=${role}, instanceId=${instanceId}, injected=${injected}`);
    ws._meta = { ...(ws._meta||{}), role, instanceId, injected, url: typeof message.url==='string'? message.url : null };
    try{ ws.send(JSON.stringify({ type:'register_ack', ok:true, role, instanceId })); }catch (e){}
    // 注册后立即推送一次在线/注入状态给所有 web 端，提升"立即显示在线"的体验
    this.pushClientsUpdate();
  }

  pushClientsUpdate(){
    try{
      const overview = this.getClientsOverview();
      const payload = JSON.stringify({ type:'clients_update', data: overview });
      this.connectedClients.forEach((client)=>{
        if (client && client.readyState === client.OPEN){
          const m = client._meta || {};
          if (m.role === 'web'){
            try { client.send(payload); } catch (e) { this.connectedClients.delete(client); }
          }
        }
      });
    }catch (e){}
  }

  handleHtmlContent(ws, message){
    // 更新当前会话 HTML（仅用于演示，实际项目可移除）
    try{ this.chatManager.updateContent?.(message.data?.html||'', message.data?.timestamp||Date.now()); }catch (e){}
    // 根据配置决定是否广播到所有客户端（默认关闭，仅调试用）
    if (serverConfig?.websocket?.broadcastHtmlEnabled) {
      this.broadcastToClients(message, ws);
    }
  }

  broadcastToClients(message, sender){
    const msg = JSON.stringify(message);
    this.connectedClients.forEach(client => {
      if (client!==sender && client.readyState===client.OPEN){
        try{ client.send(msg); }catch (e){ this.connectedClients.delete(client); }
      }
    });
  }

  handleUserMessage(ws, message){
    const target = typeof message.targetInstanceId==='string' && message.targetInstanceId.trim() ? message.targetInstanceId.trim() : null;
    const payload = { type:'user_message', data: message.data, timestamp: Date.now(), targetInstanceId: target||undefined, msgId: message.msgId||null };
    const msgStr = JSON.stringify(payload);
    const dataPreview = message.data ? 
      (typeof message.data === 'string' ? message.data.substring(0, 50) + '...' : JSON.stringify(message.data).substring(0, 50) + '...') 
      : 'undefined';
    console.log(`💬 处理用户消息: target=${target}, msgId=${message.msgId}, data=${dataPreview}`);
    
    if (!target) {
      console.log(`📡 广播消息到所有客户端`);
      return this.broadcastToClients(payload, ws);
    }

    // 只选匹配实例的最新一个 cursor 客户端
    let best=null;
    let cursorClients = [];
    this.connectedClients.forEach(c=>{
      if (c!==ws && c.readyState===c.OPEN){
        const m=c._meta||{}; 
        if (m.role==='cursor') {
          cursorClients.push({client: c, meta: m});
          if (m.instanceId===target){ 
            if(!best || (m.connectedAt||0)>(best._meta?.connectedAt||0)) best=c; 
          }
        }
      }
    });
    
    console.log(`🔍 查找目标客户端: target=${target}`);
    console.log(`📋 所有cursor客户端:`, cursorClients.map(c => `${c.meta.instanceId}(${c.meta.injected ? '已注入' : '未注入'})`));
    
    if (best){ 
      console.log(`✅ 找到目标客户端: ${best._meta?.instanceId} (${best._meta?.injected ? '已注入' : '未注入'})`);
      try{ 
        if (best.readyState === best.OPEN) {
          best.send(msgStr); 
          console.log(`✅ 消息已发送到目标客户端`);
          
          // 发送投递确认给发送方
          const ackMessage = {
            type: 'delivery_ack',
            msgId: message.msgId || null,
            instanceId: target,
            timestamp: Date.now()
          };
          const ackStr = JSON.stringify(ackMessage);
          try {
            ws.send(ackStr);
            console.log(`✅ 投递确认已发送: ${message.msgId}`);
          } catch (ackError) {
            console.log(`❌ 发送投递确认失败:`, ackError.message);
          }
        } else {
          console.log(`❌ 目标客户端连接状态异常: ${best.readyState}`);
          this.connectedClients.delete(best);
        }
      } catch (e){ 
        console.log(`❌ 发送消息失败:`, e.message);
        this.connectedClients.delete(best); 
      } 
    }
    else { // 通知 web 端无目标
      console.log(`❌ 未找到目标客户端: ${target}`);
      const fb = JSON.stringify({ type:'delivery_error', msgId: message.msgId||null, instanceId: target, reason:'no_target', timestamp: Date.now() });
      this.connectedClients.forEach(c=>{ if (c!==ws && c.readyState===c.OPEN && (c._meta?.role==='web' && c._meta?.instanceId===target)) { try{ c.send(fb); }catch (e){ this.connectedClients.delete(c);} } });
    }
  }

  handleDeliveryEvent(ws, message){
    const payload = { type: message.type, msgId: message.msgId||null, instanceId: message.instanceId||null, reason: message.reason||null, timestamp: message.timestamp||Date.now() };
    const msgStr = JSON.stringify(payload);
    console.log(`📬 处理投递事件: ${message.type}, msgId=${message.msgId}, reason=${message.reason}`);
    this.connectedClients.forEach(c=>{
      if (c!==ws && c.readyState===c.OPEN){ const m=c._meta||{}; if (m.role==='web' && (!payload.instanceId || m.instanceId===payload.instanceId)) { try{ c.send(msgStr); }catch (e){ this.connectedClients.delete(c);} } }
    });
  }

  handleAssistantHint(ws, message){
    const payload = { type:'assistant_hint', msgId: message.msgId||null, instanceId: message.instanceId||ws._meta?.instanceId||null, timestamp: message.timestamp||Date.now() };
    const msgStr = JSON.stringify(payload);
    console.log(`💡 处理助手提示: msgId=${message.msgId}, instanceId=${payload.instanceId}`);
    this.connectedClients.forEach(c=>{ if (c!==ws && c.readyState===c.OPEN){ const m=c._meta||{}; if (m.role==='web' && (!payload.instanceId || m.instanceId===payload.instanceId)){ try{ c.send(msgStr); }catch (e){ this.connectedClients.delete(c);} } } });
  }

  // 代理模式：把注入端转发的增量/完成事件路由给相同 instance 的 web 端
  handleAssistantStream(ws, message){
    const instanceId = message.instanceId || ws._meta?.instanceId || null;
    const payload = { type: message.type, msgId: message.msgId||null, delta: message.delta||null, text: message.text||null, timestamp: message.timestamp||Date.now() };
    const msgStr = JSON.stringify(payload);
    this.connectedClients.forEach(c=>{
      if (c!==ws && c.readyState===c.OPEN){
        const m=c._meta||{};
        if (m.role==='web' && (!instanceId || m.instanceId===instanceId)){
          try{ c.send(msgStr); }catch (e){ this.connectedClients.delete(c);} }
      }
    });
  }

  setupHeartbeat(){
    setInterval(()=>{
      this.connectedClients.forEach(ws=>{
        if (ws.readyState===ws.OPEN){
          if (ws.isAlive===false){ try{ ws.terminate(); }catch (e){} this.connectedClients.delete(ws); return; }
          ws.isAlive=false; try{ ws.ping(); }catch (e){}
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

  // 兼容 serverUtils 的优雅关闭调用（KISS：轻量广播 + 关闭连接）
  notifyServerShutdown(){
    try{
      const payload = JSON.stringify({ type:'server_shutdown', timestamp: Date.now() });
      this.connectedClients.forEach((client)=>{
        try{
          if (client && client.readyState === client.OPEN) {
            client.send(payload);
            try { client.close(); } catch {}
          }
        }catch{}
      });
    }catch{}
    try{ this.wss.close(); }catch{}
    return Promise.resolve();
  }

  close(){ try{ this.wss.close(); }catch (e){} }
}

module.exports = WebSocketManager;




