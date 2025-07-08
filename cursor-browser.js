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
        console.log('🚀 开始定时同步 (每5秒)...');

        // 立即执行一次
        this.checkAndSync();

        // 设置定时器
        this.syncInterval = setInterval(() => {
            this.checkAndSync();
        }, 5000);
    }

    stop() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log('🛑 同步已停止');
            this.showNotification('🛑 同步已停止', '#FF9800');
        }
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
    console.log('  - 重试次数：', sync.retryCount);
    console.log('  - 同步状态：', sync.syncInterval ? '运行中' : '已停止');

    // 测试内容获取
    const content = sync.getContent();
    if (content) {
        console.log('✅ 当前内容：', content.contentLength, '字符');
    } else {
        console.log('❌ 内容获取失败');
    }
};

console.log('✨ Cursor 同步脚本加载完成！');
console.log('💡 使用说明：');
console.log('  - 脚本会自动开始同步');
console.log('  - stopCursorSync() - 停止同步');
console.log('  - debugCursorSync() - 查看调试信息');
console.log('  - 确保服务器在 localhost:3000 运行');
