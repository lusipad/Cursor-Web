// 状态检查工具 - 检查连接状态和注入状态
(function(window) {
    'use strict';

    class StatusChecker {
        constructor() {
            this.checkInterval = null;
            this.checkIntervalMs = 5000; // 每5秒检查一次
            this.instanceId = null;
            this.websocket = null;
            this.lastStatus = null;
        }

        // 初始化状态检查器
        init() {
            try {
                this.instanceId = window.InstanceUtils ? window.InstanceUtils.get() : 'default';
                this.updateStatusDisplay('检查中...', '检查中...');
                this.startAutoCheck();
                this.setupWebSocket();
            } catch (e) {
                console.log('状态检查器初始化失败:', e);
            }
        }

        // 设置WebSocket连接以接收实时状态更新
        setupWebSocket() {
            try {
                const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
                this.websocket = new WebSocket(`${protocol}//${location.host}`);
                
                this.websocket.onopen = () => {
                    console.log('状态检查器WebSocket连接已建立');
                    // 注册为web客户端
                    this.websocket.send(JSON.stringify({
                        type: 'register',
                        role: 'web',
                        instanceId: this.instanceId
                    }));
                };

                this.websocket.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        if (message.type === 'instance_status_update' && 
                            message.instanceId === this.instanceId) {
                            // 收到实时状态更新
                            const status = message.status;
                            this.updateStatusDisplay(status.connection.text, status.inject.text);
                            this.lastStatus = status;
                        }
                    } catch (e) {
                        console.log('处理WebSocket消息失败:', e);
                    }
                };

                this.websocket.onclose = () => {
                    console.log('状态检查器WebSocket连接已关闭');
                    // 5秒后尝试重连
                    setTimeout(() => {
                        if (!this.websocket || this.websocket.readyState === WebSocket.CLOSED) {
                            this.setupWebSocket();
                        }
                    }, 5000);
                };

                this.websocket.onerror = (error) => {
                    console.log('状态检查器WebSocket错误:', error);
                };
            } catch (e) {
                console.log('设置WebSocket失败:', e);
            }
        }

        // 开始自动检查
        startAutoCheck() {
            if (this.checkInterval) {
                clearInterval(this.checkInterval);
            }
            
            // 立即检查一次
            this.checkStatus();
            
            // 设置定时检查
            this.checkInterval = setInterval(() => {
                this.checkStatus();
            }, this.checkIntervalMs);
        }

        // 停止自动检查
        stopAutoCheck() {
            if (this.checkInterval) {
                clearInterval(this.checkInterval);
                this.checkInterval = null;
            }
        }

        // 检查状态
        async checkStatus() {
            try {
                // 更新实例ID
                if (window.InstanceUtils) {
                    this.instanceId = window.InstanceUtils.get() || 'default';
                }

                // 使用统一的状态API
                const status = await this.getUnifiedStatus();
                
                // 更新显示
                this.updateStatusDisplay(status.connection.text, status.inject.text);
            } catch (e) {
                console.log('状态检查失败:', e);
                // 回退到原有的检查方式
                try {
                    const [connectionStatus, injectStatus] = await Promise.all([
                        this.checkConnectionStatus(),
                        this.checkInjectStatus()
                    ]);
                    this.updateStatusDisplay(connectionStatus, injectStatus);
                } catch (fallbackError) {
                    console.log('回退状态检查也失败:', fallbackError);
                    this.updateStatusDisplay('检查失败', '检查失败');
                }
            }
        }

        // 获取统一状态
        async getUnifiedStatus() {
            const response = await fetch(`/api/instances/${encodeURIComponent(this.instanceId)}/status`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`状态API请求失败: ${response.status}`);
            }

            const data = await response.json();
            if (!data || !data.success) {
                throw new Error(data?.error || '状态API返回错误');
            }

            return data.data;
        }

        // 检查连接状态
        async checkConnectionStatus() {
            try {
                // 检查WebSocket连接状态
                if (window.websocketManager && window.websocketManager.isConnected()) {
                    return '已连接';
                }

                // 检查API连接状态 - 使用简单的健康检查
                const response = await fetch('/api/instances', {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (response.ok) {
                    return '已连接';
                }

                return '未连接';
            } catch (e) {
                return '连接失败';
            }
        }

        // 检查注入状态
        async checkInjectStatus() {
            try {
                // 检查客户端连接状态，这与instances-tab.js的逻辑保持一致
                const response = await fetch('/api/inject/clients', {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data && data.success && Array.isArray(data.data)) {
                        const clients = data.data;
                        
                        // 查找当前实例的客户端
                        const currentInstanceClients = clients.filter(client => 
                            client && client.instanceId === this.instanceId
                        );
                        
                        if (currentInstanceClients.length > 0) {
                            // 检查是否有已注入的客户端
                            const injectedClient = currentInstanceClients.find(client => client.injected);
                            if (injectedClient) {
                                return '已注入';
                            }
                            
                            // 检查是否有在线的客户端
                            const onlineClient = currentInstanceClients.find(client => client.online);
                            if (onlineClient) {
                                return '运行中';
                            }
                        }
                    }
                }

                // 如果客户端检查失败，尝试检查进程状态
                try {
                    const processResponse = await fetch('/api/inject/processes', {
                        method: 'GET',
                        headers: { 'Content-Type': 'application/json' }
                    });

                    if (processResponse.ok) {
                        const processData = await processResponse.json();
                        if (processData && processData.success && processData.data) {
                            const processes = processData.data;
                            const cursorProcesses = processes.filter(p => 
                                p.name && p.name.toLowerCase().includes('cursor')
                            );
                            
                            if (cursorProcesses.length > 0) {
                                return '运行中';
                            }
                        }
                    }
                } catch (e) {
                    // 进程检查失败，继续
                }

                return '未运行';
            } catch (e) {
                return '检查失败';
            }
        }

        // 更新状态显示
        updateStatusDisplay(connectionStatus, injectStatus) {
            try {
                // 更新连接状态
                const connectionStatusDot = document.getElementById('connectionStatusDot');
                const connectionStatusText = document.getElementById('connectionStatus');
                
                if (connectionStatusDot && connectionStatusText) {
                    connectionStatusText.textContent = connectionStatus;
                    this.updateStatusDot(connectionStatusDot, connectionStatus);
                }

                // 更新注入状态
                const injectStatusDot = document.getElementById('injectStatusDot');
                const injectStatusText = document.getElementById('injectStatus');
                
                if (injectStatusDot && injectStatusText) {
                    injectStatusText.textContent = injectStatus;
                    this.updateStatusDot(injectStatusDot, injectStatus);
                }
            } catch (e) {
                console.log('更新状态显示失败:', e);
            }
        }

        // 更新状态点的样式
        updateStatusDot(dotElement, status) {
            if (!dotElement) return;

            // 移除所有状态类
            dotElement.classList.remove('status-connecting', 'status-connected', 'status-disconnected', 'status-inactive', 'status-error');

            // 根据状态添加对应的类
            if (status === '已连接') {
                dotElement.classList.add('status-connected');
            } else if (status === '已注入') {
                dotElement.classList.add('status-connected');
            } else if (status === '运行中') {
                dotElement.classList.add('status-connecting');
            } else if (status === '未连接' || status === '未运行') {
                dotElement.classList.add('status-disconnected');
            } else if (status === '检查中...') {
                dotElement.classList.add('status-connecting');
            } else if (status === '检查失败' || status === '连接失败') {
                dotElement.classList.add('status-error');
            } else {
                dotElement.classList.add('status-inactive');
            }
        }

        // 手动刷新状态
        refresh() {
            this.checkStatus();
        }

        // 销毁检查器
        destroy() {
            this.stopAutoCheck();
            if (this.websocket) {
                this.websocket.close();
                this.websocket = null;
            }
        }
    }

    // 创建全局实例
    window.statusChecker = new StatusChecker();

    // 页面加载完成后自动初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.statusChecker.init();
        });
    } else {
        window.statusChecker.init();
    }

    // 页面卸载时清理
    window.addEventListener('beforeunload', () => {
        if (window.statusChecker) {
            window.statusChecker.destroy();
        }
    });

})(window);
