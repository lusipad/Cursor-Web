// Cursor 纯 HTTP 同步脚本 - 完全避免 WebSocket 引用
console.log('🚀 Claude Web HTTP 同步脚本启动...');

// 安全的环境检查 - 不直接引用 WebSocket
console.log('📋 环境检查：');
console.log('  - URL:', window.location.href);
console.log('  - Fetch 支持：', typeof fetch !== 'undefined');

// 检查是否在 Cursor 环境中
const isElectronApp = navigator.userAgent.includes('Electron');
console.log('  - 检测到的环境：', isElectronApp ? 'Electron应用(Cursor)' : '浏览器');

if (isElectronApp) {
    console.log('⚠️ 检测到 Electron 环境，使用 HTTP 轮询方式');
}

class CursorPureHTTPSync {
    constructor() {
        this.lastContent = '';
        this.chatContainer = null;
        this.syncInterval = null;
        this.serverUrl = 'http://localhost:3000';
        this.isRunning = false;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.init();
    }

    init() {
        console.log('🔧 初始化纯 HTTP 同步系统...');
        this.showNotification('🔍 正在查找聊天内容...', '#2196F3');

        // 延迟启动，确保页面加载完成
        setTimeout(() => {
            this.testServerConnection().then(connected => {
                if (connected) {
                    this.findChatContainer();
                    this.startSync();
                } else {
                    this.showNotification('❌ 无法连接到服务器', '#FF5722');
                    console.log('❌ 请确保服务器正在运行：node app.js');
                }
            });
        }, 1000);
    }

    async testServerConnection() {
        console.log('🔌 测试服务器连接...');

        const urls = [
            'http://localhost:3000/api/test',
            'http://127.0.0.1:3000/api/test'
        ];

        for (const url of urls) {
            try {
                console.log(`🔄 尝试连接：${url}`);

                const response = await fetch(url, {
                    method: 'GET',
                    mode: 'cors',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok) {
                    const result = await response.json();
                    console.log('✅ 服务器连接成功：', result.message);

                    // 更新服务器 URL
                    this.serverUrl = url.replace('/api/test', '');
                    return true;
                } else if (response.status === 404) {
                    // 404 表示服务器在运行，只是这个特定端点不存在
                    console.log('✅ 服务器运行中 (404 是正常的)');
                    this.serverUrl = url.replace('/api/test', '');
                    return true;
                } else {
                    console.log(`❌ 连接失败：HTTP ${response.status}`);
                }
            } catch (error) {
                console.log(`❌ 连接错误：${error.message}`);
            }
        }

        return false;
    }

    findChatContainer() {
        console.log('🔍 查找 Cursor 聊天容器...');

        // Cursor 和通用聊天应用的选择器
        const selectors = [
            // 通用聊天容器
            '[class*="chat"]',
            '[class*="conversation"]',
            '[class*="message"]',
            '[class*="assistant"]',
            '[class*="ai"]',
            '[class*="claude"]',
            // AI 助手界面常见元素
            'main',
            '[role="main"]',
            '.main-content',
            '.content-area',
            // 面板和容器
            '.panel',
            '.container',
            '.wrapper',
            // 右侧面板（AI 聊天常见位置）
            '.right-panel',
            '.side-panel',
            '.secondary-content'
        ];

        let foundContainer = null;
        let foundMethod = '';
        let bestScore = 0;

        // 方法 1: 选择器精确匹配
        for (const selector of selectors) {
            try {
                const elements = document.querySelectorAll(selector);
                for (const element of elements) {
                    const score = this.scoreContainer(element);
                    if (score > bestScore && this.isValidContainer(element)) {
                        foundContainer = element;
                        foundMethod = `选择器匹配：${selector}`;
                        bestScore = score;
                    }
                }
            } catch (error) {
                console.log(`选择器错误 ${selector}:`, error.message);
            }
        }

        // 方法 2: 启发式查找（如果没有找到好的匹配）
        if (!foundContainer || bestScore < 30) {
            console.log('🔍 执行启发式容器查找...');

            const allContainers = document.querySelectorAll('div, section, main, article');

            for (const container of allContainers) {
                const score = this.scoreContainer(container);
                if (score > bestScore && score > 15) {
                    foundContainer = container;
                    foundMethod = `启发式查找：得分${score}`;
                    bestScore = score;
                }
            }
        }

        // 设置最终容器
        this.chatContainer = foundContainer || document.body;

        console.log('📦 选择的容器：', {
            method: foundMethod || '默认整个页面',
            tagName: this.chatContainer.tagName,
            className: this.chatContainer.className,
            id: this.chatContainer.id,
            children: this.chatContainer.children.length,
            textLength: this.chatContainer.textContent.length,
            score: bestScore
        });

        this.showNotification(`✅ 找到聊天区域\n${foundMethod || '使用整个页面'}`, '#4CAF50');
    }

    isValidContainer(element) {
        if (!element || !element.getBoundingClientRect) return false;

        try {
            const rect = element.getBoundingClientRect();
            const childCount = element.children.length;
            const textLength = element.textContent.trim().length;

            // 基本有效性检查
            return childCount >= 1 &&
                   textLength >= 5 &&
                   rect.width > 30 &&
                   rect.height > 30 &&
                   rect.top >= 0 && // 确保元素可见
                   rect.left >= 0;
        } catch (error) {
            return false;
        }
    }

    scoreContainer(element) {
        let score = 0;

        try {
            const rect = element.getBoundingClientRect();
            const className = (element.className || '').toLowerCase();
            const id = (element.id || '').toLowerCase();
            const textContent = element.textContent || '';

            // 基础分数
            if (element.children.length >= 2) score += 10;
            if (element.children.length >= 5) score += 5;
            if (textContent.length >= 50) score += 10;
            if (textContent.length >= 200) score += 10;

            // 尺寸分数
            if (rect.width > 200) score += 5;
            if (rect.width > 400) score += 5;
            if (rect.height > 200) score += 5;
            if (rect.height > 400) score += 5;

            // 位置分数 - 右侧或中心区域
            const centerX = window.innerWidth / 2;
            const rightArea = window.innerWidth * 0.6;
            if (rect.left > centerX) score += 8;
            if (rect.left > rightArea) score += 5;

            // 关键词匹配
            const chatKeywords = ['chat', 'conversation', 'message', 'assistant', 'ai', 'claude', 'dialog'];
            chatKeywords.forEach(keyword => {
                if (className.includes(keyword)) score += 20;
                if (id.includes(keyword)) score += 20;
            });

            // 内容特征分析
            if (textContent.includes('AI') || textContent.includes('助手') || textContent.includes('Claude')) score += 10;
            if (textContent.includes('用户') || textContent.includes('User')) score += 5;

            // 惩罚项
            if (className.includes('menu') || className.includes('toolbar') || className.includes('header')) score -= 15;
            if (className.includes('footer') || className.includes('sidebar') && rect.width < 200) score -= 10;
            if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE') score -= 100;

        } catch (error) {
            return 0;
        }

        return Math.max(0, score);
    }

    getChatContent() {
        if (!this.chatContainer) return null;

        try {
            // 克隆容器
            const clone = this.chatContainer.cloneNode(true);

            // 移除干扰元素
            const removeSelectors = [
                'script', 'style', 'link[rel="stylesheet"]',
                'noscript', 'template', 'meta'
            ];

            removeSelectors.forEach(selector => {
                try {
                    clone.querySelectorAll(selector).forEach(el => el.remove());
                } catch (e) {
                    // 忽略移除错误
                }
            });

            // 清理属性
            try {
                clone.querySelectorAll('*').forEach(el => {
                    // 移除事件处理器和敏感属性
                    const attrsToRemove = ['onclick', 'onmouseover', 'onload', 'onerror', 'style'];
                    attrsToRemove.forEach(attr => {
                        if (el.hasAttribute && el.hasAttribute(attr)) {
                            el.removeAttribute(attr);
                        }
                    });
                });
            } catch (e) {
                // 忽略属性清理错误
            }

            return {
                html: clone.innerHTML,
                timestamp: Date.now(),
                url: window.location.href,
                title: document.title,
                method: 'pure-http',
                containerInfo: {
                    tagName: this.chatContainer.tagName,
                    className: this.chatContainer.className,
                    id: this.chatContainer.id
                }
            };
        } catch (error) {
            console.log('❌ 获取内容失败：', error);
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
                }),
                mode: 'cors'
            });

            if (response.ok) {
                const result = await response.json();
                console.log(`📤 内容发送成功：${content.html.length} 字符`);
                this.retryCount = 0; // 重置重试计数
                return true;
            } else {
                console.log(`❌ 发送失败：HTTP ${response.status}`);
                return false;
            }
        } catch (error) {
            console.log(`❌ 发送错误：${error.message}`);
            return false;
        }
    }

    startSync() {
        if (this.isRunning) {
            console.log('⚠️ 同步已在运行中');
            return;
        }

        this.isRunning = true;
        console.log('🚀 启动 HTTP 同步系统...');
        this.showNotification('✅ HTTP 同步已启动！', '#4CAF50');

        // 发送初始内容
        this.sendInitialContent();

        // 开始定时同步
        this.syncInterval = setInterval(() => {
            this.checkAndSyncContent();
        }, 4000); // 每 4 秒检查一次

        console.log('👀 定时同步已启动 (每 4 秒检查一次)');
    }

    async sendInitialContent() {
        const content = this.getChatContent();
        if (content) {
            const success = await this.sendContent(content);
            if (success) {
                this.lastContent = content.html;
                console.log('📋 初始内容已发送');
            }
        }
    }

    async checkAndSyncContent() {
        if (!this.isRunning) return;

        const content = this.getChatContent();
        if (content && content.html !== this.lastContent) {
            console.log('🔄 检测到内容变化，准备同步...');

            const success = await this.sendContent(content);
            if (success) {
                this.lastContent = content.html;
                console.log('✅ 内容更新同步完成');
            } else {
                this.retryCount++;
                if (this.retryCount >= this.maxRetries) {
                    console.log('❌ 多次发送失败，请检查服务器状态');
                    this.showNotification('❌ 连接失败，请检查服务器', '#FF5722');
                }
            }
        }
    }

    stopSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        this.isRunning = false;
        console.log('🛑 HTTP 同步已停止');
        this.showNotification('🛑 同步已停止', '#FF9800');
    }

    showNotification(message, color = '#2196F3') {
        // 移除旧通知
        const oldNotification = document.getElementById('cursor-pure-http-notification');
        if (oldNotification) {
            oldNotification.remove();
        }

        const notification = document.createElement('div');
        notification.id = 'cursor-pure-http-notification';
        notification.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 99999;
            background: ${color}; color: white; padding: 12px 16px;
            border-radius: 6px; font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 14px; font-weight: 500; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            max-width: 320px; word-wrap: break-word; line-height: 1.4;
            border-left: 4px solid rgba(255,255,255,0.3);
        `;
        notification.textContent = message;

        try {
            document.body.appendChild(notification);

            // 自动移除
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 4000);
        } catch (error) {
            console.log('通知显示失败：', error);
        }
    }
}

// 页面分析和诊断
console.log('📊 页面环境分析：');
console.log('  - 总元素数：', document.querySelectorAll('*').length);
console.log('  - Div 数量：', document.querySelectorAll('div').length);
console.log('  - 页面标题：', document.title);

// 分析可能的聊天元素
const chatKeywords = ['chat', 'conversation', 'message', 'assistant', 'ai', 'claude'];
const foundElements = {};

chatKeywords.forEach(keyword => {
    const byClass = document.querySelectorAll(`[class*="${keyword}"]`);
    const byId = document.querySelectorAll(`[id*="${keyword}"]`);
    const total = byClass.length + byId.length;

    if (total > 0) {
        foundElements[keyword] = total;
    }
});

console.log('  - 聊天相关元素统计：', foundElements);

// 启动同步系统
console.log('\n🚀 启动 Cursor 纯 HTTP 同步系统...');

// 防止重复初始化
if (window.CursorPureHTTPSync) {
    console.log('⚠️ 检测到已有同步实例，先停止旧实例...');
    window.CursorPureHTTPSync.stopSync();
}

window.CursorPureHTTPSync = new CursorPureHTTPSync();

// 提供控制接口
console.log('\n💡 可用的控制命令：');
console.log('  停止同步：window.CursorPureHTTPSync.stopSync()');
console.log('  重新开始：window.CursorPureHTTPSync.startSync()');
console.log('  手动发送：window.CursorPureHTTPSync.sendInitialContent()');
console.log('  查看容器：console.log(window.CursorPureHTTPSync.chatContainer)');

// 显示启动完成提示
alert('🚀 Cursor HTTP 同步脚本已启动！\n\n✅ 使用纯 HTTP 通信，无 WebSocket 依赖\n🔄 每 4 秒自动检查内容变化\n📱 支持 Cursor 等 Electron 应用\n\n请查看 Console 了解详细运行状态\n右上角会显示同步状态通知');
