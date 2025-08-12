(function(){
  function ready(fn){ if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', fn);} else { fn(); } }
  async function fetchJson(url){ const r = await fetch(url); try{ return await r.json(); }catch{ return {}; } }
  ready(function(){
    // 若页面已自带按钮则不重复注入（如首页）
    if (document.getElementById('toggle-broadcast')) return;

    const btn = document.createElement('button');
    btn.id = 'toggle-broadcast';
    btn.className = 'btn btn-info';
    btn.style.cssText = 'padding:6px 10px;margin-left:8px;';
    btn.textContent = '📡 实时广播: 读取中...';

    async function refresh(){
      try{
        const j = await fetchJson('/api/debug/html-broadcast');
        const on = !!(j && (j.enabled === true || j.enabled === 'true' || j.data === true));
        btn.textContent = '📡 实时广播: ' + (on ? '开启' : '关闭');
        btn.dataset.on = on ? '1' : '0';
      }catch(e){
        btn.textContent = '📡 实时广播: 未知';
      }
    }

    btn.addEventListener('click', async function(){
      const on = btn.dataset.on === '1';
      try{ await fetch('/api/debug/html-broadcast?enable=' + (on ? '0' : '1')); }catch{}
      refresh();
    });

    // 寻找挂载位置：优先放到页面现有操作区，否则固定右上角
    let host = document.querySelector('.header-actions')
            || document.querySelector('.topbar')
            || document.querySelector('header .header')
            || document.querySelector('header');
    if (!host){
      host = document.createElement('div');
      host.style.cssText = 'position:fixed;top:10px;right:10px;z-index:1000;';
      document.body.appendChild(host);
    }
    host.appendChild(btn);
    refresh();
  });
})();



