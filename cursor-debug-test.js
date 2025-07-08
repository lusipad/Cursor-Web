// 🚀 Cursor HTTP 同步脚本 - 专为 Cursor 环境设计
console.log('🚀 Claude Web HTTP 同步脚本开始加载...');

class CursorHttpSync {
    constructor() {
        this.serverUrl = 'http://localhost:3000';
        this.lastContent = '';
        this.chatContainer = null;
        this.syncInterval = null;
        this.isRunning = false;
        this.retryCount = 0;
        this.maxRetries = 3;

        this.init();
    }

    async init() {
        console.log('🔧 初始化 HTTP 同步系统...');

        // 测试服务器连接
        try {
            await this.testConnection();
            this.showNotification('✅ 服务器连接成功', '#4CAF50');
        } catch (error) {
            this.showNotification('❌ 服务器连接失败', '#FF5722');
            console.error('服务器连接失败：', error);
            return;
        }

        // 查找聊天容器
        await this.findChatContainer();

        // 开始同步
        this.startSync();
    }

    async testConnection() {
        const response = await fetch(`${this.serverUrl}/api/test`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        console.log('✅ 服务器测试响应：', data);
        return data;
    }

    async findChatContainer() {
        console.log('🔍 查找聊天容器...');

        // 简化的容器查找策略
        const selectors = [
            '[data-testid*="chat"]',
            '[data-testid*="conversation"]',
            '[data-testid*="messages"]',
            '.chat-container',
            '.messages-container',
            '.conversation-container',
            'div[class*="chat"]',
            'div[class*="conversation"]',
            'div[class*="message"]',
            '[role="main"]',
            'main'
        ];

        let bestContainer = null;
        let bestScore = 0;

        for (const selector of selectors) {
            try {
                const elements = document.querySelectorAll(selector);
                for (const element of elements) {
                    const score = this.evaluateContainer(element);
                    if (score > bestScore) {
                        bestScore = score;
                        bestContainer = element;
                    }
                }
            } catch (error) {
                console.warn(`选择器错误 ${selector}:`, error);
            }
        }

        if (bestContainer) {
            this.chatContainer = bestContainer;
            console.log('✅ 找到聊天容器：', {
                selector: bestContainer.tagName + '.' + bestContainer.className,
                score: bestScore,
                children: bestContainer.children.length,
                textLength: bestContainer.textContent.length
            });
            this.showNotification('✅ 找到聊天区域', '#4CAF50');
        } else {
            console.log('⚠️ 未找到理想容器，使用 document.body');
            this.chatContainer = document.body;
            this.showNotification('⚠️ 使用整个页面作为同步区域', '#FF9800');
        }
    }

    evaluateContainer(element) {
        let score = 0;

        try {
            const rect = element.getBoundingClientRect();
            const children = element.children.length;
            const textLength = element.textContent.length;
            const className = element.className.toLowerCase();

            // 基础得分
            if (children >= 3) score += 20;
            if (textLength >= 100) score += 20;
            if (rect.width > 300) score += 10;
            if (rect.height > 200) score += 10;

            // 位置得分
            if (rect.right > window.innerWidth * 0.5) score += 15;

            // 关键词得分
            const keywords = ['chat', 'conversation', 'message', 'assistant'];
            keywords.forEach(keyword => {
                if (className.includes(keyword)) score += 15;
            });

            return score;
        } catch (error) {
            return 0;
        }
    }

    getChatContent() {
        if (!this.chatContainer) return null;

        try {
            // 克隆容器以避免修改原始 DOM
            const clone = this.chatContainer.cloneNode(true);

            // 清理不需要的元素
            const removeSelectors = [
                'script', 'style', 'noscript',
                'button', 'input', 'textarea',
                '.toolbar', '.menu', '.popup',
                '[class*="toolbar"]', '[class*="menu"]'
            ];

            removeSelectors.forEach(selector => {
                try {
                    clone.querySelectorAll(selector).forEach(el => el.remove());
                } catch (e) {
                    // 忽略选择器错误
                }
            });

            // 清理属性
            clone.querySelectorAll('*').forEach(el => {
                try {
                    const attrs = [...el.attributes];
                    attrs.forEach(attr => {
                        if (attr.name.startsWith('on') ||
                            attr.name.startsWith('data-') ||
                            attr.name === 'style') {
                            el.removeAttribute(attr.name);
                        }
                    });
                } catch (e) {
                    // 忽略属性清理错误
                }
            });

            return {
                html: clone.innerHTML,
                timestamp: Date.now(),
                url: window.location.href,
                title: document.title
            };

        } catch (error) {
            console.error('获取内容失败：', error);
            return null;
        }
    }

    async sendContent(content) {
        try {
            const response = await fetch(`${this.serverUrl}/api/content`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    type: 'html_content',
                    data: content
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();
            if (result.success) {
                console.log(`📤 内容发送成功：${result.contentLength} 字符`);
                this.retryCount = 0; // 重置重试计数
                return true;
            } else {
                throw new Error(result.message);
            }

        } catch (error) {
            console.error('发送内容失败：', error);
            this.retryCount++;

            if (this.retryCount <= this.maxRetries) {
                this.showNotification(`⚠️ 发送失败，重试中... (${this.retryCount}/${this.maxRetries})`, '#FF9800');
            } else {
                this.showNotification('❌ 发送失败，已达到最大重试次数', '#FF5722');
            }
            return false;
        }
    }

    async checkForChanges() {
        const content = this.getChatContent();

        if (content && content.html !== this.lastContent) {
            console.log('🔄 检测到内容变化，同步中...');

            const success = await this.sendContent(content);
            if (success) {
                this.lastContent = content.html;
                this.showNotification('🔄 内容已同步', '#2196F3');
            }
        }
    }

    startSync() {
        if (this.isRunning) return;

        this.isRunning = true;
        console.log('🚀 开始定时同步...');

        // 发送初始内容
        this.checkForChanges();

        // 每4秒检查一次
        this.syncInterval = setInterval(() => {
            this.checkForChanges();
        }, 4000);

        // 添加 DOM 监听器（如果可能）
        if (this.chatContainer) {
            try {
                const observer = new MutationObserver(() => {
                    // 延迟检查，避免频繁触发
                    setTimeout(() => {
                        this.checkForChanges();
                    }, 1000);
                });

                observer.observe(this.chatContainer, {
                    childList: true,
                    subtree: true,
                    characterData: true
                });

                console.log('👀 DOM 监听器已启动');
            } catch (error) {
                console.warn('DOM 监听器启动失败：', error);
            }
        }

        this.showNotification('🚀 HTTP 同步已启动！\n每 4-5 秒自动同步', '#4CAF50');
    }

    stop() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        this.isRunning = false;
        console.log('🛑 同步已停止');
        this.showNotification('🛑 同步已停止', '#FF9800');
    }

    showNotification(message, color = '#2196F3') {
        // 移除旧通知
        const oldNotification = document.getElementById('cursor-http-notification');
        if (oldNotification) {
            oldNotification.remove();
        }

        const notification = document.createElement('div');
        notification.id = 'cursor-http-notification';
        notification.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 99999;
            background: ${color}; color: white; padding: 12px 16px;
            border-radius: 8px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 14px; font-weight: 500; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            max-width: 300px; white-space: pre-line; word-wrap: break-word;
            border: 1px solid rgba(255,255,255,0.1);
        `;
        notification.textContent = message;

        try {
            document.body.appendChild(notification);

            // 5 秒后自动移除
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.style.opacity = '0';
                    notification.style.transform = 'translateX(100%)';
                    notification.style.transition = 'all 0.3s ease';
                    setTimeout(() => notification.remove(), 300);
                }
            }, 5000);
        } catch (error) {
            console.error('通知显示失败：', error);
        }
    }
}

// 防止重复初始化
if (window.CursorHttpSync) {
    console.log('❌ HTTP 同步脚本已经运行中');
    alert('🔄 Cursor HTTP 同步脚本已运行！\n\n✅ 使用纯 HTTP 通信，无 WebSocket 依赖\n🔄 每 4 秒自动检查内容变化');
} else {
    // 延迟初始化，确保页面加载完成
    setTimeout(() => {
        console.log('🚀 启动 Cursor HTTP 同步...');
        window.CursorHttpSync = new CursorHttpSync();

        // 显示启动完成提示
        setTimeout(() => {
            alert('🔄 Cursor HTTP 同步脚本已启动！\n\n✅ 使用纯 HTTP 通信，无 WebSocket 依赖\n🔄 每 4 秒自动检查内容变化');
        }, 2000);
    }, 1000);
}
    const elements = document.querySelectorAll(`[class*="${keyword}"], [id*="${keyword}"]`);
    if (elements.length > 0) {
        foundChatElements[keyword] = elements.length;
    }
});
console.log('  - 聊天相关元素：', foundChatElements);

// 启动 HTTP 同步
console.log('\n🚀 启动 HTTP 同步系统...');
window.CursorHTTPSync = new CursorHTTPSync();

// 提供控制命令
console.log('\n💡 控制命令：');
console.log('  - 停止同步：window.CursorHTTPSync.stopSync()');
console.log('  - 重新开始：window.CursorHTTPSync.startSync()');
console.log('  - 手动发送：window.CursorHTTPSync.sendContent(window.CursorHTTPSync.getChatContent())');

alert('🚀 HTTP 同步脚本已启动！\n\n由于 Cursor 不支持 WebSocket，使用 HTTP 轮询方式\n每 5 秒自动检查内容变化\n\n请查看 Console 了解详细信息');
