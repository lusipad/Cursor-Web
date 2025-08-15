/**
 * InjectBar - 聊天页注入控制条（实例驱动）
 * - 自动识别 URL ?instance=
 * - 显示注入状态：已注入/未注入（role=cursor 且 injected=true）
 * - 一键操作：仅注入(扫)、重启并注入、启动并注入
 */
(function(){
  // 轻量状态粘滞，减少“已注入/未注入、已连接/未连接”的瞬时抖动
  const __state = {
    injLastOkAt: 0,
    injMisses: 0,
    wsLastOkAt: 0,
    wsMisses: 0,
    STICKY_MS: 15000,
    MISS_LIMIT: 2,
  };
  // 仅在状态变化时打审计日志，避免刷屏
  let __lastWsConnected = null;
  function detectInstance(){
    try{ const u=new URL(window.location.href); const v=u.searchParams.get('instance'); if (v) return v; }catch{}
    try{ return (window.InstanceUtils && InstanceUtils.get()) || ''; }catch{ return ''; }
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
    // 全局右上角状态条：直接挂载到 body，避免依赖具体页面结构
    let bar = document.getElementById('inject-bar');
    if(bar) return bar;
    bar = el('div', { id:'inject-bar', class:'inject-bar' }, []);
    bar.innerHTML = `
      <div class="row" style="position:relative;">
        <button id="ib-move" class="ib-btn" title="下移/上移" style="padding:4px 8px;">⇵</button>
        <span class="label">实例</span>
        <select id="ib-inst-select" class="ib-select" style="background:#111;border:1px solid #2a2a2a;color:#fff;border-radius:6px;padding:4px 8px;"></select>
        <span class="dot" id="ib-ws-dot" title="WebSocket"></span>
        <span id="ib-ws-text" class="status">未连接</span>
        <span class="dot" id="ib-status-dot" title="注入"></span>
        <span id="ib-status-text" class="status">未注入</span>
        <button id="ib-more" class="ib-btn" title="更多" aria-haspopup="true" aria-expanded="false">⋯</button>
        <div id="ib-menu" style="display:none; position:absolute; right:0; top:calc(100% + 8px); background:#111; border:1px solid #2a2a2a; border-radius:8px; padding:8px; box-shadow:0 6px 16px rgba(0,0,0,0.45); min-width:200px;">
          <div style="display:flex; flex-direction:column; gap:6px;">
            <button id="ib-scan" class="ib-btn" style="width:100%; text-align:left;">🔍 扫描并注入</button>
            <button id="ib-restart" class="ib-btn" style="width:100%; text-align:left;">🔄 重启并注入</button>
            <button id="ib-launch" class="ib-btn" style="width:100%; text-align:left;">🚀 启动并注入</button>
            <button id="ib-manage" class="ib-btn" style="width:100%; text-align:left;">🧭 管理实例…</button>
            <div id="ib-clients" style="margin-top:6px;font-size:12px;color:#aaa;max-width:520px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
          </div>
        </div>
      </div>`;
    // 固定挂在页面右上角
    (document.body || document.documentElement).appendChild(bar);
    return bar;
  }

  async function refreshStatus(inst){
    try{
      const j = await api('/api/inject/clients');
      const arr = Array.isArray(j?.data)? j.data : (Array.isArray(j)? j: []);
      const now = Date.now();
      const injNow = arr.some(c => c && c.role==='cursor' && (inst? c.instanceId===inst : true) && c.injected && c.online);
      if (injNow){ __state.injLastOkAt = now; __state.injMisses = 0; } else { __state.injMisses++; }
      const injSticky = (now - __state.injLastOkAt) < __state.STICKY_MS && __state.injMisses <= __state.MISS_LIMIT;
      const injOk = injNow || injSticky;
      document.getElementById('ib-status-dot').className = 'dot ' + (injOk?'ok':'off');
      document.getElementById('ib-status-text').textContent = injOk ? '已注入' : '未注入';
      // 同时基于服务端在线列表更新 WS 连接指示（若本页没有 simpleClient 也能显示真实状态）
      try{
        const wsNow = arr.some(c => c && c.role==='web' && (inst? c.instanceId===inst : true) && c.online);
        if (wsNow){ __state.wsLastOkAt = now; __state.wsMisses = 0; } else { __state.wsMisses++; }
        const wsSticky = (now - __state.wsLastOkAt) < __state.STICKY_MS && __state.wsMisses <= __state.MISS_LIMIT;
        const wsOk = wsNow || wsSticky;
        const wd = document.getElementById('ib-ws-dot');
        const wt = document.getElementById('ib-ws-text');
        if (wd) wd.className = 'dot ' + (wsOk ? 'ok' : 'off');
        if (wt) wt.textContent = wsOk ? '已连接' : '未连接';
      }catch{}
      // 渲染轻量在线列表
      try{
        const list = arr.filter(c=>c && c.role).map(c=>`${c.role}:${c.instanceId||'-'}${c.injected?'✓':''}${c.online?'●':'○'}`).join(' | ');
        const el = document.getElementById('ib-clients'); if (el) el.textContent = list || '无在线客户端';
      }catch{}
    }catch(e){ notify('获取状态失败'); }
  }

  function refreshWs(){
    try{
      let connected = false;
      // 优先从 simpleClient 读取
      try{ if (window.simpleClient && window.simpleClient.wsManager && typeof window.simpleClient.wsManager.isConnected==='function'){ connected = !!window.simpleClient.wsManager.isConnected(); } }catch{}
      // 回退：读取本地存储广播
      if (!connected){
        try{ const raw = window.localStorage && localStorage.getItem('websocket_status'); if (raw){ const j = JSON.parse(raw); connected = !!j.isConnected; } }catch{}
      }
      try{ if (__lastWsConnected !== connected){ window.Audit && Audit.log('status', 'ws_indicator', { connected }); __lastWsConnected = connected; } }catch{}
      const dot = document.getElementById('ib-ws-dot');
      const txt = document.getElementById('ib-ws-text');
      if (dot) dot.className = 'dot ' + (connected ? 'ok' : 'off');
      if (txt) txt.textContent = connected ? '已连接' : '未连接';
    }catch{}
  }

  function bindActions(inst){
    // 位置切换：避免遮挡（顶部/次顶部）
    const moveBtn = document.getElementById('ib-move');
    if (moveBtn){
      const applyTop = (px)=>{ try{ document.documentElement.style.setProperty('--cw-injectbar-top', px+'px'); localStorage.setItem('cw.injectbar.top', String(px)); }catch{} };
      const loadTop = ()=>{ try{ const v = parseInt(localStorage.getItem('cw.injectbar.top')||'12',10); return isFinite(v)?v:12; }catch{ return 12; } };
      applyTop(loadTop());
      moveBtn.onclick = ()=>{
        const current = loadTop();
        const candidates = [12, 48, 84];
        const idx = candidates.indexOf(current);
        const next = candidates[(idx+1) % candidates.length];
        applyTop(next);
      };
    }
    const scan = document.getElementById('ib-scan');
    const restart = document.getElementById('ib-restart');
    const launch = document.getElementById('ib-launch');
    scan.onclick = async ()=>{ try{ await api('/api/inject/scan-inject','POST',{instanceId:inst,startPort:9222,endPort:9250}); await refreshStatus(inst);}catch{} };
    restart.onclick = async ()=>{ try{ if(!confirm('确认要重启所选实例并注入吗？')) return; await api('/api/inject/restart','POST',{instanceId:inst,detach:true}); await refreshStatus(inst);}catch{} };
    launch.onclick = async ()=>{ try{ if(!confirm('确认要启动并注入所选实例吗？')) return; await api('/api/inject/launch','POST',{instanceId:inst,detach:true}); await refreshStatus(inst);}catch{} };
  }

  function bindMenu(){
    const more = document.getElementById('ib-more');
    const menu = document.getElementById('ib-menu');
    if (!more || !menu) return;
    const hide = ()=>{ menu.style.display = 'none'; try{ more.setAttribute('aria-expanded','false'); }catch{} };
    const show = ()=>{ menu.style.display = 'block'; try{ more.setAttribute('aria-expanded','true'); }catch{} };
    more.onclick = (ev)=>{ ev.stopPropagation(); (menu.style.display==='block') ? hide() : show(); try{ window.Audit && Audit.log('ui', 'toggle_menu', { open: menu.style.display==='block' }); }catch{} };
    more.onkeydown = (ev)=>{ if (ev.key==='Enter' || ev.key===' '){ ev.preventDefault(); (menu.style.display==='block') ? hide() : show(); } };
    document.addEventListener('click', (ev)=>{
      try{ const target = ev.target; if (!menu.contains(target) && target !== more){ hide(); } }catch{}
    });
    window.addEventListener('resize', hide);
    window.addEventListener('keydown', (ev)=>{ if (ev.key==='Escape'){ hide(); } });
    // 快捷入口：管理实例
    const manage = document.getElementById('ib-manage');
    if (manage){
      manage.onclick = (ev)=>{ ev.preventDefault(); try{ const ret = encodeURIComponent(window.location.pathname + window.location.search); window.location.href = `/instances.html?return=${ret}`; }catch{ window.location.href = '/instances.html'; } };
    }
  }

  async function populateInstances(selectEl, current){
    try{
      const r = await api('/api/instances');
      const list = Array.isArray(r?.data)? r.data : (Array.isArray(r)? r: []);
      selectEl.innerHTML = '';
      const add = (id, label) => { const o=document.createElement('option'); o.value=id; o.textContent=label; selectEl.appendChild(o); };
      add('', '(未指定)');
      list.forEach(it=> add(String(it.id||''), `${it.id||''}`));
      selectEl.value = current || '';
    }catch{}
  }

  function switchInstance(inst){
    try{
      const u = new URL(window.location.href);
      if (inst) u.searchParams.set('instance', inst); else u.searchParams.delete('instance');
      window.location.href = u.toString();
    }catch{}
  }

  function init(){
    // 在所有页面均可挂载
    const inst = detectInstance();
    const bar = renderBar(); if(!bar) return;
    const sel = document.getElementById('ib-inst-select');
    populateInstances(sel, inst).then(()=>{
      sel.onchange = () => switchInstance(sel.value||'');
    });
    bindMenu();
    bindActions(inst);
    refreshStatus(inst);
    refreshWs();
    // 周期刷新
    setInterval(()=> { refreshStatus(inst); refreshWs(); }, 5000);
    // 监听 storage 广播，尽快更新 WS 状态
    try{ window.addEventListener('storage', (ev)=>{ if (ev && ev.key==='websocket_status') refreshWs(); }); }catch{}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { setTimeout(init, 0); }

  // 导出
  window.InjectBar = { init };
})();


