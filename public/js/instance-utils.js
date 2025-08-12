// 简单实例工具：统一获取/设置默认实例 ID（URL > localStorage > Cookie）
(function(global){
  function setCookie(name, value, days){ try{ const d=new Date(); d.setTime(d.getTime()+days*24*60*60*1000); document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${days*24*60*60}; Path=/; SameSite=Lax`; }catch{} }
  function getCookie(name){ try{ const kv = document.cookie.split('; ').map(x=>x.split('=')); const f = kv.find(([k])=>k===name); return f ? decodeURIComponent(f[1]||'') : ''; }catch{ return ''; } }

  function get(){
    try{
      const u = new URL(window.location.href);
      const q = u.searchParams.get('instance');
      if (q){
        try{ localStorage.setItem('cw.instanceId', q); setCookie('cw_instance_id', q, 180); }catch{}
        return q;
      }
    }catch{}
    try{ const v = localStorage.getItem('cw.instanceId'); if (v) return v; }catch{}
    return getCookie('cw_instance_id') || '';
  }

  function set(id){ try{ localStorage.setItem('cw.instanceId', String(id||'')); setCookie('cw_instance_id', String(id||''), 180); }catch{} }
  function clear(){ try{ localStorage.removeItem('cw.instanceId'); }catch{} setCookie('cw_instance_id','',-1); }
  function ensureOrRedirect(redirect){ const id = get(); if (id) return id; window.location.href = redirect || '/instances.html'; return ''; }
  async function getInstanceMeta(id){ try{ const r=await fetch(`/api/instances/${encodeURIComponent(id)}`); const j=await r.json(); return j&&j.success?j.data:null; }catch{ return null; } }
  function renderBadge(el){ try{ const id = get(); if (!el) return; el.innerHTML = id ? `实例：<strong>${id}</strong> <a href="/instances.html" style="margin-left:8px;color:#0aa6ff;">切换</a>` : `实例：<em>未选择</em> <a href="/instances.html" style="margin-left:8px;color:#0aa6ff;">选择</a>`; }catch{} }

  global.InstanceUtils = { get, set, clear, ensureOrRedirect, getInstanceMeta, renderBadge };
})(window);


