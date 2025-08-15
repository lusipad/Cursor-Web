// 审计日志工具（前端）
// 用法：Audit.log(section, message, data?)；Alt+A 或菜单切换开关
(function(){
  function now(){ try{ return new Date().toISOString().slice(11,23); }catch{ return String(Date.now()); } }
  function parseBool(v){ return v===true || v==='1' || v==='true' || v===1; }
  function readQueryFlag(){ try{ const u=new URL(window.location.href); const q=u.searchParams.get('audit'); return parseBool(q); }catch{ return null; } }

  const Audit = {
    _on: false,
    enable(){ try{ this._on=true; localStorage.setItem('cw.audit','1'); console.log('%c[AUDIT] 启用','color:#22c55e'); }catch{} },
    disable(){ try{ this._on=false; localStorage.removeItem('cw.audit'); console.log('%c[AUDIT] 关闭','color:#ef4444'); }catch{} },
    toggle(){ this._on ? this.disable() : this.enable(); },
    isOn(){ return !!this._on; },
    log(section, message, payload){ try{ if(!this._on) return; const prefix = `%c${now()} [AUDIT] ${section}%c ${message}`; console.log(prefix, 'color:#60a5fa;font-weight:600', 'color:inherit', payload||''); }catch{} }
  };

  // 初始化开关：优先 ?audit=，否则 localStorage
  (function init(){
    const flag = readQueryFlag();
    if (flag===true){ Audit.enable(); }
    else if (flag===false){ Audit.disable(); }
    else { try{ if (parseBool(localStorage.getItem('cw.audit'))){ Audit.enable(); } }catch{} }
  })();

  // 快捷键：Alt + A 切换
  try{ window.addEventListener('keydown', (ev)=>{ if (ev.altKey && (ev.key==='a' || ev.key==='A')) { Audit.toggle(); } }); }catch{}

  window.Audit = Audit;
})();


