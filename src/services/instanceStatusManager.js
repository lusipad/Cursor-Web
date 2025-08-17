// 实例状态管理器 - 统一管理实例的在线、离线和注入状态
const http = require('http');

class InstanceStatusManager {
  constructor(websocketManager, injectRoutes) {
    this.websocketManager = websocketManager;
    this.injectRoutes = injectRoutes;
    this.statusCache = new Map(); // 缓存实例状态
    this.lastUpdate = 0;
    this.cacheTimeout = 2000; // 2秒缓存
    this.lastStatusHash = new Map(); // 用于检测状态变化
    
    // 监听客户端连接变化
    this.setupEventListeners();
  }

  setupEventListeners() {
    // 定期清理状态缓存
    setInterval(() => {
      const now = Date.now();
      if (now - this.lastUpdate > this.cacheTimeout) {
        this.statusCache.clear();
      }
    }, 5000);

    // 定期检查状态变化并推送
    setInterval(() => {
      this.checkAndPushStatusChanges();
    }, 3000);
  }

  /**
   * 检查状态变化并推送给前端
   */
  async checkAndPushStatusChanges() {
    try {
      const allStatuses = await this.getAllInstancesStatus();
      
      for (const [instanceId, status] of Object.entries(allStatuses)) {
        const statusHash = this.generateStatusHash(status);
        const lastHash = this.lastStatusHash.get(instanceId);
        
        if (lastHash !== statusHash) {
          this.lastStatusHash.set(instanceId, statusHash);
          
          // 推送状态变化给WebSocket客户端
          this.pushStatusUpdate(instanceId, status);
        }
      }
    } catch (error) {
      console.error('检查状态变化失败:', error);
    }
  }

  /**
   * 生成状态哈希用于变化检测
   */
  generateStatusHash(status) {
    const key = {
      connection: status.connection?.status,
      inject: status.inject?.status,
      onlineClients: status.summary?.onlineClients,
      injectedClients: status.summary?.injectedClients,
      aliveProcesses: status.summary?.aliveProcesses
    };
    return JSON.stringify(key);
  }

  /**
   * 推送状态更新给WebSocket客户端
   */
  pushStatusUpdate(instanceId, status) {
    if (!this.websocketManager) return;

    const payload = JSON.stringify({
      type: 'instance_status_update',
      instanceId,
      status: {
        connection: status.connection,
        inject: status.inject,
        summary: status.summary
      },
      timestamp: Date.now()
    });

    // 推送给所有web客户端
    const clients = this.websocketManager.connectedClients || new Set();
    clients.forEach(client => {
      if (client && client.readyState === client.OPEN) {
        const meta = client._meta || {};
        if (meta.role === 'web') {
          try {
            client.send(payload);
          } catch (e) {
            // 发送失败，客户端可能已断开
          }
        }
      }
    });
  }

  /**
   * 获取实例的综合状态
   * @param {string} instanceId 实例ID
   * @returns {Promise<Object>} 状态对象
   */
  async getInstanceStatus(instanceId) {
    const cacheKey = instanceId || 'default';
    const now = Date.now();
    
    // 检查缓存
    if (this.statusCache.has(cacheKey) && (now - this.lastUpdate) < this.cacheTimeout) {
      return this.statusCache.get(cacheKey);
    }

    const status = await this.computeInstanceStatus(instanceId);
    this.statusCache.set(cacheKey, status);
    this.lastUpdate = now;
    
    return status;
  }

  /**
   * 计算实例的实际状态
   * @param {string} instanceId 实例ID
   * @returns {Promise<Object>} 状态对象
   */
  async computeInstanceStatus(instanceId) {
    const targetInstanceId = instanceId || 'default';
    
    try {
      // 1. 获取WebSocket客户端状态
      const clients = this.websocketManager?.getClientsOverview?.() || [];
      const instanceClients = clients.filter(client => 
        client && client.instanceId === targetInstanceId
      );

      // 2. 获取进程状态
      const processes = this.injectRoutes?.processes || [];
      const instanceProcesses = processes.filter(proc => 
        proc && proc.instanceId === targetInstanceId
      );

      // 3. 检查CDP端口状态
      const cdpPorts = instanceProcesses.map(p => p.cdpPort).filter(Boolean);
      const cdpStatus = await this.checkCDPPorts(cdpPorts);

      // 4. 计算综合状态
      const status = this.calculateStatus(instanceClients, instanceProcesses, cdpStatus);
      
      // 5. 添加调试信息
      const debugInfo = {
        totalClients: clients.length,
        totalProcesses: processes.length,
        filteredClients: instanceClients.length,
        filteredProcesses: instanceProcesses.length,
        cdpPortsChecked: cdpPorts.length,
        cdpPortsAlive: cdpStatus.filter(c => c.alive).length
      };
      
      return {
        instanceId: targetInstanceId,
        ...status,
        clients: instanceClients,
        processes: instanceProcesses,
        cdpPorts: cdpStatus,
        debug: debugInfo,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error(`计算实例状态失败 (${targetInstanceId}):`, error);
      return {
        instanceId: targetInstanceId,
        connection: { status: 'error', text: '状态计算失败' },
        inject: { status: 'error', text: '状态计算失败' },
        summary: { onlineClients: 0, injectedClients: 0, totalClients: 0, aliveProcesses: 0, totalProcesses: 0 },
        clients: [],
        processes: [],
        cdpPorts: [],
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * 检查CDP端口状态
   * @param {number[]} ports CDP端口列表
   * @returns {Promise<Object[]>} 端口状态列表
   */
  async checkCDPPorts(ports) {
    const results = [];
    
    for (const port of ports) {
      const isAlive = await this.checkCDPPort(port);
      results.push({ port, alive: isAlive });
    }
    
    return results;
  }

  /**
   * 检查单个CDP端口
   * @param {number} port CDP端口
   * @returns {Promise<boolean>} 端口是否可用
   */
  checkCDPPort(port) {
    return new Promise((resolve) => {
      const req = http.get({
        host: '127.0.0.1',
        port,
        path: '/json/version',
        timeout: 1000
      }, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  /**
   * 计算实例状态
   * @param {Object[]} clients 客户端列表
   * @param {Object[]} processes 进程列表
   * @param {Object[]} cdpStatus CDP状态列表
   * @returns {Object} 状态对象
   */
  calculateStatus(clients, processes, cdpStatus) {
    // 在线客户端
    const onlineClients = clients.filter(c => c.online);
    const injectedClients = clients.filter(c => c.injected);
    
    // 活跃进程（CDP端口可访问）
    const aliveProcesses = processes.filter(proc => {
      const cdp = cdpStatus.find(c => c.port === proc.cdpPort);
      return cdp && cdp.alive;
    });

    // 计算状态
    const hasOnlineClients = onlineClients.length > 0;
    const hasInjectedClients = injectedClients.length > 0;
    const hasAliveProcesses = aliveProcesses.length > 0;
    const hasProcesses = processes.length > 0;

    // 连接状态逻辑
    let connectionStatus = 'disconnected';
    let connectionText = '未连接';
    
    if (hasOnlineClients) {
      connectionStatus = 'connected';
      connectionText = '已连接';
    } else if (hasAliveProcesses) {
      connectionStatus = 'connecting';
      connectionText = '运行中';
    }

    // 注入状态逻辑
    let injectStatus = 'not_running';
    let injectText = '未运行';
    
    if (hasInjectedClients) {
      injectStatus = 'injected';
      injectText = '已注入';
    } else if (hasOnlineClients) {
      injectStatus = 'running';
      injectText = '运行中';
    } else if (hasAliveProcesses) {
      injectStatus = 'running';
      injectText = '运行中';
    } else if (hasProcesses) {
      // 有进程记录但CDP不可访问，可能进程已死
      injectStatus = 'process_dead';
      injectText = '进程异常';
    }

    return {
      connection: {
        status: connectionStatus,
        text: connectionText
      },
      inject: {
        status: injectStatus,
        text: injectText
      },
      summary: {
        onlineClients: onlineClients.length,
        injectedClients: injectedClients.length,
        totalClients: clients.length,
        aliveProcesses: aliveProcesses.length,
        totalProcesses: processes.length
      }
    };
  }

  /**
   * 获取所有实例的状态概览
   * @returns {Promise<Object>} 所有实例状态
   */
  async getAllInstancesStatus() {
    const clients = this.websocketManager?.getClientsOverview?.() || [];
    const processes = this.injectRoutes?.processes || [];
    
    // 收集所有实例ID
    const instanceIds = new Set();
    clients.forEach(c => instanceIds.add(c.instanceId || 'default'));
    processes.forEach(p => instanceIds.add(p.instanceId || 'default'));
    
    // 如果没有任何实例，至少包含默认实例
    if (instanceIds.size === 0) {
      instanceIds.add('default');
    }

    const results = {};
    for (const instanceId of instanceIds) {
      results[instanceId] = await this.getInstanceStatus(instanceId);
    }
    
    return results;
  }

  /**
   * 清理死进程记录
   */
  async cleanupDeadProcesses() {
    if (!this.injectRoutes?.processes) return;
    
    const processes = this.injectRoutes.processes;
    const aliveProcesses = [];
    
    for (const proc of processes) {
      if (proc.cdpPort) {
        const isAlive = await this.checkCDPPort(proc.cdpPort);
        if (isAlive) {
          aliveProcesses.push(proc);
        }
      } else {
        // 没有CDP端口的进程，尝试检查PID
        try {
          process.kill(proc.pid, 0); // 检查进程是否存在
          aliveProcesses.push(proc);
        } catch (e) {
          // 进程不存在，不添加到存活列表
        }
      }
    }
    
    this.injectRoutes.processes = aliveProcesses;
    
    // 清理缓存
    this.statusCache.clear();
    this.lastUpdate = 0;
  }

  /**
   * 强制刷新状态缓存
   */
  refreshCache() {
    this.statusCache.clear();
    this.lastUpdate = 0;
  }
}

module.exports = InstanceStatusManager;