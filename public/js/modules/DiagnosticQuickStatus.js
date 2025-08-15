/**
 * DiagnosticQuickStatus
 * 只负责更新首页“系统诊断”Tab里的四个状态项：
 * - #ws-status、#module-status、#cursor-status、#client-status
 * 不参与右上角统一状态条的显示。
 */
(function(){
  function set(elId, text, cls){
    try{
      const el = document.getElementById(elId);
      if (!el) return;
      el.textContent = text;
      el.className = 'status-value ' + cls;
    }catch{}
  }

  function update(){
    try{
      // WebSocket 状态
      let wsConnected = false;
      try{ if (window.simpleClient && typeof window.simpleClient.isConnected==='function'){ wsConnected = !!window.simpleClient.isConnected(); } }catch{}
      if (!wsConnected){ try{ if (window.simpleClient && window.simpleClient.wsManager && typeof window.simpleClient.wsManager.isConnected==='function'){ wsConnected = !!window.simpleClient.wsManager.isConnected(); } }catch{} }
      set('ws-status', wsConnected ? '已连接' : '未连接', wsConnected ? 'connected' : 'disconnected');

      // 模块加载
      const loaderOk = !!window.ModuleLoader;
      set('module-status', loaderOk ? '已加载' : '未加载', loaderOk ? 'success' : 'error');

      // Cursor 状态
      let cText = '未初始化', cCls = 'error';
      try{
        if (window.simpleClient && window.simpleClient.cursorStatusManager){
          const status = window.simpleClient.cursorStatusManager.getCursorStatus();
          switch(String(status?.status||'')){
            case 'active': cText='活跃'; cCls='success'; break;
            case 'waiting': cText='等待'; cCls='warning'; break;
            case 'inactive': cText='不活跃'; cCls='warning'; break;
            case 'closed': cText='已关闭'; cCls='error'; break;
            default: cText='未知'; cCls='error';
          }
        }
      }catch{ cText='检查失败'; cCls='error'; }
      set('cursor-status', cText, cCls);

      // 客户端状态
      const clientOk = !!window.simpleClient;
      set('client-status', clientOk ? '已初始化' : '未初始化', clientOk ? 'success' : 'error');
    }catch{}
  }

  function startAuto(){
    update();
    try{ if (window.__dq_timer) clearInterval(window.__dq_timer); }catch{}
    window.__dq_timer = setInterval(()=>{
      // 仅在诊断 Tab 活跃时刷新
      try{
        const active = document.querySelector('.tab-btn[data-tab="diagnostic-tab"]');
        if (active && active.classList.contains('active')) update();
      }catch{}
    }, 5000);
  }

  window.DiagnosticQuickStatus = { update, startAuto };
})();


