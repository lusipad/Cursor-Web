/**
 * InjectBar - 聊天页注入控制条（实例驱动）
 * - 自动识别 URL ?instance=
 * - 显示注入状态：已注入/未注入（role=cursor 且 injected=true）
 * - 一键操作：仅注入(扫)、重启并注入、启动并注入
 */
(function(){
  function detectInstance(){
    try{ const u=new URL(window.location.href); return u.searchParams.get('instance')||''; }catch{return ''}
  }

  function el(tag, attrs, children){
    const d=document.createElement(tag);
    if(attrs){ Object.entries(attrs).forEach(([k,v])=>{ if(k==='style'){ d.style.cssText=v; } else { d.setAttribute(k,v);} }); }
    if(children){ children.forEach(c=>{ if(typeof c==='string'){ d.appendChild(document.createTextNode(c)); } else if(c) { d.appendChild(c);} }); }
    return d;
  }

  function notify(msg){ try{ console.log('🔔 InjectBar:', msg); }catch{} }

  async function api(path, method='GET', body){
    const res = await fetch(path, { method, headers: body?{ 'Content-Type':'application/json' }:undefined, body: body?JSON.stringify(body):undefined });
    const text = await res.text();
    try{return JSON.parse(text)}catch{return { raw:text }}
  }

  function renderBar(){
    // 若不存在聊天 tab，跳过
    const chatTab = document.getElementById('chat-tab');
    if(!chatTab) return null;
    // 已存在则复用
    let bar = document.getElementById('inject-bar');
    if(bar) return bar;
    bar = el('div', { id:'inject-bar', class:'inject-bar' }, []);
    bar.innerHTML = `
      <div class="row">
        <span class="label">实例</span>
        <span id="ib-inst" class="value">(未指定)</span>
        <span class="dot" id="ib-status-dot"></span>
        <span id="ib-status-text" class="status">未注入</span>
        <button id="ib-scan" class="ib-btn">仅注入(扫)</button>
        <button id="ib-restart" class="ib-btn">重启并注入</button>
        <button id="ib-launch" class="ib-btn">启动并注入</button>
      </div>`;
    // 默认挂到聊天容器右上
    chatTab.appendChild(bar);
    return bar;
  }

  async function refreshStatus(inst){
    try{
      const j = await api('/api/inject/clients');
      const arr = Array.isArray(j?.data)? j.data : (Array.isArray(j)? j: []);
      const ok = arr.some(c => c && c.role==='cursor' && c.instanceId===inst && c.injected && c.online);
      document.getElementById('ib-status-dot').className = 'dot ' + (ok?'ok':'off');
      document.getElementById('ib-status-text').textContent = ok ? '已注入' : '未注入';
    }catch(e){ notify('获取状态失败'); }
  }

  function bindActions(inst){
    const scan = document.getElementById('ib-scan');
    const restart = document.getElementById('ib-restart');
    const launch = document.getElementById('ib-launch');
    scan.onclick = async ()=>{ try{ await api('/api/inject/scan-inject','POST',{instanceId:inst,startPort:9222,endPort:9250}); await refreshStatus(inst);}catch{} };
    restart.onclick = async ()=>{ try{ await api('/api/inject/restart','POST',{instanceId:inst,detach:true}); await refreshStatus(inst);}catch{} };
    launch.onclick = async ()=>{ try{ await api('/api/inject/launch','POST',{instanceId:inst,detach:true}); await refreshStatus(inst);}catch{} };
  }

  function init(){
    // 在所有页面均可挂载（如 chat-lite.html / history-new.html）
    const inst = detectInstance();
    const bar = renderBar(); if(!bar) return;
    document.getElementById('ib-inst').textContent = inst || '(未指定)';
    bindActions(inst);
    refreshStatus(inst);
    // 周期刷新
    setInterval(()=> refreshStatus(inst), 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { setTimeout(init, 0); }

  // 导出
  window.InjectBar = { init };
})();


