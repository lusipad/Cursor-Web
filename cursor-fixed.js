// 🚀 Cursor 超安全版同步脚本 - 完全避免 TrustedHTML 问题
console.log('🚀 Cursor 超安全版同步脚本开始运行...');

class UltraSafeCursorSync {
    constructor() {
        this.serverUrl = 'http://localhost:3000';
        this.lastContent = '';
        this.syncInterval = null;

        console.log('🔧 初始化超安全版同步系统...');
        this.init();
    }

    async init() {
        try {
            // 测试服务器连接
            await this.testServer();
            console.log('✅ 服务器连接测试成功');

            // 立即发送一次当前内容
            await this.checkAndSync();

            // 开始定时同步
            this.startSync();

            this.showMessage('✅ 超安全版同步已启动', '#4CAF50');
            console.log('🎉 超安全版同步系统初始化完成');
        } catch (error) {
            console.error('❌ 初始化失败：', error);
            this.showMessage('❌ 初始化失败：' + error.message, '#FF5722');
        }
    }

    async testServer() {
        try {
            const response = await fetch(this.serverUrl + '/api/test');
            if (!response.ok) {
                throw new Error(`服务器响应错误：${response.status}`);
            }
            const result = await response.json();
            console.log('🧪 服务器测试结果：', result);
            return result;
        } catch (error) {
            throw new Error(`服务器连接失败：${error.message}`);
        }
    }

    // 超安全的内容抓取方法 - 只使用 textContent
    getContent() {
        try {
            console.log('🔍 开始超安全抓取页面内容...');

            let content = '';

            // 查找聊天容器
            const chatContainers = this.findChatContainers();

            if (chatContainers.length > 0) {
                console.log(`🎯 找到 ${chatContainers.length} 个聊天容器`);

                content += '=== Cursor 聊天内容 ===\n\n';

                chatContainers.forEach((container, index) => {
                    try {
                        const text = container.textContent || '';
                        if (text.trim().length > 0) {
                            content += `--- 聊天区域 ${index + 1} ---\n`;
                            content += text.trim() + '\n\n';
                            console.log(`✅ 聊天容器 ${index + 1} 抓取成功，文本长度：${text.length}`);
                        }
                    } catch (error) {
                        console.warn(`⚠️ 聊天容器 ${index} 抓取失败:`, error);
                    }
                });
            } else {
                console.warn('⚠️ 未找到聊天容器，抓取整个页面文本');
                content = document.body.textContent || '';
            }

            if (!content || content.length < 10) {
                console.warn('⚠️ 获取的内容太短:', content.length);
                return null;
            }

            // 直接返回纯文本，不转换为HTML
            const result = {
                html: this.createSafeHtml(content),
                timestamp: Date.now(),
                url: window.location.href,
                containerInfo: {
                    chatContainersFound: chatContainers.length,
                    contentLength: content.length
                }
            };

            console.log('📋 超安全抓取内容成功:', result.html.length, '字符');
            console.log('🎯 聊天容器数量:', chatContainers.length);
            return result;

        } catch (error) {
            console.error('❌ 超安全抓取内容失败:', error);
            return null;
        }
    }

    // 创建安全HTML - 完全不使用innerHTML
    createSafeHtml(text) {
        // 手动转义特殊字符
        const escaped = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/\n/g, '<br>');

        // 手动构建 HTML 字符串
        const html = `<div style="font-family: monospace; white-space: pre-wrap; padding: 20px; background: #1a1a1a; color: #ffffff;">
            <h2 style="color: #00ff00; margin-bottom: 20px;">🚀 Cursor 同步内容</h2>
            <div style="border: 1px solid #333; padding: 15px; border-radius: 5px; background: #2d2d2d;">
                ${escaped}
            </div>
            <p style="color: #888; margin-top: 15px; font-size: 12px;">
                同步时间：${new Date().toLocaleString()}
            </p>
        </div>`;

        return html;
    }

    // 查找聊天容器
    findChatContainers() {
        console.log('🔍 开始查找 Cursor 聊天容器...');
        const containers = [];

        // 策略 1: 精准定位 Cursor 聊天区域
        const selectors = [
            '.composer-bar',
            '.conversations',
            '.composer-bar .conversations',
            '[data-message-index]',
            '[id^="bubble-"]',
            '.anysphere-markdown-container-root'
        ];

        selectors.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(el => {
                    if (!containers.includes(el) && this.isValidContainer(el)) {
                        containers.push(el);
                        console.log(`🎯 找到聊天容器：${selector}`);
                    }
                });
            } catch (error) {
                console.warn(`选择器错误：${selector}`, error);
            }
        });

        // 策略 2: 查找包含聊天关键词的容器
        if (containers.length === 0) {
            console.log('🔍 使用关键词策略...');
            const allDivs = document.querySelectorAll('div');
            allDivs.forEach(div => {
                const text = div.textContent || '';
                const rect = div.getBoundingClientRect();

                if (rect.width > 300 && rect.height > 200 &&
                    (text.includes('Claude') || text.includes('你好') ||
                     text.includes('测试') || text.includes('hello'))) {

                    if (!containers.includes(div)) {
                        containers.push(div);
                        console.log('🎯 通过关键词找到容器');
                    }
                }
            });
        }

        console.log(`📊 总共找到 ${containers.length} 个聊天容器`);
        return containers;
    }

    // 验证容器
    isValidContainer(element) {
        const rect = element.getBoundingClientRect();
        const text = element.textContent || '';

        return rect.width > 100 && rect.height > 50 && text.length > 10;
    }

    async sendToServer(content) {
        try {
            console.log('📤 准备发送内容到服务器...', content.html.length, '字符');

            const response = await fetch(this.serverUrl + '/api/content', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type: 'html_content',
                    data: content
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP 错误：${response.status}`);
            }

            const result = await response.json();
            console.log('✅ 发送成功：', result);
            return true;

        } catch (error) {
            console.error('❌ 发送失败：', error);
            this.showMessage('❌ 发送失败：' + error.message, '#FF5722');
            return false;
        }
    }

    async checkAndSync() {
        console.log('🔄 检查内容变化...');

        const content = this.getContent();
        if (!content) {
            console.log('⚠️ 未获取到有效内容');
            return;
        }

        if (content.html !== this.lastContent) {
            console.log('📝 检测到内容变化，开始同步...');
            console.log('旧内容长度：', this.lastContent.length);
            console.log('新内容长度：', content.html.length);

            const success = await this.sendToServer(content);
            if (success) {
                this.lastContent = content.html;
                this.showMessage('🔄 内容已同步', '#2196F3');
                console.log('✅ 同步完成');
            }
        } else {
            console.log('📭 内容无变化');
        }
    }

    startSync() {
        console.log('🚀 开始定时同步...');

        // 每 3 秒检查一次
        this.syncInterval = setInterval(() => {
            this.checkAndSync();
        }, 3000);

        console.log('⏰ 定时器已设置（3 秒间隔）');
    }

    stop() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log('🛑 同步已停止');
            this.showMessage('🛑 同步已停止', '#FF9800');
        }
    }

    showMessage(text, color = '#4CAF50') {
        // 移除旧消息
        const oldMsg = document.getElementById('cursor-sync-msg');
        if (oldMsg) oldMsg.remove();

        // 创建新消息 - 完全用 DOM 操作，不用 innerHTML
        const msg = document.createElement('div');
        msg.id = 'cursor-sync-msg';
        msg.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 99999;
            background: ${color};
            color: white;
            padding: 12px 16px;
            border-radius: 6px;
            font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;

        // 使用 textContent 而不是 innerHTML
        msg.textContent = text;

        document.body.appendChild(msg);
        setTimeout(() => {
            if (msg.parentNode) {
                msg.remove();
            }
        }, 4000);
    }

    async manualSync() {
        console.log('🖱️ 手动触发同步');
        await this.checkAndSync();
    }
}

// 检查是否已经运行
if (window.ultraSafeCursorSync) {
    console.log('⚠️ 超安全版脚本已在运行');
    alert('超安全版脚本已在运行中！');
} else {
    // 启动脚本
    console.log('🚀 启动超安全版同步脚本...');
    window.ultraSafeCursorSync = new UltraSafeCursorSync();

    // 提供手动同步方法
    window.manualSync = () => {
        if (window.ultraSafeCursorSync) {
            window.ultraSafeCursorSync.manualSync();
        }
    };

    // 提供停止方法
    window.stopSync = () => {
        if (window.ultraSafeCursorSync) {
            window.ultraSafeCursorSync.stop();
            window.ultraSafeCursorSync = null;
        }
    };
}

console.log('✅ 超安全版同步脚本加载完成');
console.log('💡 使用方法：');
console.log('  - 手动同步：window.manualSync()');
console.log('  - 停止同步：window.stopSync()');
        const allElements = document.querySelectorAll('*');
        const overlays = [];

        allElements.forEach(el => {
            const style = window.getComputedStyle(el);
            const zIndex = parseInt(style.zIndex);

            if (zIndex > 1000 && el.offsetWidth > 200 && el.offsetHeight > 100) {
                const rect = el.getBoundingClientRect();
                if (rect.top >= 0 && rect.left >= 0) { // 可见元素
                    overlays.push(el);
                }
            }
        });

        console.log(`📊 找到 ${overlays.length} 个悬浮层元素`);
        return overlays;
    }

    async sendToServer(content) {
        try {
            console.log('📤 准备发送内容到服务器...', content.html.length, '字符');

            const response = await fetch(this.serverUrl + '/api/content', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type: 'html_content',
                    data: content
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP 错误：${response.status}`);
            }

            const result = await response.json();
            console.log('✅ 发送成功：', result);
            return true;

        } catch (error) {
            console.error('❌ 发送失败：', error);
            this.showMessage('❌ 发送失败：' + error.message, '#FF5722');
            return false;
        }
    }

    async checkAndSync() {
        console.log('🔄 检查内容变化...');

        const content = this.getContent();
        if (!content) {
            console.log('⚠️ 未获取到有效内容');
            return;
        }

        if (content.html !== this.lastContent) {
            console.log('📝 检测到内容变化，开始同步...');
            console.log('旧内容长度：', this.lastContent.length);
            console.log('新内容长度：', content.html.length);

            const success = await this.sendToServer(content);
            if (success) {
                this.lastContent = content.html;
                this.showMessage('🔄 内容已同步', '#2196F3');
                console.log('✅ 同步完成');
            }
        } else {
            console.log('📭 内容无变化');
        }
    }

    startSync() {
        console.log('🚀 开始定时同步...');

        // 每 3 秒检查一次
        this.syncInterval = setInterval(() => {
            this.checkAndSync();
        }, 3000);

        console.log('⏰ 定时器已设置（3 秒间隔）');
    }

    stop() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log('🛑 同步已停止');
            this.showMessage('🛑 同步已停止', '#FF9800');
        }
    }

    showMessage(text, color = '#4CAF50') {
        // 移除旧消息
        const oldMsg = document.getElementById('cursor-sync-msg');
        if (oldMsg) oldMsg.remove();

        // 创建新消息
        const msg = document.createElement('div');
        msg.id = 'cursor-sync-msg';
        msg.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 99999;
            background: ${color};
            color: white;
            padding: 12px 16px;
            border-radius: 6px;
            font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        msg.textContent = text;

        document.body.appendChild(msg);
        setTimeout(() => {
            if (msg.parentNode) {
                msg.remove();
            }
        }, 4000);
    }

    // 手动触发同步
    async manualSync() {
        console.log('🖱️ 手动触发同步');
        await this.checkAndSync();
    }
}

// 检查是否已经运行
if (window.pageSync) {
    console.log('⚠️ 脚本已在运行');
    alert('脚本已在运行中！');
} else {
    // 启动脚本
    console.log('🚀 启动页面同步脚本...');
    window.pageSync = new PageSync();

    // 提供手动同步方法
    window.manualSync = () => {
        if (window.pageSync) {
            window.pageSync.manualSync();
        }
    };

    // 提供停止方法
    window.stopSync = () => {
        if (window.pageSync) {
            window.pageSync.stop();
            window.pageSync = null;
        }
    };
}

console.log('✅ 页面同步脚本加载完成');
console.log('💡 使用方法：');
console.log('  - 手动同步：window.manualSync()');
console.log('  - 停止同步：window.stopSync()');
