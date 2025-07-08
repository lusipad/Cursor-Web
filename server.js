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
        console.log('🔌 尝试连接 WebSocket:', wsUrl);
        this.updateStatus('正在连接...', 'connecting');

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('✅ WebSocket 连接成功');
            this.reconnectAttempts = 0;
            if (this.hasReceivedContent) {
                this.updateStatus('已连接 - 同步正常', 'connected');
            } else {
                this.updateStatus('已连接 - 等待 Cursor 内容', 'waiting');
            }
            this.startHeartbeat();
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('📥 收到消息：', data.type);

                if (data.type === 'html_content') {
                    this.hasReceivedContent = true;
                    this.lastContentTime = Date.now();
                    this.displayContent(data.data);
                }
                if (data.type === 'clear_content') {
                    this.currentContent = '';
                    const contentArea = document.querySelector('.sync-content');
                    if (contentArea) contentArea.innerHTML = '';
                    const ts = document.querySelector('.last-update');
                    if (ts) ts.textContent = '';
                }
            } catch (error) {
                console.error('WebSocket 消息处理错误：', error);
            }
        };

        this.ws.onclose = (event) => {
            console.log('❌ WebSocket 连接关闭：', event.code);
            this.stopHeartbeat();
            this.stopStatusCheck();

            if (event.code !== 1000) {
                this.updateStatus('连接断开', 'disconnected');
                this.attemptReconnect();
            }
        };

        this.ws.onerror = (error) => {
            console.error('⚠️ WebSocket 错误：', error);
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
                    console.log('📡 HTTP 轮询获取到新内容');
                    this.hasReceivedContent = true;
                    this.lastContentTime = Date.now();
                    this.displayContent(result.data);
                }
            } catch (error) {
                // 静默处理错误，避免控制台噪音
            }
        }, 10000); // 每 10 秒检查一次
    }

    // 状态检查 - 判断 Cursor 是否真正在同步
    startStatusCheck() {
        this.statusCheckInterval = setInterval(() => {
            this.checkCursorStatus();
        }, 15000); // 每 15 秒检查一次
    }

    checkCursorStatus() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return; // WebSocket 未连接，不需要检查
        }

        const now = Date.now();
        const timeSinceLastContent = this.lastContentTime ? now - this.lastContentTime : null;

        if (!this.hasReceivedContent) {
            this.updateStatus('已连接 - 等待 Cursor 内容', 'waiting');
        } else if (timeSinceLastContent && timeSinceLastContent > 60000) {
            // 超过 1 分钟没有新内容，可能 Cursor 已关闭
            this.updateStatus('已连接 - Cursor 可能已关闭', 'inactive');
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
        if (!container) {
            console.error('❌ 未找到 messages-container');
            return;
        }

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
            const sanitizedHtml = this.sanitizeHTML(html);
            contentArea.innerHTML = sanitizedHtml;

            // 🎯 自动去除所有 max-height 和 overflow: hidden 样式
            this.removeHeightRestrictions(contentArea);

            // 添加时间戳
            this.updateTimestamp(new Date(timestamp));

            // 🔄 自动滚动到底部
            this.scrollToBottom(container);

            console.log('✅ 内容已更新，长度：', html.length);
            console.log('📊 内容预览：', html.substring(0, 200) + '...');
            console.log('📏 容器高度：', container.scrollHeight, 'px');
            console.log('📏 视口高度：', container.clientHeight, 'px');
            console.log('📏 滚动位置：', container.scrollTop, 'px');

            this.updateStatus('已连接 - 同步正常', 'connected');
        }
    }

    // 滚动到底部
    scrollToBottom(container) {
        setTimeout(() => {
            try {
                container.scrollTop = container.scrollHeight;
                console.log('📜 已滚动到底部，新位置：', container.scrollTop);
            } catch (error) {
                console.warn('滚动失败：', error);
            }
        }, 100); // 延迟确保内容已渲染
    }

    // 简单的 HTML 清理
    sanitizeHTML(html) {
        // 移除可能的恶意脚本
        return html
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/on\w+="[^"]*"/gi, '')
            .replace(/javascript:/gi, '');
    }

    // 移除高度限制样式
    removeHeightRestrictions(element) {
        if (!element) return;

        // 递归处理所有子元素
        const allElements = [element, ...element.querySelectorAll('*')];

        allElements.forEach(el => {
            const style = el.style;

            // 移除 max-height 限制
            if (style.maxHeight && style.maxHeight !== 'none') {
                console.log('🔓 移除 max-height 限制：', style.maxHeight, '-> none');
                style.maxHeight = 'none';
            }

            // 移除 overflow: hidden 限制
            if (style.overflow === 'hidden') {
                console.log('🔓 移除 overflow: hidden 限制');
                style.overflow = 'visible';
            }

            // 移除 overflow-y: hidden 限制
            if (style.overflowY === 'hidden') {
                console.log('🔓 移除 overflow-y: hidden 限制');
                style.overflowY = 'visible';
            }

            // 移除 overflow-x: hidden 限制
            if (style.overflowX === 'hidden') {
                console.log('🔓 移除 overflow-x: hidden 限制');
                style.overflowX = 'visible';
            }
        });

        console.log('🎯 已移除所有高度限制样式，确保内容完整显示');
    }

    // 更新时间戳
    updateTimestamp(date) {
        let timestampEl = document.querySelector('.last-update');
        if (!timestampEl) {
            timestampEl = document.createElement('div');
            timestampEl.className = 'last-update';
            document.querySelector('.header').appendChild(timestampEl);
        }

        timestampEl.textContent = `最后更新：${date.toLocaleTimeString()}`;
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 页面加载完成，启动简化客户端...');
    window.simpleClient = new SimpleWebClient();

    // 发送消息功能
    const sendForm = document.getElementById('send-form');
    const sendInput = document.getElementById('send-input');
    const clearBtn = document.getElementById('clear-btn');
    if (sendForm && sendInput) {
        sendForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const msg = sendInput.value.trim();
            if (msg && window.simpleClient && window.simpleClient.ws && window.simpleClient.ws.readyState === WebSocket.OPEN) {
                window.simpleClient.ws.send(JSON.stringify({ type: 'user_message', data: msg }));
                sendInput.value = '';
            }
        });
        sendInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendForm.dispatchEvent(new Event('submit'));
            }
        });
    }
    // 清除按钮功能
    if (clearBtn && sendInput) {
        clearBtn.addEventListener('click', () => {
            sendInput.value = '';
            sendInput.focus();
            // 清空聊天内容区域
            const contentArea = document.querySelector('.sync-content');
            if (contentArea) contentArea.innerHTML = '';
            // 清空时间戳
            const ts = document.querySelector('.last-update');
            if (ts) ts.textContent = '';
            // 通知服务器清空内容
            if (window.simpleClient && window.simpleClient.ws && window.simpleClient.ws.readyState === WebSocket.OPEN) {
                window.simpleClient.ws.send(JSON.stringify({ type: 'clear_content' }));
            }
        });
    }
});

// 全局错误处理
window.addEventListener('error', (event) => {
    console.error('🔥 页面错误：', event.error);
});

// 添加调试功能
window.debugWebClient = () => {
    if (!window.simpleClient) {
        console.log('❌ simpleClient 未初始化');
        return;
    }

    const client = window.simpleClient;
    const container = document.getElementById('messages-container');
    const contentArea = container?.querySelector('.sync-content');

    console.log('🔍 Web 客户端调试信息：');
    console.log('  - WebSocket 状态：', client.ws?.readyState || '未连接');
    console.log('  - 当前内容长度：', client.currentContent?.length || 0);
    console.log('  - 容器元素：', container);
    console.log('  - 内容区域：', contentArea);

    if (container) {
        console.log('  - 容器高度：', container.scrollHeight, 'px');
        console.log('  - 视口高度：', container.clientHeight, 'px');
        console.log('  - 滚动位置：', container.scrollTop, 'px');
        console.log('  - 是否有滚动条：', container.scrollHeight > container.clientHeight);
    }

    if (contentArea) {
        console.log('  - 内容区域高度：', contentArea.scrollHeight, 'px');
        console.log('  - 内容区域内容长度：', contentArea.innerHTML.length);
        console.log('  - 内容预览：', contentArea.innerHTML.substring(0, 300) + '...');
    }

    // 手动触发滚动到底部
    if (container) {
        container.scrollTop = container.scrollHeight;
        console.log('📜 手动滚动到底部');
    }
};

console.log('✅ Simple Client JS 加载完成');
console.log('💡 调试命令：debugWebClient() - 查看 Web 客户端状态');
