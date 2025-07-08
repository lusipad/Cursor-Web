// 🚀 Cursor 格式保持版同步脚本 - 保持原始 HTML 格式
console.log('🚀 Cursor 格式保持版同步脚本开始运行...');

class FormatSafeCursorSync {
    constructor() {
        this.serverUrl = 'http://localhost:3000';
        this.lastContent = '';
        this.syncInterval = null;

        console.log('🔧 初始化格式保持版同步系统...');
        this.init();
    }

    async init() {
        try {
            await this.testServer();
            console.log('✅ 服务器连接测试成功');

            await this.checkAndSync();
            this.startSync();

            this.showMessage('✅ 格式保持版同步已启动', '#4CAF50');
            console.log('🎉 格式保持版同步系统初始化完成');
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

    getContent() {
        try {
            console.log('🔍 开始抓取页面内容（保持原始格式）...');

            const chatContainers = this.findChatContainers();

            if (chatContainers.length > 0) {
                console.log(`🎯 找到 ${chatContainers.length} 个聊天容器`);

                const html = this.safeGetHTML(chatContainers);

                if (!html || html.length < 50) {
                    console.warn('⚠️ 获取的HTML内容太短:', html?.length);
                    return null;
                }

                const result = {
                    html: html,
                    timestamp: Date.now(),
                    url: window.location.href,
                    containerInfo: {
                        chatContainersFound: chatContainers.length,
                        contentLength: html.length
                    }
                };

                console.log('📋 抓取格式化内容成功:', result.html.length, '字符');
                console.log('🎯 聊天容器数量:', chatContainers.length);
                return result;
            } else {
                console.warn('⚠️ 未找到聊天容器');
                return null;
            }

        } catch (error) {
            console.error('❌ 抓取格式化内容失败:', error);
            return null;
        }
    }

    safeGetHTML(containers) {
        try {
            const tempContainer = document.createElement('div');
            tempContainer.style.cssText = `
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Liberation Sans', Arial, sans-serif;
                line-height: 1.7;
                color: #23272e;
                background: #f5f6fa;
                max-width: 1200px;
                min-width: 400px;
                margin: 32px auto;
                padding: 32px 32px 24px 32px;
                border-radius: 18px;
                box-shadow: 0 6px 32px rgba(0,0,0,0.10);
            `;

            const title = document.createElement('h1');
            title.style.cssText = `
                color: #4f8cff;
                font-size: 2.2rem;
                font-weight: 700;
                margin-bottom: 8px;
                display: flex;
                align-items: center;
                gap: 12px;
            `;

            const rocket = document.createElement('span');
            rocket.textContent = '🚀';
            title.appendChild(rocket);

            const titleText = document.createElement('span');
            titleText.textContent = 'Cursor 聊天内容';
            title.appendChild(titleText);

            tempContainer.appendChild(title);

            const hr = document.createElement('hr');
            hr.style.cssText = 'border: none; border-top: 2px solid #ececec; margin: 12px 0 28px 0;';
            tempContainer.appendChild(hr);

            const timestamp = document.createElement('p');
            timestamp.style.cssText = `
                color: #888;
                font-size: 15px;
                margin-bottom: 28px;
            `;
            timestamp.textContent = `同步时间: ${new Date().toLocaleString()}`;
            tempContainer.appendChild(timestamp);

            containers.forEach((container, index) => {
                try {
                    const wrapper = document.createElement('div');
                    wrapper.style.cssText = `
                        border: 1.5px solid #e0e3ea;
                        border-radius: 12px;
                        margin-bottom: 32px;
                        padding: 0 0 24px 0;
                        background: #fff;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.04);
                    `;

                    const containerTitle = document.createElement('h3');
                    containerTitle.style.cssText = `
                        color: #fff;
                        background: #23272e;
                        border-radius: 12px 12px 0 0;
                        margin: 0;
                        padding: 14px 24px 10px 24px;
                        font-size: 1.15rem;
                        font-weight: 600;
                        letter-spacing: 1px;
                    `;
                    containerTitle.textContent = `聊天区域 ${index + 1}`;
                    wrapper.appendChild(containerTitle);

                    const contentDiv = document.createElement('div');
                    contentDiv.style.cssText = `
                        background: #23272e;
                        color: #f8f8f2;
                        padding: 28px 32px;
                        border-radius: 0 0 12px 12px;
                        min-height: 80px;
                        font-size: 1.25rem;
                        word-break: break-word;
                        overflow-x: auto;
                        margin-top: 0;
                    `;

                    this.safeCloneContent(container, contentDiv);

                    wrapper.appendChild(contentDiv);
                    tempContainer.appendChild(wrapper);

                    console.log(`✅ 聊天容器 ${index + 1} 处理成功`);
                } catch (error) {
                    console.warn(`⚠️ 聊天容器 ${index} 处理失败:`, error);
                }
            });

            const serializer = new XMLSerializer();
            return serializer.serializeToString(tempContainer);

        } catch (error) {
            console.error('❌ 安全获取 HTML 失败：', error);
            return null;
        }
    }

    safeCloneContent(source, target) {
        try {
            const clone = source.cloneNode(true);
            this.cleanElement(clone);

            while (clone.firstChild) {
                target.appendChild(clone.firstChild);
            }
        } catch (error) {
            console.warn('克隆内容失败，使用文本内容：', error);
            const textDiv = document.createElement('div');
            textDiv.textContent = source.textContent || '';
            target.appendChild(textDiv);
        }
    }

    cleanElement(element) {
        if (element.nodeType === Node.ELEMENT_NODE) {
            if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE') {
                element.remove();
                return;
            }

            const attributes = [...element.attributes];
            attributes.forEach(attr => {
                if (attr.name.startsWith('on') || attr.name.startsWith('data-')) {
                    element.removeAttribute(attr.name);
                }
            });

            const children = [...element.children];
            children.forEach(child => this.cleanElement(child));
        }
    }

    findChatContainers() {
        console.log('🔍 开始查找 Cursor 聊天容器...');
        const containers = [];

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
        const oldMsg = document.getElementById('cursor-sync-msg');
        if (oldMsg) oldMsg.remove();

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

    async manualSync() {
        console.log('🖱️ 手动触发同步');
        await this.checkAndSync();
    }
}

if (window.formatSafeCursorSync) {
    console.log('⚠️ 格式保持版脚本已在运行');
    alert('格式保持版脚本已在运行中！');
} else {
    console.log('🚀 启动格式保持版同步脚本...');
    window.formatSafeCursorSync = new FormatSafeCursorSync();

    window.manualSync = () => {
        if (window.formatSafeCursorSync) {
            window.formatSafeCursorSync.manualSync();
        }
    };

    window.stopSync = () => {
        if (window.formatSafeCursorSync) {
            window.formatSafeCursorSync.stop();
            window.formatSafeCursorSync = null;
        }
    };
}

console.log('✅ 格式保持版同步脚本加载完成');
console.log('💡 使用方法：');
console.log('  - 手动同步：window.manualSync()');
console.log('  - 停止同步：window.stopSync()');
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
if (window.formatSafeCursorSync) {
    console.log('⚠️ 格式保持版脚本已在运行');
    alert('格式保持版脚本已在运行中！');
} else {
    // 启动脚本
    console.log('🚀 启动格式保持版同步脚本...');
    window.formatSafeCursorSync = new FormatSafeCursorSync();

    // 提供手动同步方法
    window.manualSync = () => {
        if (window.formatSafeCursorSync) {
            window.formatSafeCursorSync.manualSync();
        }
    };

    // 提供停止方法
    window.stopSync = () => {
        if (window.formatSafeCursorSync) {
            window.formatSafeCursorSync.stop();
            window.formatSafeCursorSync = null;
        }
    };
}

console.log('✅ 格式保持版同步脚本加载完成');
console.log('💡 使用方法：');
console.log('  - 手动同步：window.manualSync()');
console.log('  - 停止同步：window.stopSync()');
