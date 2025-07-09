// 🚀 Cursor 浏览器同步脚本
// 专用于 Cursor 开发者控制台，100% 浏览器兼容

console.log('🚀 Cursor 同步脚本启动...');

// 🔧 全局 WebSocket 连接管理器
class WebSocketManager {
    constructor() {
        this.ws = null;
        this.isConnecting = false;
        this.retryCount = 0;
        this.maxRetries = 5;
        this.serverUrl = 'http://localhost:3000';
        this.onMessageCallback = null;
    }

    // 连接 WebSocket
    connect(onMessage) {
        console.log('🔌 WebSocket 管理器：开始连接...');

        // 设置消息回调
        this.onMessageCallback = onMessage;

        // 如果正在连接，直接返回
        if (this.isConnecting) {
            console.log('⚠️ WebSocket 管理器：正在连接中，跳过重复请求');
            return;
        }

        // 如果已经连接，直接返回
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('✅ WebSocket 管理器：已连接，无需重复连接');
            return;
        }

        // 关闭现有连接
        this.disconnect();

        this.isConnecting = true;
        console.log('🔌 WebSocket 管理器：建立新连接...');

        try {
            const wsUrl = this.serverUrl.replace('http', 'ws');
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('✅ WebSocket 管理器：连接成功');
                this.isConnecting = false;
                this.retryCount = 0;
            };

            this.ws.onmessage = (event) => {
                if (this.onMessageCallback) {
                    this.onMessageCallback(event);
                }
            };

            this.ws.onclose = () => {
                console.log('📱 WebSocket 管理器：连接关闭');
                this.isConnecting = false;
                this.ws = null;

                // 自动重连
                if (this.retryCount < this.maxRetries) {
                    this.retryCount++;
                    console.log(`🔄 WebSocket 管理器：自动重连 (${this.retryCount}/${this.maxRetries})...`);
                    setTimeout(() => this.connect(this.onMessageCallback), 3000 * this.retryCount);
                }
            };

            this.ws.onerror = (error) => {
                console.error('❌ WebSocket 管理器：连接错误', error);
                this.isConnecting = false;
            };

        } catch (error) {
            console.error('❌ WebSocket 管理器：连接失败', error);
            this.isConnecting = false;
        }
    }

    // 断开连接
    disconnect() {
        if (this.ws) {
            console.log('🔄 WebSocket 管理器：断开连接...');
            this.ws.close();
            this.ws = null;
        }
        this.isConnecting = false;
    }

    // 发送消息
    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
            return true;
        }
        return false;
    }

    // 获取连接状态
    getStatus() {
        if (!this.ws) return '未连接';
        const states = ['连接中', '已连接', '关闭中', '已关闭'];
        return states[this.ws.readyState] || '未知';
    }
}

// 全局 WebSocket 管理器实例
window.webSocketManager = window.webSocketManager || new WebSocketManager();

class CursorSync {
    constructor() {
        this.serverUrl = 'http://localhost:3000';
        this.lastContent = '';
        this.chatContainer = null;
        this.syncInterval = null;
        this.retryCount = 0;
        this.maxRetries = 3;

        this.init();
    }

    async init() {
        console.log('🔧 初始化同步器...');

        try {
            // 测试服务器
            await this.testConnection();
            console.log('✅ 服务器连接成功');

            // 查找聊天区域
            this.findChatArea();

                        // 开始同步
            this.startSync();

            // 连接 WebSocket 以接收来自 Web 端的消息
            this.connectWebSocket();

            this.showNotification('✅ 同步已启动', '#4CAF50');

        } catch (error) {
            console.error('❌ 初始化失败：', error);
            this.showNotification('❌ 初始化失败：' + error.message, '#FF5722');
        }
    }

    async testConnection() {
        const response = await fetch(this.serverUrl + '/api/test');
        if (!response.ok) {
            throw new Error(`服务器连接失败 (${response.status})`);
        }
        return response.json();
    }

    findChatArea() {
        console.log('🔍 查找聊天区域...');

        // Cursor 聊天区域选择器 - 更精确的选择器
        const selectors = [
            '[data-testid*="chat"]',
            '[data-testid*="conversation"]',
            '[data-testid*="messages"]',
            '.chat-container',
            '.conversation-container',
            '.messages-container',
            'div[class*="chat"]',
            'div[class*="conversation"]',
            'div[class*="message"]',
            '[role="main"]',
            'main',
            // 添加更多 Cursor 特定的选择器
            '.aislash-chat-container',
            '.aislash-conversation',
            '[class*="aislash"]',
            '[class*="chat"]',
            '[class*="conversation"]'
        ];

        let bestElement = null;
        let bestScore = 0;

        for (const selector of selectors) {
            try {
                const elements = document.querySelectorAll(selector);
                for (const el of elements) {
                    const score = this.scoreElement(el);
                    if (score > bestScore) {
                        bestScore = score;
                        bestElement = el;
                    }
                }
            } catch (e) {
                console.warn('选择器错误：', selector);
            }
        }

        if (bestElement && bestScore > 10) {
            this.chatContainer = bestElement;
            console.log('✅ 找到聊天区域 (得分：' + bestScore + ')');
        } else {
            console.log('⚠️ 使用 document.body 作为备选');
            this.chatContainer = document.body;
        }
    }

    scoreElement(element) {
        let score = 0;

        try {
            const rect = element.getBoundingClientRect();
            const text = element.textContent || '';
            const className = (element.className || '').toLowerCase();

            // 基础得分
            if (element.children.length >= 2) score += 10;
            if (text.length >= 50) score += 15;
            if (rect.width > 200 && rect.height > 150) score += 10;

            // 位置得分 - Cursor 聊天通常在右侧
            if (rect.left > window.innerWidth * 0.3) score += 15;

            // 关键词得分
            const keywords = ['chat', 'conversation', 'message', 'assistant', 'aislash'];
            for (const keyword of keywords) {
                if (className.includes(keyword)) score += 20;
            }

            // AI 相关内容
            if (text.includes('Claude') || text.includes('AI') || text.includes('Assistant')) score += 15;

            // 可见性检查
            if (element.offsetParent !== null) score += 10;

            return score;
        } catch (e) {
            return 0;
        }
    }

    getContent() {
        if (!this.chatContainer) return null;

        try {
            const clone = this.chatContainer.cloneNode(true);

            // 清理不需要的元素
            const removeSelectors = ['script', 'style', '.copy-button', 'noscript'];
            for (const selector of removeSelectors) {
                const elements = clone.querySelectorAll(selector);
                for (const el of elements) el.remove();
            }

            const htmlContent = clone.innerHTML;
            const textContent = clone.textContent || '';

            // 降低最小内容长度要求，并检查文本内容
            if (htmlContent.length < 20 || textContent.trim().length < 10) {
                return null;
            }

            return {
                html: htmlContent,
                timestamp: Date.now(),
                url: window.location.href,
                contentLength: htmlContent.length,
                textLength: textContent.length
            };
        } catch (error) {
            console.error('❌ 获取内容失败：', error);
            return null;
        }
    }

    async sendToServer(content) {
        try {
            console.log(`📤 发送内容 (${content.contentLength} 字符)...`);

            const response = await fetch(this.serverUrl + '/api/content', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'html_content',
                    data: content
                })
            });

            if (response.ok) {
                console.log('✅ 发送成功');
                this.retryCount = 0;
                return true;
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('❌ 发送失败：', error);
            this.retryCount++;

            if (this.retryCount < this.maxRetries) {
                console.log(`🔄 3秒后重试 (${this.retryCount}/${this.maxRetries})...`);
                setTimeout(() => this.checkAndSync(), 3000);
            } else {
                this.showNotification('❌ 发送失败，重试次数已达上限', '#FF5722');
            }
            return false;
        }
    }

    async checkAndSync() {
        const content = this.getContent();

        if (content && content.html !== this.lastContent) {
            console.log('🔄 检测到内容变化，同步中...');

            const success = await this.sendToServer(content);
            if (success) {
                this.lastContent = content.html;
                this.showNotification('🔄 内容已同步', '#2196F3', 2000);
            }
        }
    }

        startSync() {
        console.log('🚀 开始定时同步 (每 3 秒)...');

        // 立即执行一次
        this.checkAndSync();

        // 设置定时器
        this.syncInterval = setInterval(() => {
            this.checkAndSync();
        }, 3000);
    }

    // WebSocket 连接功能
    connectWebSocket() {
        console.log('🔌 CursorSync：使用全局 WebSocket 管理器连接...');

        // 使用全局 WebSocket 管理器
        window.webSocketManager.connect((event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleWebSocketMessage(message);
            } catch (error) {
                console.error('❌ 解析 WebSocket 消息失败：', error);
            }
        });

        this.showNotification('📡 已连接到消息服务', '#4CAF50', 2000);
    }

    // 处理来自 WebSocket 的消息
    handleWebSocketMessage(message) {
        console.log('📥 收到 WebSocket 消息：', message.type);

        switch (message.type) {
            case 'user_message':
                this.handleUserMessage(message.data);
                break;
            case 'pong':
                // 心跳响应，无需处理
                break;
            case 'clear_content':
                console.log('🧹 收到清空内容指令');
                break;
            default:
                console.log('❓ 未知消息类型：', message.type);
        }
    }

        // 处理用户消息 - 将消息发送到 Cursor 聊天输入框
    handleUserMessage(messageText) {
        console.log('💬 收到用户消息，发送到 Cursor：', messageText);

        try {
            // 🎯 使用 Cursor 特定的选择器（基于成功的旧版本）
            const inputDiv = document.querySelector('div.aislash-editor-input[contenteditable="true"]');

            if (!inputDiv) {
                console.error('❌ 未找到 Cursor 输入框 (div.aislash-editor-input[contenteditable="true"])');
                this.showDebugInfo();
                this.tryFallbackInputMethods(messageText);
                return;
            }

            console.log('✅ 找到 Cursor 输入框');

            // 确保输入框获得焦点
            inputDiv.focus();

            // 🔑 关键：使用粘贴事件（而不是直接设置值）
            const clipboardData = new DataTransfer();
            clipboardData.setData('text/plain', messageText);

            // 创建并派发粘贴事件
            const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: clipboardData
            });

            console.log('📋 触发粘贴事件');
            inputDiv.dispatchEvent(pasteEvent);

            // 粘贴后尝试点击发送按钮
            setTimeout(() => {
                this.clickCursorSendButton();
            }, 100);

            console.log('✅ 消息已通过粘贴事件发送到 Cursor');
            this.showNotification('💬 消息已发送到 Cursor', '#2196F3', 3000);

        } catch (error) {
            console.error('❌ 发送消息到 Cursor 失败：', error);
            this.showNotification('❌ 发送失败，尝试备用方案', '#FF5722', 4000);
            this.tryFallbackInputMethods(messageText);
        }
    }

    // 🔘 点击 Cursor 发送按钮
    clickCursorSendButton() {
        // 🎯 使用 Cursor 特定的发送按钮选择器
        const sendBtn = document.querySelector('.anysphere-icon-button .codicon-arrow-up-two')?.parentElement;

        if (sendBtn && sendBtn.offsetParent !== null && !sendBtn.disabled) {
            console.log('✅ 找到 Cursor 发送按钮，点击发送');
            sendBtn.click();
            console.log('✅ 消息已发送到 Cursor');
            return true;
        }

        // 备用按钮选择器
        const fallbackSelectors = [
            '.anysphere-icon-button .codicon-arrow-up-two',
            '.codicon-arrow-up-two',
            'button .codicon-arrow-up-two',
            '[class*="anysphere-icon-button"]',
            'button[class*="send"]'
        ];

        for (const selector of fallbackSelectors) {
            const element = document.querySelector(selector);
            if (element) {
                const button = element.closest('button') || element.parentElement;
                if (button && button.offsetParent !== null && !button.disabled) {
                    console.log('✅ 找到 Cursor 备用按钮：', selector);
                    button.click();
                    return true;
                }
            }
        }

        console.warn('⚠️ 未找到发送按钮，尝试键盘发送');

        // 最后尝试键盘事件
        const inputDiv = document.querySelector('div.aislash-editor-input[contenteditable="true"]');
        if (inputDiv) {
            inputDiv.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            }));
            return true;
        }

        return false;
    }

    // 🔍 显示调试信息
    showDebugInfo() {
        console.log('🔍 Cursor 调试信息：');
        console.log('Cursor 特定输入框：', document.querySelector('div.aislash-editor-input[contenteditable="true"]'));
        console.log('Cursor 发送按钮：', document.querySelector('.anysphere-icon-button .codicon-arrow-up-two')?.parentElement);
        console.log('所有 aislash-editor-input 元素：', document.querySelectorAll('.aislash-editor-input'));
        console.log('所有 contenteditable 元素：', document.querySelectorAll('[contenteditable="true"]'));
        console.log('所有 anysphere-icon-button 元素：', document.querySelectorAll('.anysphere-icon-button'));
        console.log('所有 codicon-arrow-up-two 元素：', document.querySelectorAll('.codicon-arrow-up-two'));
    }

    // 🛠️ 备用输入方案
    tryFallbackInputMethods(messageText) {
        console.log('🛠️ 尝试备用输入方案...');

        // 备用选择器
        const fallbackSelectors = [
            'div.aislash-editor-input',
            '.aislash-editor-input[contenteditable="true"]',
            '.aislash-editor-input',
            'div[contenteditable="true"]',
            '[role="textbox"]',
            'textarea[placeholder*="问"]',
            'textarea[placeholder*="Ask"]',
            'textarea'
        ];

        for (const selector of fallbackSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
                if (element.offsetParent !== null &&
                    element.offsetHeight > 20 &&
                    !element.disabled &&
                    !element.readOnly) {

                    console.log('🎯 尝试备用输入框：', selector);

                    try {
                        element.focus();

                        if (element.tagName === 'TEXTAREA') {
                            element.value = messageText;
                            element.dispatchEvent(new Event('input', { bubbles: true }));
                            element.dispatchEvent(new Event('change', { bubbles: true }));
                        } else {
                            // 尝试粘贴事件
                            const clipboardData = new DataTransfer();
                            clipboardData.setData('text/plain', messageText);
                            const pasteEvent = new ClipboardEvent('paste', {
                                bubbles: true,
                                cancelable: true,
                                clipboardData: clipboardData
                            });
                            element.dispatchEvent(pasteEvent);
                        }

                        console.log('✅ 备用方案成功设置消息');
                        this.showNotification('✅ 消息已通过备用方案设置', '#4CAF50', 3000);
                        return true;

                    } catch (error) {
                        console.warn('备用方案失败：', error);
                    }
                }
            }
        }

        // 最终备用：复制到剪贴板
        console.warn('⚠️ 所有输入方案都失败，复制到剪贴板');
        this.copyToClipboard(messageText);
        this.showNotification('📋 消息已复制到剪贴板，请手动粘贴', '#FF9800', 5000);

        return false;
    }

    // 复制文本到剪贴板
    copyToClipboard(text) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text);
            } else {
                // 备用方案
                const textArea = document.createElement('textarea');
                textArea.value = text;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
            }
            console.log('📋 消息已复制到剪贴板');
        } catch (error) {
            console.error('❌ 复制到剪贴板失败：', error);
        }
    }



        stop() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log('🛑 同步已停止');
        }

        // 注意：不关闭全局 WebSocket 连接，让其他实例继续使用
        console.log('🛑 CursorSync 实例已停止');

        this.showNotification('🛑 同步已停止', '#FF9800');
    }

    // 🔄 重启同步功能
    restart() {
        console.log('🔄 重启 Cursor 同步器...');

        // 先停止现有连接
        this.stop();

        // 重置重试计数
        this.retryCount = 0;
        this.wsRetryCount = 0;

        // 重新初始化
        setTimeout(() => {
            this.init();
        }, 2000); // 增加延迟时间
    }

    showNotification(text, color = '#4CAF50', duration = 4000) {
        // 移除旧通知
        const oldNotif = document.getElementById('cursor-sync-notification');
        if (oldNotif) oldNotif.remove();

        // 创建新通知
        const notification = document.createElement('div');
        notification.id = 'cursor-sync-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 999999;
            background: ${color};
            color: white;
            padding: 12px 16px;
            border-radius: 6px;
            font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            max-width: 300px;
        `;
        notification.textContent = text;

        document.body.appendChild(notification);

        // 自动移除
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, duration);
    }
}

// 启动同步器
console.log('🎯 启动 Cursor 同步器...');

// 🔧 全局实例管理：确保只有一个实例运行
if (window.cursorSync) {
    console.log('🔄 检测到现有 CursorSync 实例，正在清理...');
    try {
        window.cursorSync.stop();
    } catch (error) {
        console.warn('⚠️ 清理现有实例时出错：', error);
    }
    window.cursorSync = null;
}

// 创建新实例
try {
    window.cursorSync = new CursorSync();
    console.log('✅ Cursor 同步器启动成功');
    console.log('🔧 使用全局 WebSocket 管理器，确保只有一个连接');
} catch (error) {
    console.error('❌ Cursor 同步器启动失败：', error);
}

// 全局控制函数
window.stopCursorSync = () => {
    if (window.cursorSync) {
        window.cursorSync.stop();
    }
};

window.restartCursorSync = () => {
    if (window.cursorSync) {
        window.cursorSync.restart();
    } else {
        console.log('🔄 重新创建 Cursor 同步器...');
        window.cursorSync = new CursorSync();
    }
};

// 强制清理所有连接
window.forceCleanup = () => {
    console.log('🧹 强制清理所有连接...');

    // 清理现有实例
    if (window.cursorSync) {
        console.log('🔄 清理现有 CursorSync 实例...');
        window.cursorSync.stop();
        window.cursorSync = null;
        console.log('✅ CursorSync 实例清理完成');
    }

    // 清理全局 WebSocket 管理器
    if (window.webSocketManager) {
        console.log('🔄 清理全局 WebSocket 管理器...');
        window.webSocketManager.disconnect();
        window.webSocketManager = null;
        console.log('✅ WebSocket 管理器清理完成');
    }

    // 清理可能存在的通知
    const notification = document.getElementById('cursor-sync-notification');
    if (notification) {
        notification.remove();
    }

    console.log('🧹 强制清理完成！');
};

// 完全重置并重新启动
window.fullReset = () => {
    console.log('🔄 完全重置 Cursor 同步器...');

    // 1. 强制清理
    window.forceCleanup();

    // 2. 等待一段时间确保清理完成
    setTimeout(() => {
        console.log('🚀 重新创建 Cursor 同步器...');
        try {
            window.cursorSync = new CursorSync();
            console.log('✅ 完全重置完成！');
        } catch (error) {
            console.error('❌ 重新创建失败：', error);
        }
    }, 1000);
};

window.debugCursorSync = () => {
    if (!window.cursorSync) {
        console.log('❌ 同步器未初始化');
        return;
    }

    const sync = window.cursorSync;
    console.log('🔍 Cursor 同步器调试信息：');
    console.log('  - 服务器：', sync.serverUrl);
    console.log('  - 聊天容器：', sync.chatContainer?.tagName);
    console.log('  - 最后内容长度：', sync.lastContent.length);
    console.log('  - HTTP 重试次数：', sync.retryCount);
    console.log('  - 同步状态：', sync.syncInterval ? '运行中' : '已停止');

    // WebSocket 管理器状态
    if (window.webSocketManager) {
        console.log('  - WebSocket 管理器状态：', window.webSocketManager.getStatus());
        console.log('  - WebSocket 管理器连接中：', window.webSocketManager.isConnecting);
        console.log('  - WebSocket 管理器重试次数：', window.webSocketManager.retryCount);
    } else {
        console.log('  - WebSocket 管理器：未初始化');
    }

    // WebSocket 管理器详细信息
    if (window.webSocketManager && window.webSocketManager.ws) {
        const states = ['连接中', '已连接', '关闭中', '已关闭'];
        console.log('  - WebSocket 状态说明：', states[window.webSocketManager.ws.readyState] || '未知');
        console.log('  - WebSocket URL:', window.webSocketManager.ws.url);
    }

    // 测试内容获取
    const content = sync.getContent();
    if (content) {
        console.log('✅ 当前内容：', content.contentLength, '字符');
    } else {
        console.log('❌ 内容获取失败');
    }

    // 测试输入框查找
    console.log('🔍 查找输入框测试：');

    // 🎯 首先测试 Cursor 特定选择器
    console.log('📍 Cursor 特定选择器测试：');
    const cursorInput = document.querySelector('div.aislash-editor-input[contenteditable="true"]');
    console.log(`  - div.aislash-editor-input[contenteditable="true"]: ${cursorInput ? '✅ 找到' : '❌ 未找到'}`);
    if (cursorInput) {
        console.log(`    可见：${cursorInput.offsetParent !== null}, 高度：${cursorInput.offsetHeight}px`);
        console.log(`    类名："${cursorInput.className}"`);
        console.log(`    ID: "${cursorInput.id}"`);
    }

    // 测试 Cursor 发送按钮
    const cursorSendBtn = document.querySelector('.anysphere-icon-button .codicon-arrow-up-two')?.parentElement;
    console.log(`  - Cursor 发送按钮：${cursorSendBtn ? '✅ 找到' : '❌ 未找到'}`);
    if (cursorSendBtn) {
        console.log(`    可见：${cursorSendBtn.offsetParent !== null}, 启用：${!cursorSendBtn.disabled}`);
    }

    // 通用选择器测试
    console.log('\n📍 通用选择器测试：');
    const inputSelectors = [
        'div.aislash-editor-input',
        '.aislash-editor-input',
        'div[contenteditable="true"]',
        '[contenteditable="true"]',
        'textarea[placeholder*="Ask"]',
        'textarea[placeholder*="问"]',
        'textarea',
        '[role="textbox"]'
    ];

    for (const selector of inputSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
            console.log(`  - ${selector}: 找到 ${elements.length} 个元素`);
            for (let i = 0; i < elements.length; i++) {
                const el = elements[i];
                console.log(`    [${i}] 可见: ${el.offsetParent !== null}, 启用: ${!el.disabled}, 高度: ${el.offsetHeight}px`);
            }
        }
    }

    // 手动测试消息发送
    console.log('\n💡 手动测试提示：');
    console.log('  运行 testCursorMessageSending("测试消息") 来测试消息发送');
    console.log('  运行 restartCursorSync() 来重启同步器');
    console.log('  运行 checkWebSocketStatus() 来检查 WebSocket 状态');
};

// 添加手动测试函数
window.testCursorMessageSending = (message = '这是一个测试消息') => {
    if (!window.cursorSync) {
        console.log('❌ cursorSync 未初始化');
        return;
    }

    console.log('🧪 手动测试消息发送：', message);
    window.cursorSync.handleUserMessage(message);
};



// 添加 WebSocket 状态检查函数
window.checkWebSocketStatus = () => {
    console.log('🔍 WebSocket 状态检查：');

    if (window.webSocketManager) {
        console.log('✅ WebSocket 管理器已初始化');
        console.log('  - 连接状态：', window.webSocketManager.getStatus());
        console.log('  - 连接中：', window.webSocketManager.isConnecting);
        console.log('  - 重试次数：', window.webSocketManager.retryCount);
        console.log('  - 最大重试次数：', window.webSocketManager.maxRetries);

        if (window.webSocketManager.ws) {
            const states = ['连接中', '已连接', '关闭中', '已关闭'];
            console.log('  - WebSocket 状态：', states[window.webSocketManager.ws.readyState] || '未知');
            console.log('  - URL:', window.webSocketManager.ws.url);
            console.log('  - 协议：', window.webSocketManager.ws.protocol);
        }
    } else {
        console.log('❌ WebSocket 管理器未初始化');
    }

    if (window.cursorSync) {
        console.log('✅ CursorSync 实例已初始化');
    } else {
        console.log('❌ CursorSync 实例未初始化');
    }
};

// 检查所有可能的 WebSocket 连接
window.checkAllWebSockets = () => {
    console.log('🔍 检查所有 WebSocket 连接...');

    // 检查全局实例
    if (window.cursorSync) {
        console.log('✅ 找到全局 cursorSync 实例');
        if (window.cursorSync.ws) {
            const states = ['连接中', '已连接', '关闭中', '已关闭'];
            console.log(`  - WebSocket 状态：${states[window.cursorSync.ws.readyState] || '未知'}`);
        } else {
            console.log('  - 无 WebSocket 连接');
        }
    } else {
        console.log('❌ 未找到全局 cursorSync 实例');
    }

    // 检查是否有其他 WebSocket 连接
    console.log('🔍 检查页面中的所有 WebSocket 连接...');
    const allElements = document.querySelectorAll('*');
    let wsCount = 0;

    for (const element of allElements) {
        if (element._websocket || element.websocket) {
            wsCount++;
            console.log(`  - 发现 WebSocket 连接 #${wsCount}:`, element);
        }
    }

    if (wsCount === 0) {
        console.log('✅ 页面中未发现其他 WebSocket 连接');
    } else {
        console.log(`⚠️ 发现 ${wsCount} 个其他 WebSocket 连接`);
    }
};

console.log('✨ Cursor 同步脚本加载完成！');
console.log('💡 使用说明：');
console.log('  - 脚本会自动开始双向同步');
console.log('  - HTTP 同步：Cursor → Web (每 5 秒检查)');
console.log('  - WebSocket：Web → Cursor (实时接收)');
console.log('  - stopCursorSync() - 停止同步');
console.log('  - restartCursorSync() - 重启同步');
console.log('  - debugCursorSync() - 查看调试信息');
console.log('  - testCursorMessageSending("消息") - 手动测试发送');

console.log('  - checkWebSocketStatus() - 检查 WebSocket 状态');
console.log('  - checkAllWebSockets() - 检查所有 WebSocket 连接');
console.log('  - forceCleanup() - 强制清理所有连接');
console.log('  - fullReset() - 完全重置并重新启动');
console.log('  - 确保服务器在 localhost:3000 运行');
console.log('🎯 现在可以从 Web 界面发送消息到 Cursor 了！');
console.log('🔧 使用全局 WebSocket 管理器，确保只有一个连接');

// 页面卸载时自动清理
window.addEventListener('beforeunload', () => {
    if (window.cursorSync) {
        console.log('🧹 页面卸载，自动清理连接...');
        window.cursorSync.stop();
    }
});

