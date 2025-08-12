/**
 * 模块加载器（KISS 版）
 * 仅加载基础模块：ErrorHandler / WebSocketManager / MarkdownRenderer / ChatTimeline / InjectBar
 * 不再自动装载 SimpleWebClient 与其他 Manager，页面自行按需初始化。
 */

const ModuleLoader = {
  loadedModules: new Set(),
  moduleDependencies: {
    'ErrorHandler': [],
    'WebSocketManager': ['ErrorHandler'],
    'MarkdownRenderer': ['ErrorHandler'],
    'ChatTimeline': ['ErrorHandler', 'MarkdownRenderer'],
    'InjectBar': ['ErrorHandler']
  },

  isModuleLoaded(m){ return this.loadedModules.has(m); },
  markModuleLoaded(m){ this.loadedModules.add(m); try{ console.log(`✅ 模块 ${m} 已加载`);}catch{} },
  checkDependencies(m){ const deps=this.moduleDependencies[m]||[]; return deps.every(d=>this.isModuleLoaded(d)); },
  getLoadOrder(){ const order=[]; const vis=new Set(); const temp=new Set(); const visit=(m)=>{ if(temp.has(m)) throw new Error(`循环依赖: ${m}`); if(vis.has(m)) return; temp.add(m); (this.moduleDependencies[m]||[]).forEach(visit); temp.delete(m); vis.add(m); order.push(m); }; Object.keys(this.moduleDependencies).forEach(visit); return order; },
  async loadAllModules(){ for (const m of this.getLoadOrder()) { await this.loadModule(m); } },
  async loadModule(m){ if(this.isModuleLoaded(m)) return; if(!this.checkDependencies(m)) return; const s=document.createElement('script'); s.src=`js/modules/${m}.js`; s.async=false; await new Promise((res,rej)=>{ s.onload=()=>{ this.markModuleLoaded(m); res(); }; s.onerror=()=>rej(new Error(`加载模块失败: ${m}`)); document.head.appendChild(s); }); },
  checkModulesAvailability(){ const need=['WebSocketManager','ChatTimeline','InjectBar']; const miss=need.filter(n=>!window[n]); if(miss.length){ console.error('❌ 缺少必要模块:', miss); return false; } return true; },
  getLoadStatus(){ return { loadedModules: Array.from(this.loadedModules), totalModules: Object.keys(this.moduleDependencies).length, isComplete: this.loadedModules.size===Object.keys(this.moduleDependencies).length }; }
};

function startModuleLoading(){ ModuleLoader.loadAllModules().then(()=>{ if(!ModuleLoader.checkModulesAvailability()) return; /* 保持轻量，不在此处做更多初始化 */ }).catch(e=>console.error('❌ 模块加载失败:', e)); }

if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', startModuleLoading); } else { setTimeout(startModuleLoading, 100); }

window.ModuleLoader = ModuleLoader;
