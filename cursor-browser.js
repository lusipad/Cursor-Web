// 🚀 Cursor 浏览器同步脚本
// 专用于 Cursor 开发者控制台，100% 浏览器兼容

console.log('🚀 Cursor 同步脚本启动...');

class CursorSync {
    constructor() {
        this.serverUrl = 'http://localhost:3000';
        this.lastContent = '';
        this.chatContainer = null;
        this.syncInterval = null;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.ws = null;
        this.wsRetryCount = 0;
        this.wsMaxRetries = 5;

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

        // Cursor 聊天区域选择器
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
            'main'
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

        if (bestElement && bestScore > 15) {
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
            if (text.length >= 100) score += 15;
            if (rect.width > 300 && rect.height > 200) score += 10;

            // 位置得分 - Cursor 聊天通常在右侧
            if (rect.left > window.innerWidth * 0.4) score += 15;

            // 关键词得分
            const keywords = ['chat', 'conversation', 'message', 'assistant'];
            for (const keyword of keywords) {
                if (className.includes(keyword)) score += 20;
            }

            // AI 相关内容
            if (text.includes('Claude') || text.includes('AI')) score += 15;

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
            const removeSelectors = ['script', 'style', '.copy-button'];
            for (const selector of removeSelectors) {
                const elements = clone.querySelectorAll(selector);
                for (const el of elements) el.remove();
            }

            const htmlContent = clone.innerHTML;

            if (htmlContent.length < 50) {
                console.warn('⚠️ 内容太短，可能聊天区域为空');
                return null;
            }

            return {
                html: htmlContent,
                timestamp: Date.now(),
                url: window.location.href,
                contentLength: htmlContent.length
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
        console.log('🚀 开始定时同步 (每 5 秒)...');

        // 立即执行一次
        this.checkAndSync();

        // 设置定时器
        this.syncInterval = setInterval(() => {
            this.checkAndSync();
        }, 5000);
    }

    // WebSocket 连接功能
    connectWebSocket() {
        try {
            const wsUrl = this.serverUrl.replace('http', 'ws');
            console.log('🔌 连接 WebSocket：', wsUrl);

            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('✅ WebSocket 连接成功');
                this.wsRetryCount = 0;
                this.showNotification('📡 已连接到消息服务', '#4CAF50', 2000);
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleWebSocketMessage(message);
                } catch (error) {
                    console.error('❌ 解析 WebSocket 消息失败：', error);
                }
            };

            this.ws.onclose = () => {
                console.log('📱 WebSocket 连接关闭');
                this.ws = null;
                this.attemptWebSocketReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('❌ WebSocket 错误：', error);
            };

        } catch (error) {
            console.error('❌ WebSocket 连接失败：', error);
            this.attemptWebSocketReconnect();
        }
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

    // WebSocket 重连
    attemptWebSocketReconnect() {
        if (this.wsRetryCount < this.wsMaxRetries) {
            this.wsRetryCount++;
            console.log(`🔄 WebSocket 重连中 (${this.wsRetryCount}/${this.wsMaxRetries})...`);

            setTimeout(() => {
                this.connectWebSocket();
            }, 3000 * this.wsRetryCount); // 递增延迟
        } else {
            console.log('❌ WebSocket 重连失败，已达到最大尝试次数');
            this.showNotification('❌ 消息服务连接失败', '#FF5722');
        }
    }

    stop() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log('🛑 同步已停止');
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
            console.log('🛑 WebSocket 连接已关闭');
        }

        this.showNotification('🛑 同步已停止', '#FF9800');
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
window.cursorSync = new CursorSync();

// 全局控制函数
window.stopCursorSync = () => {
    if (window.cursorSync) {
        window.cursorSync.stop();
    }
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
    console.log('  - WebSocket 状态：', sync.ws ? sync.ws.readyState : '未连接');
    console.log('  - WebSocket 重试次数：', sync.wsRetryCount);

    // WebSocket 状态说明
    if (sync.ws) {
        const states = ['连接中', '已连接', '关闭中', '已关闭'];
        console.log('  - WebSocket 状态说明：', states[sync.ws.readyState] || '未知');
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
        console.log(`    可见: ${cursorInput.offsetParent !== null}, 高度: ${cursorInput.offsetHeight}px`);
        console.log(`    类名: "${cursorInput.className}"`);
        console.log(`    ID: "${cursorInput.id}"`);
    }

    // 测试 Cursor 发送按钮
    const cursorSendBtn = document.querySelector('.anysphere-icon-button .codicon-arrow-up-two')?.parentElement;
    console.log(`  - Cursor 发送按钮: ${cursorSendBtn ? '✅ 找到' : '❌ 未找到'}`);
    if (cursorSendBtn) {
        console.log(`    可见: ${cursorSendBtn.offsetParent !== null}, 启用: ${!cursorSendBtn.disabled}`);
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

console.log('✨ Cursor 同步脚本加载完成！');
console.log('💡 使用说明：');
console.log('  - 脚本会自动开始双向同步');
console.log('  - HTTP 同步：Cursor → Web (每 5 秒检查)');
console.log('  - WebSocket：Web → Cursor (实时接收)');
console.log('  - stopCursorSync() - 停止同步');
console.log('  - debugCursorSync() - 查看调试信息');
console.log('  - testCursorMessageSending("消息") - 手动测试发送');
console.log('  - 确保服务器在 localhost:3000 运行');
console.log('🎯 现在可以从 Web 界面发送消息到 Cursor 了！');

