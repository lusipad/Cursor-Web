const express = require('express');
const { spawn, exec } = require('child_process');
const path = require('path');
const net = require('net');
const http = require('http');

class InjectRoutes {
  constructor(websocketManager) {
    this.router = express.Router();
    // 进程注册表（内存）
    this.processes = new Map(); // pid -> { pid, port, userDataDir, startedAt }
    this.wsManager = websocketManager || null;
    this.setupRoutes();
  }

  getRouter() {
    return this.router;
  }

  setupRoutes() {
    this.router.get('/inject/processes', (req, res) => this.handleListProcesses(req, res));
    // 实例管理：列出配置实例
    this.router.get('/instances', (req, res) => this.listConfiguredInstances(req, res));
    this.router.post('/instances/launch-all', express.json(), (req, res) => this.launchAllAutoStart(req, res));
    this.router.post('/inject/launch', express.json(), (req, res) => this.launchOne(req, res));
    this.router.post('/inject/launch-many', express.json(), (req, res) => this.launchMany(req, res));
    this.router.post('/inject/stop', express.json(), (req, res) => this.stopOne(req, res));
    // 新增能力
    this.router.post('/inject/inject-port', express.json(), (req, res) => this.injectPort(req, res));
    this.router.post('/inject/scan-inject', express.json(), (req, res) => this.scanAndInject(req, res));
    this.router.post('/inject/kill-all', express.json(), (req, res) => this.killAll(req, res));
    this.router.post('/inject/restart', express.json(), (req, res) => this.restartAndInject(req, res));
    this.router.get('/inject/clients', (req, res) => this.listClients(req, res));
  }

  // 读取配置实例
  getConfiguredInstances() {
    try {
      const fs = require('fs');
      const path = require('path');
      const cfg = require('../config');
      const primary = path.isAbsolute(cfg.instances?.file || '')
        ? cfg.instances.file
        : path.join(process.cwd(), cfg.instances?.file || 'instances.json');
      let chosen = primary;
      if (!fs.existsSync(chosen)) {
        const fallback = path.join(process.cwd(), 'config', 'instances.json');
        if (fs.existsSync(fallback)) chosen = fallback; else return [];
      }
      const raw = fs.readFileSync(chosen, 'utf8');
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  // GET /api/instances
  listConfiguredInstances(req, res){
    try{
      const items = this.getConfiguredInstances();
      // 附加进程/连接状态
      const byId = new Map(items.map(x => [x.id, x]));
      const processes = [...this.processes.values()];
      const status = (this.wsManager && this.wsManager.getClientsOverview) ? this.wsManager.getClientsOverview() : [];
      const onlineById = new Map();
      status.forEach(c => {
        const cid = c.instanceId || null;
        if (!cid) return;
        const list = onlineById.get(cid) || [];
        list.push(c);
        onlineById.set(cid, list);
      });
      const result = items.map(it => {
        const procs = processes.filter(p => p.instanceId === it.id || p.userDataDir === it.userDataDir);
        const clients = onlineById.get(it.id) || [];
        return { ...it, processes: procs, clients };
      });
      res.json({ success: true, data: result });
    }catch(e){ res.status(500).json({ success:false, error: e.message }); }
  }

  // POST /api/instances/launch-all 仅启动 autoStart=true 的实例
  async launchAllAutoStart(req, res){
    try{
      const items = this.getConfiguredInstances().filter(x => x && x.autoStart);
      const launched = [];
      for (const it of items){
        const port = await this.findAvailablePort();
        const child = this.spawnInjector({
          cursorPath: it.cursorPath || '',
          port,
          userDataDir: it.userDataDir || '',
          openPath: it.openPath || '',
          args: it.args || '',
          exitAfterReady: false,
          detach: true,
          shouldSpawn: true,
          pollMs: Number(it.pollMs) || 30000,
          instanceId: it.id || ''
        });
        const pid = child.pid;
        this.processes.set(pid, { pid, port, userDataDir: it.userDataDir || '', startedAt: Date.now(), instanceId: it.id || '' });
        launched.push({ id: it.id, pid, port });
      }
      res.json({ success: true, data: launched });
    }catch(e){ res.status(500).json({ success:false, error: e.message }); }
  }

  handleListProcesses(req, res) {
    try {
      res.json({ success: true, data: [...this.processes.values()] });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  }

  // ========== 新增：返回当前 WebSocket 客户端概览 ==========
  listClients(req, res) {
    try {
      if (!this.wsManager || typeof this.wsManager.getClientsOverview !== 'function') {
        return res.json({ success: false, error: 'wsManager unavailable' });
      }
      const data = this.wsManager.getClientsOverview();
      res.json({ success: true, data });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  }

  async findAvailablePort(startPort = 9222, endPort = 9555) {
    const tryListen = (port) => new Promise((resolve) => {
      const server = net.createServer();
      server.unref();
      server.on('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(true));
      });
    });

    for (let p = startPort; p <= endPort; p++) {
      // 跳过已登记的端口
      if ([...this.processes.values()].some((it) => it.port === p)) continue;
      // 快速探测
      // eslint-disable-next-line no-await-in-loop
      const ok = await tryListen(p);
      if (ok) return p;
    }
    throw new Error('没有可用的调试端口');
  }

  spawnInjector({ cursorPath, port, userDataDir, openPath = '', args = '', exitAfterReady = false, detach = true, shouldSpawn = true, pollMs = 30000, instanceId = '' }) {
    const nodeBin = process.execPath;
    const scriptPath = path.join(process.cwd(), 'scripts', 'auto-inject-cursor.js');
    const env = {
      ...process.env,
      CURSOR_PATH: cursorPath || process.env.CURSOR_PATH || '',
      CDP_PORT: String(port),
      // 默认不传 USER_DATA_DIR，让 Cursor 使用系统默认账号目录
      USER_DATA_DIR: userDataDir || '',
      CURSOR_ARGS: args,
      OPEN_PATH: openPath || '',
      EXIT_AFTER_READY: exitAfterReady ? '1' : '',
      DETACH: detach ? '1' : '0',
      SHOULD_SPAWN: shouldSpawn ? '1' : '0',
      CDP_POLL_MS: String(pollMs || 30000),
      INSTANCE_ID: instanceId || ''
    };

    // 若未指定 cursorPath，尝试常见路径
    if (!env.CURSOR_PATH) {
      const local = process.env.LOCALAPPDATA || '';
      const candidates = [
        path.join(local, 'Programs', 'Cursor', 'Cursor.exe'),
        path.join(local, 'Cursor', 'Cursor.exe')
      ];
      for (const p of candidates) {
        try { if (require('fs').existsSync(p)) { env.CURSOR_PATH = p; break; } } catch {}
      }
    }

    const child = spawn(nodeBin, [scriptPath], {
      cwd: process.cwd(),
      env,
      stdio: detach ? 'ignore' : 'inherit',
      detached: detach,
    });
    if (detach) child.unref();
    return child;
  }

  async launchOne(req, res) {
    try {
      const body = req.body || {};
      const port = Number(body.port) || await this.findAvailablePort();
      const cursorPath = body.cursorPath || process.env.CURSOR_PATH || '';
      // 默认不设置 userDataDir，使用系统账号数据
      const userDataDir = body.userDataDir || '';
      const args = body.args || '';
      const openPath = body.openPath || '';
      const exitAfterReady = !!body.exitAfterReady;
      const detach = body.detach !== false; // 默认 true
      const shouldSpawn = body.shouldSpawn !== false; // 默认 true
      const pollMs = Number(body.pollMs) || 30000;
      const instanceId = body.instanceId || '';

      const child = this.spawnInjector({ cursorPath, port, userDataDir, openPath, args, exitAfterReady, detach, shouldSpawn, pollMs, instanceId });
      const pid = child.pid;
      this.processes.set(pid, { pid, port, userDataDir, startedAt: Date.now() });

      res.json({ success: true, data: { pid, port, userDataDir, detach, exitAfterReady } });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  }

  async launchMany(req, res) {
    try {
      const body = req.body || {};
      const count = Math.max(1, Math.min(20, Number(body.count) || 1));
      const baseArgs = {
        cursorPath: body.cursorPath || process.env.CURSOR_PATH || '',
        args: body.args || '',
        openPath: body.openPath || '',
        exitAfterReady: !!body.exitAfterReady,
        detach: body.detach !== false,
        shouldSpawn: body.shouldSpawn !== false,
        pollMs: Number(body.pollMs) || 30000,
        instanceId: body.instanceId || ''
      };
      const userDataDirTemplate = body.userDataDirTemplate || '';

      const launched = [];
      for (let i = 0; i < count; i++) {
        // eslint-disable-next-line no-await-in-loop
        const port = Number(body.basePort) ? (Number(body.basePort) + i) : await this.findAvailablePort();
      const userDataDir = userDataDirTemplate ? userDataDirTemplate.replace('{i}', String(i)) : '';
        const child = this.spawnInjector({ ...baseArgs, port, userDataDir });
        const pid = child.pid;
        this.processes.set(pid, { pid, port, userDataDir, startedAt: Date.now() });
        launched.push({ pid, port, userDataDir });
      }
      res.json({ success: true, data: launched });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  }

  // ========== 新增：仅注入指定端口 ==========
  async injectPort(req, res) {
    try {
      const { port, pollMs, instanceId } = req.body || {};
      const p = Number(port);
      if (!p) return res.status(400).json({ success: false, error: 'port required' });
      const child = this.spawnInjector({ cursorPath: '', port: p, userDataDir: '', args: '', exitAfterReady: true, detach: false, shouldSpawn: false, pollMs: Number(pollMs) || 8000, instanceId: instanceId || '' });
      child.on('exit', (code) => {
        return res.json({ success: code === 0, data: { port: p, code } });
      });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  }

  // 端口是否开启（CDP）
  async isCdpOpen(port, timeoutMs = 1200) {
    return new Promise((resolve) => {
      const req = http.get({ host: '127.0.0.1', port, path: '/json/version', timeout: timeoutMs }, (r) => {
        r.resume();
        resolve(r.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { try { req.destroy(); } catch {} resolve(false); });
    });
  }

  // ========== 新增：扫描端口并仅注入 ==========
  async scanAndInject(req, res) {
    try {
      const { startPort = 9222, endPort = 9250, instanceId = '' } = req.body || {};
      const openPorts = [];
      for (let p = Number(startPort); p <= Number(endPort); p++) {
        // eslint-disable-next-line no-await-in-loop
        const ok = await this.isCdpOpen(p);
        if (ok) openPorts.push(p);
      }
      if (openPorts.length === 0) return res.json({ success: false, data: [], message: 'no open CDP ports' });
      const results = await Promise.all(openPorts.map((p) => new Promise((resolve) => {
        const child = this.spawnInjector({ cursorPath: '', port: p, userDataDir: '', args: '', exitAfterReady: true, detach: false, shouldSpawn: false, pollMs: 8000, instanceId });
        child.on('exit', (code) => resolve({ port: p, code }));
      })));
      res.json({ success: true, data: { openPorts, results } });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  }

  // ========== 新增：关闭所有 Cursor ==========
  killAll(req, res) {
    try {
      const isWin = process.platform === 'win32';
      const cmd = isWin ? 'taskkill /IM Cursor.exe /F' : 'pkill -f Cursor';
      exec(cmd, (err, stdout, stderr) => {
        if (err) return res.json({ success: false, error: err.message, stdout, stderr });
        res.json({ success: true, data: { stdout: String(stdout || '').trim() } });
      });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  }

  // ========== 新增：强制重启并注入 ==========
  async restartAndInject(req, res) {
    try {
      const body = req.body || {};
      const cursorPath = body.cursorPath || process.env.CURSOR_PATH || '';
      const userDataDir = body.userDataDir || '';
      const args = body.args || '';
      const port = Number(body.port) || await this.findAvailablePort();
      const instanceId = body.instanceId || '';

      // 先 kill all
      await new Promise((resolve) => {
        const isWin = process.platform === 'win32';
        const cmd = isWin ? 'taskkill /IM Cursor.exe /F' : 'pkill -f Cursor';
        exec(cmd, () => resolve());
      });

      const child = this.spawnInjector({ cursorPath, port, userDataDir, args, exitAfterReady: false, detach: true, shouldSpawn: true, pollMs: Number(body.pollMs) || 30000, instanceId });
      const pid = child.pid;
      this.processes.set(pid, { pid, port, userDataDir, startedAt: Date.now() });
      res.json({ success: true, data: { pid, port, userDataDir } });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  }

  stopOne(req, res) {
    try {
      const pid = Number(req.body && req.body.pid);
      if (!pid) return res.status(400).json({ success: false, error: 'pid required' });
      const meta = this.processes.get(pid);
      if (!meta) return res.status(404).json({ success: false, error: 'pid not found' });
      try { process.kill(pid); } catch {}
      this.processes.delete(pid);
      return res.json({ success: true, data: { pid } });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }
}

module.exports = InjectRoutes;


