(function(){
  function ready(fn){ if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', fn);} else { fn(); } }
  function hasBadge(){ return !!(document.querySelector('#instanceBadge, #currentInstanceLabel, #diagInstance, #scriptInstance, [data-instance-badge]')); }
  function inject(){
    if (!window.InstanceUtils) return;
    if (hasBadge()) return;
    const bar = document.createElement('div');
    bar.setAttribute('data-instance-badge', '1');
    bar.style.cssText = 'position:sticky;top:0;z-index:9999;background:#0f1220;border-bottom:1px solid #1f243a;color:#cfd7ff;font-size:12px;padding:6px 10px;display:flex;justify-content:center;';
    const span = document.createElement('span');
    span.style.cssText = 'opacity:.92;';
    bar.appendChild(span);
    document.body.insertBefore(bar, document.body.firstChild);
    try{ InstanceUtils.renderBadge(span); }catch{}
  }
  ready(inject);
})();


