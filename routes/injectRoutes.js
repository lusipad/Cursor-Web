// 注入/进程管理路由
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const CDP = require('chrome-remote-interface');

const router = express.Router();

class InjectRoutes {
  constructor(websocketManager) {
    this.websocketManager = websocketManager;
    this.processes = [];
        this.setupRoutes();
    }

  setupRoutes() {
    router.get('/inject/processes', this.handleList.bind(this));
    router.get('/inject/clients', this.handleClients.bind(this));
    router.post('/inject/launch', this.handleLaunch.bind(this));
    router.post('/inject/restart', this.handleRestart.bind(this));
    router.post('/inject/kill-all', this.handleKillAll.bind(this));
    router.post('/inject/stop', this.handleStop.bind(this));
    router.post('/inject/scan-inject', this.handleScanInject.bind(this));
    router.post('/inject/inject-port', this.handleInjectPort.bind(this));
    router.post('/inject/launch-many', this.handleLaunchMany.bind(this));
  }

  // ---- helpers ----
  resolveInstancesFilePath() {
    try {
            const cfg = require('../config');
            const primary = path.isAbsolute(cfg.instances?.file || '')
              ? cfg.instances.file
              : path.join(process.cwd(), cfg.instances?.file || 'instances.json');
      if (fs.existsSync(primary)) return primary;
              const fallback = path.join(process.cwd(), 'config', 'instances.json');
      if (fs.existsSync(fallback)) return fallback;
            return null;
    } catch { return null; }
  }

  readInstance(instanceId) {
    try {
      if (!instanceId) return null;
      const file = this.resolveInstancesFilePath();
      if (!file) return null;
      const arr = JSON.parse(fs.readFileSync(file, 'utf8'));
      const list = Array.isArray(arr) ? arr : [];
      const found = list.find(x => String(x.id||'') === String(instanceId));
      if (found) return found;
      if (String(instanceId) === 'default') {
        // 始终提供一个默认实例：打开程序所在目录
        return {
          id: 'default',
          name: '默认实例',
          description: '打开程序所在目录',
          openPath: process.cwd(),
          args: [],
          userDataDir: '',
          cursorPath: ''
        };
      }
      return null;
    } catch { return null; }
  }

  resolveCursorPath(hint) {
    if (hint && fs.existsSync(hint)) return hint;
    const envPath = process.env.CURSOR_PATH;
    if (envPath && fs.existsSync(envPath)) return envPath;
    const os = require('os');
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const candidates = [
      path.join(localAppData, 'Programs', 'Cursor', 'Cursor.exe'),
      path.join(localAppData, 'Cursor', 'Cursor.exe'),
    ];
    for (const p of candidates) { try { if (fs.existsSync(p)) return p; } catch {} }
    return null;
  }

  async waitForCDP(port, timeoutMs = 60000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const tryOnce = () => {
        const req = http.get({ host: '127.0.0.1', port, path: '/json/version', timeout: 1500 }, (res) => {
          if (res.statusCode === 200) { res.resume(); resolve(); }
          else { res.resume(); if (Date.now() - start > timeoutMs) reject(new Error('CDP 等待超时')); else setTimeout(tryOnce, 500); }
        });
        req.on('error', () => { if (Date.now() - start > timeoutMs) reject(new Error('CDP 等待超时')); else setTimeout(tryOnce, 500); });
        req.on('timeout', () => { req.destroy(); if (Date.now() - start > timeoutMs) reject(new Error('CDP 等待超时')); else setTimeout(tryOnce, 500); });
      };
      tryOnce();
    });
  }

  async findFreePort(start = 9222, end = 9400) {
    for (let p = start; p <= end; p++) {
      const ok = await new Promise((resolve) => {
        const req = http.get({ host: '127.0.0.1', port: p, path: '/json/version', timeout: 500 }, (res) => { res.resume(); resolve(false); });
        req.on('error', () => resolve(true));
        req.on('timeout', () => { req.destroy(); resolve(true); });
      });
      if (ok) return p;
    }
    return start;
  }

  async injectIntoAllTargets(cdpPort, instanceId) {
    const scriptPath = path.join(__dirname, '..', 'public', 'cursor-browser.js');
    const raw = fs.readFileSync(scriptPath, 'utf8');
    const header = instanceId ? `try{ window.__cursorInstanceId = ${JSON.stringify(instanceId)} }catch(e){}` : '';
    // 在 VSCode/Cursor 内嵌页（vscode-file:// 等）无法使用同源 host，固定回 localhost:3000
    const wsOverride = `try{ window.__cursorWS = 'ws://localhost:3000'; }catch{}`;
    const source = `;(() => { try {\n${header}\n${wsOverride}\n${raw}\n} catch (e) { console.error('cursor-browser.js injection error', e); } })();`;
    const targets = await CDP.List({ host: '127.0.0.1', port: cdpPort });
    const rel = targets.filter(t => ['page','webview','other'].includes(t.type));
    for (const t of rel) {
      let client;
      try {
        client = await CDP({ host: '127.0.0.1', port: cdpPort, target: t });
        const { Page, Runtime } = client;
        await Promise.all([Page.enable(), Runtime.enable()]);
        await Page.addScriptToEvaluateOnNewDocument({ source });
        await Runtime.evaluate({ expression: source, includeCommandLineAPI: true, replMode: true });
      } catch (e) {
        // ignore one
      } finally {
        try { await client?.close(); } catch {}
      }
    }
    return rel.length;
  }

  buildLaunchArgs({ cdpPort, userDataDir, extraArgs, openPath }) {
    const args = [ `--remote-debugging-port=${cdpPort}`, '--new-window' ];
    if (userDataDir) args.push(`--user-data-dir=${userDataDir}`);
    if (Array.isArray(extraArgs)) args.push(...extraArgs);
    if (openPath) args.push(openPath);
    return args;
  }

  parseArgs(raw) {
    if (raw == null) return [];
    const s = String(raw).trim();
    if (!s) return [];
    if (s.startsWith('[')) { try { const arr = JSON.parse(s); return Array.isArray(arr) ? arr.map(String) : []; } catch { return []; } }
    const out = []; let buf = ''; let quote = null;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (quote) { if ((quote==='"' && ch==='"') || (quote==='\'' && ch==='\'')) quote=null; else buf+=ch; continue; }
      if (ch==='"' || ch==='\'') { quote = ch; continue; }
      if (ch===' ') { if (buf) { out.push(buf); buf=''; } continue; }
      buf += ch;
    }
    if (buf) out.push(buf);
    return out;
  }

  // ---- handlers ----
  async handleLaunch(req, res) {
    try {
      const { instanceId, cursorPath, userDataDir, openPath, args, pollMs, detach = true } = req.body || {};
      const inst = this.readInstance(instanceId) || {};
      const exe = this.resolveCursorPath(cursorPath || inst.cursorPath);
      if (!exe) return res.status(400).json({ success:false, error:'未找到 Cursor.exe，请在 body.cursorPath 或环境变量 CURSOR_PATH 指定路径' });

      const cdpPort = await this.findFreePort();
      const extraArgs = Array.isArray(args) ? args : this.parseArgs(args || inst.args);
      const argv = this.buildLaunchArgs({ cdpPort, userDataDir: userDataDir || inst.userDataDir, extraArgs, openPath: openPath || inst.openPath });

      const child = spawn(exe, argv, { detached: !!detach, stdio: detach ? 'ignore' : 'inherit' });
      if (detach) child.unref();

      const procInfo = { pid: child.pid, instanceId: instanceId || null, cdpPort, argv, exe, startedAt: Date.now() };
      this.processes.push(procInfo);

      try { await this.waitForCDP(cdpPort, 60000); await this.injectIntoAllTargets(cdpPort, instanceId || null); } catch {}

      res.json({ success:true, data: { pid: child.pid, cdpPort, argv, instanceId: instanceId || null } });
    } catch (e) {
      res.status(500).json({ success:false, error: e?.message || 'launch failed' });
    }
  }

  async handleRestart(req, res) { return this.handleLaunch(req, res); }

  async handleKillAll(req, res) {
    const list = this.processes.slice();
    for (const p of list) { try { process.kill(p.pid); } catch {} }
    this.processes = [];
    res.json({ success:true, data:{ killed: list.map(p=>p.pid) } });
  }

  async handleStop(req, res) {
    try { const pid = Number(req.body?.pid || 0); if (!pid) return res.status(400).json({ success:false, error:'pid required' });
      try { process.kill(pid); } catch {}
      this.processes = this.processes.filter(p => p.pid !== pid);
      res.json({ success:true, data:{ pid } });
    } catch (e) { res.status(500).json({ success:false, error: e?.message || 'stop failed' }); }
  }

  async handleList(req, res) { res.json({ success:true, data: this.processes }); }

  async handleClients(req, res) {
    try { const clients = this.websocketManager?.getClientsOverview?.() || []; res.json({ success:true, data: clients }); }
    catch (e) { res.status(500).json({ success:false, error: e?.message || 'list clients failed' }); }
  }

  async handleScanInject(req, res) {
    try {
      const startPort = Number(req.body?.startPort || 9222);
      const endPort = Number(req.body?.endPort || 9250);
      const instanceId = req.body?.instanceId || null;
      let injected = 0; const hits = [];
      for (let p = startPort; p <= endPort; p++) {
        const alive = await new Promise((resolve) => {
          const reqh = http.get({ host:'127.0.0.1', port:p, path:'/json/version', timeout:500 }, (r) => { r.resume(); resolve(true); });
          reqh.on('error', () => resolve(false));
          reqh.on('timeout', () => { reqh.destroy(); resolve(false); });
        });
        if (!alive) continue;
        try { const n = await this.injectIntoAllTargets(p, instanceId); if (n>0) { injected += n; hits.push(p); } } catch {}
      }
      res.json({ success:true, data:{ injectedTargets: injected, ports: hits } });
    } catch (e) { res.status(500).json({ success:false, error: e?.message || 'scan-inject failed' }); }
  }

  async handleInjectPort(req, res) {
    try {
      const port = Number(req.body?.port || 0); if (!port) return res.status(400).json({ success:false, error:'port required' });
      const instanceId = req.body?.instanceId || null;
      const n = await this.injectIntoAllTargets(port, instanceId);
      res.json({ success:true, data:{ injectedTargets: n, port } });
    } catch (e) { res.status(500).json({ success:false, error: e?.message || 'inject-port failed' }); }
  }

  async handleLaunchMany(req, res) {
    try {
      const { count = 1, instanceId, basePort, userDataDirTemplate, args } = req.body || {};
      const results = [];
      for (let i = 0; i < Number(count||1); i++) {
        const body = { instanceId, userDataDir: userDataDirTemplate ? String(userDataDirTemplate).replace('{i}', String(i+1)) : undefined, args };
        const fakeReq = { body };
        const fakeRes = { json: (data) => results.push(data), status: (c)=>({ json: (d)=>results.push({ code:c, ...d }) }) };
        // eslint-disable-next-line no-await-in-loop
        await this.handleLaunch(fakeReq, fakeRes);
      }
      res.json({ success:true, data: results });
    } catch (e) { res.status(500).json({ success:false, error: e?.message || 'launch-many failed' }); }
  }

  getRouter() { return router; }
}

module.exports = InjectRoutes;



