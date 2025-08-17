// 实例配置路由
const express = require('express');
const router = express.Router();

class InstancesRoutes {
  constructor(instanceStatusManager) {
    this.instanceStatusManager = instanceStatusManager;
    this.setupRoutes();
  }

  setupRoutes() {
    router.get('/instances', this.handleListInstances.bind(this));
    router.get('/instances/:id', this.handleGetInstance.bind(this));
    router.get('/instances/:id/status', this.handleGetInstanceStatus.bind(this));
    router.get('/instances-status', this.handleGetAllInstancesStatus.bind(this));
    router.post('/instances/cleanup-processes', this.handleCleanupProcesses.bind(this));
  }

  // 解析 instances.json 文件路径（支持根目录或 config/ 目录）
  resolveInstancesFilePath() {
    try {
      const fs = require('fs');
      const path = require('path');
      const cfg = require('../config');
      const primary = path.isAbsolute(cfg.instances?.file || '')
        ? cfg.instances.file
        : path.join(process.cwd(), cfg.instances?.file || 'instances.json');
      let file = primary;
      if (!fs.existsSync(file)) {
        const fallback = path.join(process.cwd(), 'config', 'instances.json');
        if (fs.existsSync(fallback)) file = fallback; else return null;
      }
      return file;
    } catch {
      return null;
    }
  }

  readInstancesList() {
    const fs = require('fs');
    const file = this.resolveInstancesFilePath();
    if (!file) return [];
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  buildDefaultInstance() {
    try {
      const cwd = process.cwd();
      return {
        id: 'default',
        name: '默认实例',
        description: '打开程序所在目录',
        openPath: cwd,
        args: [],
        userDataDir: '',
        cursorPath: ''
      };
    } catch {
      return { id: 'default', name: '默认实例', description: '打开程序所在目录', openPath: process.cwd ? process.cwd() : '', args: [] };
    }
  }

  ensureDefault(list) {
    const hasDefault = list.some(it => String(it.id || '') === 'default');
    if (!hasDefault) {
      return [this.buildDefaultInstance(), ...list];
    }
    return list;
  }

  handleListInstances(req, res) {
    try {
      const list = this.ensureDefault(this.readInstancesList());
      res.json({ success: true, data: list });
    } catch (e) {
      res.status(500).json({ success: false, error: e?.message || 'read instances failed' });
    }
  }

  handleGetInstance(req, res) {
    try {
      const id = String(req.params.id || '');
      const list = this.ensureDefault(this.readInstancesList());
      const found = list.find(it => String(it.id || '') === id);
      if (!found) return res.status(404).json({ success: false, error: 'instance not found' });
      res.json({ success: true, data: found });
    } catch (e) {
      res.status(500).json({ success: false, error: e?.message || 'read instance failed' });
    }
  }

  async handleGetInstanceStatus(req, res) {
    try {
      const id = String(req.params.id || '');
      if (!this.instanceStatusManager) {
        return res.status(503).json({ success: false, error: 'status manager not available' });
      }
      
      const status = await this.instanceStatusManager.getInstanceStatus(id);
      res.json({ success: true, data: status });
    } catch (e) {
      res.status(500).json({ success: false, error: e?.message || 'get instance status failed' });
    }
  }

  async handleGetAllInstancesStatus(req, res) {
    try {
      if (!this.instanceStatusManager) {
        return res.status(503).json({ success: false, error: 'status manager not available' });
      }
      
      const statuses = await this.instanceStatusManager.getAllInstancesStatus();
      res.json({ success: true, data: statuses });
    } catch (e) {
      res.status(500).json({ success: false, error: e?.message || 'get all instances status failed' });
    }
  }

  async handleCleanupProcesses(req, res) {
    try {
      if (!this.instanceStatusManager) {
        return res.status(503).json({ success: false, error: 'status manager not available' });
      }
      
      await this.instanceStatusManager.cleanupDeadProcesses();
      res.json({ success: true, message: 'dead processes cleaned up' });
    } catch (e) {
      res.status(500).json({ success: false, error: e?.message || 'cleanup processes failed' });
    }
  }

  getRouter() {
    return router;
  }
}

module.exports = InstancesRoutes;




