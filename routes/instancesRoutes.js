// 实例配置路由
const express = require('express');
const router = express.Router();

class InstancesRoutes {
  constructor() {
    this.setupRoutes();
  }

  setupRoutes() {
    router.get('/instances', this.handleListInstances.bind(this));
    router.get('/instances/:id', this.handleGetInstance.bind(this));
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

  handleListInstances(req, res) {
    try {
      const list = this.readInstancesList();
      res.json({ success: true, data: list });
    } catch (e) {
      res.status(500).json({ success: false, error: e?.message || 'read instances failed' });
    }
  }

  handleGetInstance(req, res) {
    try {
      const id = String(req.params.id || '');
      const list = this.readInstancesList();
      const found = list.find(it => String(it.id || '') === id);
      if (!found) return res.status(404).json({ success: false, error: 'instance not found' });
      res.json({ success: true, data: found });
    } catch (e) {
      res.status(500).json({ success: false, error: e?.message || 'read instance failed' });
    }
  }

  getRouter() {
    return router;
  }
}

module.exports = InstancesRoutes;




