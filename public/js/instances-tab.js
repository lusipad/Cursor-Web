(function(){
  function $(id){ return document.getElementById(id); }
  function ready(fn){ if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', fn);} else { fn(); } }
  function h(tag, attrs, html){ const el=document.createElement(tag); if(attrs){ Object.entries(attrs).forEach(([k,v])=>{ if(k==='class') el.className=v; else if(k==='style') el.style.cssText=v; else el.setAttribute(k,v); }); } if(html!=null) el.innerHTML=html; return el; }
  function escape(s){ return String(s==null?'':s).replace(/[&<>"]+/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[m])); }

  async function api(url, method='GET', body){ const opt={ method, headers:{} }; if (body){ opt.headers['Content-Type']='application/json'; opt.body=JSON.stringify(body); } const r = await fetch(url, opt); const j = await r.json(); if(!j||j.success===false) throw new Error(j?.error||('请求失败 '+r.status)); return j.data; }

  async function refreshInstances(){
    const listEl = $('instances-list');
    const labelEl = $('instancesCurrentLabel');
    if (!listEl) return;
    listEl.innerHTML = '<div class="meta">加载中...</div>';
    try{
      const [instances, clientsArr] = await Promise.all([
        api('/api/instances'),
        api('/api/inject/clients').catch(()=>[])
      ]);
      try{ InstanceUtils && InstanceUtils.renderBadge(labelEl); }catch{}
      if (!Array.isArray(instances) || instances.length===0){ listEl.innerHTML='<div class="meta">未发现实例</div>'; return; }
      listEl.innerHTML='';
      const injectedInst = new Set();
      const onlineInst = new Set();
      const clients = Array.isArray(clientsArr) ? clientsArr : [];
      if (clients.length){
        for (const c of clients){
          const id = c?.instanceId; if (!id) continue;
          if (c.injected) injectedInst.add(id);
          if (c.online) onlineInst.add(id);
        }
      }
      instances.forEach(it=>{
        const id = it?.id || '(unknown)';
        const name = it?.name || id;
        const openPath = it?.openPath || '';
        const desc = it?.description || '';
        const cursorPath = it?.cursorPath || '';
        const userDataDir = it?.userDataDir || '';
        const args = Array.isArray(it?.args) ? it.args.join(' ') : (it?.args || '');

        const card = h('div', { class:'card', style:'background:#161616;border:1px solid #2a2a2a;border-radius:12px;padding:12px;' });
        const head = h('div', { style:'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;' });
        head.appendChild(h('div', { style:'font-weight:600;' }, `${escape(name)} <span class="badge">${escape(id)}</span>`));
        const btns = h('div', { style:'display:flex;gap:8px;flex-wrap:wrap;' });
        btns.appendChild(h('button', { class:'btn btn-primary', 'data-act':'launch', 'data-id':id }, '启动'));
        btns.appendChild(h('button', { class:'btn btn-secondary', 'data-act':'restart', 'data-id':id }, '重启'));
        btns.appendChild(h('button', { class:'btn btn-info', 'data-act':'inject', 'data-id':id }, '注入'));
        btns.appendChild(h('button', { class:'btn', style:'background:#444', 'data-act':'set-default', 'data-id':id }, '设为默认'));
        const statusBar = h('div', { style:'display:flex;align-items:center;gap:8px;flex-wrap:wrap;' });
        const online = onlineInst.has(id);
        const injected = injectedInst.has(id);
        statusBar.appendChild(h('span', { class:`badge ${online?'badge-ok':'badge-off'}` }, online?'在线':'离线'));
        statusBar.appendChild(h('span', { class:`badge ${injected?'badge-ok':'badge-warn'}` }, injected?'已注入':'未注入'));
        head.appendChild(statusBar);
        head.appendChild(btns);
        card.appendChild(head);

        const meta = h('div', { class:'meta' });
        meta.innerHTML = `
          <div>打开目录：<span class="path">${escape(openPath) || '(未设置)'}</span></div>
          <div>Cursor 路径：<span class="path">${escape(cursorPath) || '(自动检测)'}</span></div>
          <div>UserDataDir：<span class="path">${escape(userDataDir) || '(默认)'}</span></div>
          <div>启动参数：<span class="path">${escape(args) || '(无)'}</span></div>
          ${desc ? `<div style="margin-top:4px;color:#9aa4b2;">${escape(desc)}</div>` : ''}
        `;
        card.appendChild(meta);

        listEl.appendChild(card);
      });

      listEl.onclick = async (ev)=>{
        const t = ev.target; if (!(t instanceof HTMLElement)) return;
        const act = t.getAttribute('data-act'); const id = t.getAttribute('data-id'); if (!act || !id) return;
        try{
          if (act==='set-default'){ try{ InstanceUtils && InstanceUtils.set(id); InstanceUtils && InstanceUtils.renderBadge(labelEl); }catch{} alert('已设置为默认实例：'+id); return; }
          if (act==='launch' || act==='restart'){ await api('/api/inject/'+(act==='launch'?'launch':'restart'), 'POST', { instanceId:id, pollMs:30000 }); alert((act==='launch'?'启动':'重启')+'请求已发送'); await Promise.all([refreshProcesses(), refreshClients()]); return; }
          if (act==='inject'){
            await api('/api/inject/scan-inject', 'POST', { instanceId:id, startPort:9222, endPort:9250 });
            alert('已尝试注入现有页面');
            // 立即刷新一次；并在短延迟后再刷新，提升命中率
            await refreshClients();
            await refreshInstances();
            setTimeout(()=>{ refreshClients(); refreshInstances(); }, 1200);
            return;
          }
        }catch(e){ alert('操作失败：'+e.message); }
      };

    }catch(e){ listEl.innerHTML = '<div class="meta">加载失败：'+escape(e.message)+'</div>'; }
  }

  async function refreshProcesses(){
    const el = $('instances-processes'); if (!el) return;
    try{
      const list = await api('/api/inject/processes');
      if (!Array.isArray(list) || list.length===0){ el.innerHTML = '<div class="meta">暂无记录</div>'; return; }
      const rows = list.map(p=>{
        const when = new Date(p.startedAt||Date.now()).toLocaleString();
        return `<div class="row" style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px dashed #2a2a2a;padding:6px 0;">
          <div class="meta">PID: ${escape(p.pid)} | cdpPort: ${escape(p.cdpPort)} | 实例: ${escape(p.instanceId||'')} | ${when}</div>
          <div><button class="btn btn-secondary" data-stop="${p.pid}">停止</button></div>
        </div>`;
      }).join('');
      el.innerHTML = rows;
      el.onclick = async (ev)=>{
        const t = ev.target; if (!(t instanceof HTMLElement)) return;
        const pid = t.getAttribute('data-stop'); if (!pid) return;
        try{ await api('/api/inject/stop', 'POST', { pid: Number(pid) }); await refreshProcesses(); }catch(e){ alert('停止失败：'+e.message); }
      };
    }catch(e){ el.innerHTML = '<div class="meta">读取失败：'+escape(e.message)+'</div>'; }
  }

  async function refreshClients(){
    const el = $('instances-clients'); if (!el) return;
    try{
      const list = await api('/api/inject/clients');
      if (!Array.isArray(list) || list.length===0){ el.innerHTML = '<div class="meta">暂无连接</div>'; return; }
      const rows = list.map(c=>{
        const t = new Date(c.connectedAt||Date.now()).toLocaleString();
        const now = c.online ? '<span class="badge" style="background:#114400;color:#aaffaa;">在线</span>' : '<span class="badge" style="background:#442222;color:#ffaaaa;">离线</span>';
        return `<div class="row" style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px dashed #2a2a2a;padding:6px 0;">
          <div class="meta">${now} ${escape(c.role)} | 实例: ${escape(c.instanceId||'')} | IP: ${escape(c.ip||'')} | ${t}</div>
        </div>`;
      }).join('');
      el.innerHTML = rows;
    }catch(e){ el.innerHTML = '<div class="meta">读取失败：'+escape(e.message)+'</div>'; }
  }

  ready(()=>{
    // 仅当页面存在管理容器时启动（支持首页 Tab 和独立页）
    const present = document.getElementById('instances-tab') || document.getElementById('instances-list');
    if (!present) return;
    try{ InstanceUtils && InstanceUtils.renderBadge(document.getElementById('instancesCurrentLabel')); }catch{}
    $('instances-refresh') && ($('instances-refresh').onclick = async ()=>{ await refreshInstances(); await refreshProcesses(); await refreshClients(); });
    $('instances-scan-inject') && ($('instances-scan-inject').onclick = async ()=>{ try{ const id = InstanceUtils && InstanceUtils.get(); await api('/api/inject/scan-inject','POST',{ instanceId:id||null, startPort:9222, endPort:9250 }); alert('已尝试扫描注入'); }catch(e){ alert('扫描失败：'+e.message); }});
    $('instances-kill-all') && ($('instances-kill-all').onclick = async ()=>{ try{ await api('/api/inject/kill-all','POST'); await refreshProcesses(); alert('已发送终止全部'); }catch(e){ alert('操作失败：'+e.message); }});

    const boot = async ()=>{ await refreshClients(); await refreshInstances(); await refreshProcesses(); };
    boot();
    // 监听服务端的 clients_update 主动推送，提升实时性
    try{
      const proto = location.protocol==='https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${location.host}`);
      ws.onopen = ()=>{ try{ ws.send(JSON.stringify({ type:'register', role:'web', instanceId: InstanceUtils && InstanceUtils.get() || null })); }catch{} };
      ws.onmessage = (ev)=>{ try{ const msg = JSON.parse(ev.data); if (msg && msg.type==='clients_update'){ refreshClients(); refreshInstances(); } }catch{} };
    }catch{}
  });
})();


