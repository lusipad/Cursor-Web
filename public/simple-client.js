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
        this.clearTimestamp = null; // 记录清理时间点

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

        // 动态获取WebSocket URL，支持局域网访问
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        const port = window.location.port || '3000';
        const wsUrl = `${protocol}//${host}:${port}`;
        
        console.log('🔌 尝试连接WebSocket:', wsUrl);
        this.updateStatus('正在连接...', 'connecting');

        this.ws = new WebSocket(wsUrl);

        // 自动重连设置
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
                if (data.type === 'clear_content') {
                    this.currentContent = '';
                    // 同步清除时间戳
                    if (data.timestamp) {
                        this.clearTimestamp = data.timestamp;
                        console.log('🧹 同步清除时间戳:', new Date(data.timestamp).toLocaleTimeString());
                    }
                    const contentArea = document.querySelector('.sync-content');
                    if (contentArea) contentArea.innerHTML = '';
                    const ts = document.querySelector('.last-update');
                    if (ts) ts.textContent = '';
                }
                if (data.type === 'pong') {
                    // 处理心跳响应
                    console.log('💓 收到心跳响应');
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
                this.updateStatus('连接断开 - 正在重连...', 'disconnected');
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
            const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1); // 指数退避
            console.log(`🔄 尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})，${delay/1000}秒后重试...`);
            this.updateStatus(`正在重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`, 'reconnecting');

            setTimeout(() => {
                this.connectWebSocket();
            }, delay);
        } else {
            console.log('❌ 重连失败，已达到最大尝试次数');
            this.updateStatus('连接失败 - 请刷新页面', 'error');
            
            // 提供手动重连按钮
            this.showReconnectButton();
        }
    }

    // 显示手动重连按钮
    showReconnectButton() {
        const statusEl = document.getElementById('status');
        if (!statusEl) return;

        const reconnectBtn = document.createElement('button');
        reconnectBtn.textContent = '点击重连';
        reconnectBtn.style.cssText = `
            margin-left: 10px;
            padding: 5px 10px;
            background: #007cba;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
        `;
        reconnectBtn.onclick = () => {
            this.reconnectAttempts = 0;
            this.connectWebSocket();
            reconnectBtn.remove();
        };
        
        statusEl.appendChild(reconnectBtn);
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
        if (!container) {
            console.error('❌ 未找到 messages-container');
            return;
        }

        const { html, timestamp } = contentData;

        // 检查是否需要过滤清除时间点之前的内容
        if (this.clearTimestamp && timestamp < this.clearTimestamp) {
            console.log('⏰ 跳过清理时间点之前的内容:', new Date(timestamp).toLocaleTimeString());
            console.log('📊 时间戳比较: 内容时间戳 < 清除时间戳 =', timestamp < this.clearTimestamp);
            console.log('📊 清除时间戳:', new Date(this.clearTimestamp).toLocaleTimeString());
            console.log('📊 内容时间戳:', new Date(timestamp).toLocaleTimeString());
            return;
        }

        if (html) {
            // 改进的内容变化检测 - 不仅比较内容，还比较长度和时间戳
            const contentChanged = html !== this.currentContent;
            const lengthChanged = html.length !== this.currentContent.length;
            const forceUpdate = timestamp && (!this.lastContentTime || timestamp > this.lastContentTime);
            
            if (contentChanged || lengthChanged || forceUpdate) {
                console.log('🔄 内容更新触发:', { 
                    contentChanged, 
                    lengthChanged, 
                    forceUpdate,
                    oldLength: this.currentContent.length,
                    newLength: html.length
                });
                
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
                contentArea.innerHTML = html;

                // 强制设置样式，保证格式
                contentArea.style.overflow = 'auto';
                contentArea.style.whiteSpace = 'pre-wrap';
                contentArea.style.wordBreak = 'break-all';
                contentArea.style.fontFamily = 'inherit';
                contentArea.style.fontSize = '16px';
                contentArea.style.background = '#000';
                contentArea.style.color = '#fff';

                // 递归移除所有子元素的 max-height/overflow 限制
                contentArea.querySelectorAll('*').forEach(el => {
                    el.style.maxHeight = 'none';
                    el.style.overflow = 'visible';
                    el.style.background = 'transparent';
                    el.style.color = '#fff';
                });

                // 添加时间戳
                this.updateTimestamp(new Date(timestamp));

                // 🔄 自动滚动到底部
                this.scrollToBottom(container);

                console.log('✅ 内容已更新，长度:', html.length);
                console.log('📊 内容预览:', html.substring(0, 200) + '...');
                console.log('📏 容器高度:', container.scrollHeight, 'px');
                console.log('📏 视口高度:', container.clientHeight, 'px');
                console.log('📏 滚动位置:', container.scrollTop, 'px');
            } else {
                console.log('📋 内容无变化，跳过更新');
            }
        }
    }

    // 滚动到底部
    scrollToBottom(container) {
        // 立即滚动，不等待
        try {
            container.scrollTop = container.scrollHeight;
            console.log('📜 已滚动到底部，新位置:', container.scrollTop);
        } catch (error) {
            console.warn('滚动失败:', error);
        }
        
        // 延迟再次确认滚动（确保内容完全渲染）
        setTimeout(() => {
            try {
                container.scrollTop = container.scrollHeight;
                console.log('📜 确认滚动到底部，最终位置:', container.scrollTop);
            } catch (error) {
                console.warn('确认滚动失败:', error);
            }
        }, 50); // 减少延迟从100ms到50ms
    }

    // 简单的HTML清理
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
                console.log('🔓 移除 max-height 限制:', style.maxHeight, '-> none');
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

        timestampEl.textContent = `最后更新: ${date.toLocaleTimeString()}`;
    }

    // 显示清理确认信息
    showClearNotification() {
        // 创建或更新清理状态显示
        let clearStatusEl = document.querySelector('.clear-status');
        if (!clearStatusEl) {
            clearStatusEl = document.createElement('div');
            clearStatusEl.className = 'clear-status';
            clearStatusEl.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #FF9800;
                color: white;
                padding: 12px 16px;
                border-radius: 6px;
                font-size: 14px;
                z-index: 1000;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            `;
            document.body.appendChild(clearStatusEl);
        }

        const clearTime = new Date(this.clearTimestamp).toLocaleTimeString();
        clearStatusEl.textContent = `🧹 已清空所有内容`;
        clearStatusEl.style.background = '#FF9800';

        // 3秒后自动隐藏
        setTimeout(() => {
            if (clearStatusEl && clearStatusEl.parentNode) {
                clearStatusEl.style.opacity = '0';
                clearStatusEl.style.transition = 'opacity 0.3s ease-out';
                setTimeout(() => {
                    if (clearStatusEl && clearStatusEl.parentNode) {
                        clearStatusEl.remove();
                    }
                }, 300);
            }
        }, 3000);

        console.log('🧹 清理确认信息已显示');
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
        clearBtn.addEventListener('click', async () => {
            sendInput.value = '';
            sendInput.focus();

            // 🕐 记录清理时间点
            const now = Date.now();
            if (window.simpleClient) {
                window.simpleClient.clearTimestamp = now;
                console.log('🧹 设置清理时间点:', new Date(now).toLocaleTimeString());
            }

            // 清空聊天内容区域
            const contentArea = document.querySelector('.sync-content');
            if (contentArea) contentArea.innerHTML = '';

            // 清空时间戳
            const ts = document.querySelector('.last-update');
            if (ts) ts.textContent = '';

            try {
                // 🧹 使用新的清除API，确保服务器端也清空
                const response = await fetch('/api/clear', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ timestamp: now })
                });
                
                const data = await response.json();
                if (data.success) {
                    console.log('✅ 服务器端内容已清空');
                }
            } catch (error) {
                console.warn('⚠️ 清除服务器内容失败:', error);
            }

            // 通过WebSocket通知所有客户端
            if (window.simpleClient && window.simpleClient.ws && window.simpleClient.ws.readyState === WebSocket.OPEN) {
                window.simpleClient.ws.send(JSON.stringify({ 
                    type: 'clear_content',
                    timestamp: now
                }));
                console.log('📡 发送清除消息到服务器，时间戳:', new Date(now).toLocaleTimeString());
            }

            // 显示清理确认信息
            if (window.simpleClient) {
                window.simpleClient.showClearNotification();
            }
        });
    }
});

// 全局错误处理
window.addEventListener('error', (event) => {
    console.error('🔥 页面错误:', event.error);
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
    console.log('  - WebSocket 状态:', client.ws?.readyState || '未连接');
    console.log('  - 当前内容长度:', client.currentContent?.length || 0);
    console.log('  - 容器元素:', container);
    console.log('  - 内容区域:', contentArea);

    if (container) {
        console.log('  - 容器高度:', container.scrollHeight, 'px');
        console.log('  - 视口高度:', container.clientHeight, 'px');
        console.log('  - 滚动位置:', container.scrollTop, 'px');
        console.log('  - 是否有滚动条:', container.scrollHeight > container.clientHeight);
    }

    if (contentArea) {
        console.log('  - 内容区域高度:', contentArea.scrollHeight, 'px');
        console.log('  - 内容区域内容长度:', contentArea.innerHTML.length);
        console.log('  - 内容预览:', contentArea.innerHTML.substring(0, 300) + '...');
    }

    // 手动触发滚动到底部
    if (container) {
        container.scrollTop = container.scrollHeight;
        console.log('📜 手动滚动到底部');
    }
};

// 添加清理状态调试功能
window.debugClearStatus = () => {
    if (!window.simpleClient) {
        console.log('❌ simpleClient 未初始化');
        return;
    }

    const client = window.simpleClient;
    const now = Date.now();
    console.log('🧹 清理状态调试信息：');
    console.log('  - 清理时间点:', client.clearTimestamp ? new Date(client.clearTimestamp).toLocaleString() : '未设置');
    console.log('  - 当前时间:', new Date(now).toLocaleString());

    if (client.clearTimestamp) {
        const timeDiff = now - client.clearTimestamp;
        console.log('  - 距离清理时间:', Math.floor(timeDiff / 1000), '秒');
        console.log('  - 是否已清理:', timeDiff > 0 ? '是' : '否');
    }

    // 显示当前清理状态
    const clearStatusEl = document.querySelector('.clear-status');
    console.log('  - 清理状态显示元素:', clearStatusEl);
    if (clearStatusEl) {
        console.log('  - 清理状态文本:', clearStatusEl.textContent);
    }
    
    // 测试时间戳比较
    const testTimestamp = now;
    console.log('  - 测试时间戳比较 (当前时间):', testTimestamp < client.clearTimestamp ? '会被过滤' : '不会被过滤');
    
    // 检查Cursor端状态
    if (window.cursorSync) {
        console.log('  - Cursor端清理时间戳:', window.cursorSync.clearTimestamp ? new Date(window.cursorSync.clearTimestamp).toLocaleString() : '未设置');
    }
};

// 添加强制清除功能
window.forceClear = () => {
    if (!window.simpleClient) {
        console.log('❌ simpleClient 未初始化');
        return;
    }
    
    const now = Date.now();
    console.log('🧹 强制清除所有内容...');
    
    // 设置清除时间戳
    window.simpleClient.clearTimestamp = now;
    
    // 清空界面
    const contentArea = document.querySelector('.sync-content');
    if (contentArea) contentArea.innerHTML = '';
    
    const ts = document.querySelector('.last-update');
    if (ts) ts.textContent = '';
    
    // 发送清除消息
    if (window.simpleClient.ws && window.simpleClient.ws.readyState === WebSocket.OPEN) {
        window.simpleClient.ws.send(JSON.stringify({ 
            type: 'clear_content',
            timestamp: now
        }));
        console.log('📡 发送强制清除消息到服务器');
    }
    
    // 使用新的清除API
    fetch('/api/clear', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ timestamp: now })
    }).catch(e => console.warn('清空服务器内容失败:', e));
    
    console.log('✅ 强制清除完成');
    
    // 显示确认信息
    if (window.simpleClient) {
        window.simpleClient.showClearNotification();
    }
};

    console.log('✅ Simple Client JS 加载完成');
    console.log('💡 调试命令：debugWebClient() - 查看 Web 客户端状态');
    console.log('💡 调试命令：debugClearStatus() - 查看清理状态');
    console.log('💡 调试命令：forceClear() - 强制清除所有内容');
