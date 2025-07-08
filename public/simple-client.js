console.log('🚀 Simple Claude Web Client 开始初始化...');

class SimpleWebClient {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
        this.heartbeatInterval = null;
        this.currentContent = '';
        this.hasReceivedContent = false;
        this.lastContentTime = null;
        this.statusCheckInterval = null;

        this.init();
    }

    init() {
        console.log('🔧 初始化简化客户端...');
        this.connectWebSocket();
        this.startContentPolling();
        this.startStatusCheck();
    }

    // 连接 WebSocket
    connectWebSocket() {
        if (this.ws) {
            this.ws.close();
        }

        const wsUrl = 'ws://localhost:3000';
        console.log('🔌 尝试连接WebSocket:', wsUrl);
        this.updateStatus('正在连接...', 'connecting');

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('✅ WebSocket 连接成功');
            this.reconnectAttempts = 0;
            if (this.hasReceivedContent) {
                this.updateStatus('已连接 - 同步正常', 'connected');
            } else {
                this.updateStatus('已连接 - 等待Cursor内容', 'waiting');
            }
            this.startHeartbeat();
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('📥 收到消息:', data.type);

                if (data.type === 'html_content') {
                    this.hasReceivedContent = true;
                    this.lastContentTime = Date.now();
                    this.displayContent(data.data);
                }
            } catch (error) {
                console.error('WebSocket 消息处理错误:', error);
            }
        };

        this.ws.onclose = (event) => {
            console.log('❌ WebSocket 连接关闭:', event.code);
            this.stopHeartbeat();
            this.stopStatusCheck();

            if (event.code !== 1000) {
                this.updateStatus('连接断开', 'disconnected');
                this.attemptReconnect();
            }
        };

        this.ws.onerror = (error) => {
            console.error('⚠️ WebSocket 错误:', error);
            this.updateStatus('连接错误', 'error');
        };
    }

    // 心跳检测
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    stopStatusCheck() {
        if (this.statusCheckInterval) {
            clearInterval(this.statusCheckInterval);
            this.statusCheckInterval = null;
        }
    }

    // 重连机制
    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`🔄 尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

            setTimeout(() => {
                this.connectWebSocket();
            }, this.reconnectDelay);
        } else {
            console.log('❌ 重连失败，已达到最大尝试次数');
            this.updateStatus('连接失败', 'error');
        }
    }

    // 轮询获取内容（备用方案）
    startContentPolling() {
        setInterval(async () => {
            try {
                const response = await fetch('/api/content');
                const result = await response.json();

                if (result.success && result.data && result.data.html !== this.currentContent) {
                    console.log('📡 HTTP轮询获取到新内容');
                    this.hasReceivedContent = true;
                    this.lastContentTime = Date.now();
                    this.displayContent(result.data);
                }
            } catch (error) {
                // 静默处理错误，避免控制台噪音
            }
        }, 10000); // 每10秒检查一次
    }

    // 状态检查 - 判断Cursor是否真正在同步
    startStatusCheck() {
        this.statusCheckInterval = setInterval(() => {
            this.checkCursorStatus();
        }, 15000); // 每15秒检查一次
    }

    checkCursorStatus() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return; // WebSocket未连接，不需要检查
        }

        const now = Date.now();
        const timeSinceLastContent = this.lastContentTime ? now - this.lastContentTime : null;

        if (!this.hasReceivedContent) {
            this.updateStatus('已连接 - 等待Cursor内容', 'waiting');
        } else if (timeSinceLastContent && timeSinceLastContent > 60000) {
            // 超过1分钟没有新内容，可能Cursor已关闭
            this.updateStatus('已连接 - Cursor可能已关闭', 'inactive');
        } else {
            this.updateStatus('已连接 - 同步正常', 'connected');
        }
    }

    // 更新状态显示
    updateStatus(message, type) {
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = `status ${type}`;
        }
    }

    // 显示聊天内容
    displayContent(contentData) {
        const container = document.getElementById('messages-container');
        if (!container) return;

        const { html, timestamp } = contentData;

        if (html && html !== this.currentContent) {
            this.currentContent = html;

            // 清除欢迎消息
            const welcome = container.querySelector('.welcome-message');
            if (welcome) {
                welcome.remove();
            }

            // 创建内容区域
            let contentArea = container.querySelector('.sync-content');
            if (!contentArea) {
                contentArea = document.createElement('div');
                contentArea.className = 'sync-content';
                container.appendChild(contentArea);
            }

            // 更新内容
            contentArea.innerHTML = this.sanitizeHTML(html);

            // 添加时间戳
            this.updateTimestamp(new Date(timestamp));

            console.log('✅ 内容已更新，长度:', html.length);
            this.updateStatus('已连接 - 同步正常', 'connected');
        }
    }

    // 简单的HTML清理
    sanitizeHTML(html) {
        // 移除可能的恶意脚本
        return html
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/on\w+="[^"]*"/gi, '')
            .replace(/javascript:/gi, '');
    }

    // 更新时间戳
    updateTimestamp(date) {
        let timestampEl = document.querySelector('.last-update');
        if (!timestampEl) {
            timestampEl = document.createElement('div');
            timestampEl.className = 'last-update';
            document.querySelector('.header').appendChild(timestampEl);
        }

        timestampEl.textContent = `最后更新: ${date.toLocaleTimeString()}`;
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 页面加载完成，启动简化客户端...');
    window.simpleClient = new SimpleWebClient();
});

// 全局错误处理
window.addEventListener('error', (event) => {
    console.error('🔥 页面错误:', event.error);
});

console.log('✅ Simple Client JS 加载完成');
