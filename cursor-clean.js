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
                color: #2980b9;
                font-size: 2.2rem;
                font-weight: 700;
                margin-bottom: 8px;
                display: flex;
                align-items: center;
                gap: 12px;
                text-shadow: 0 1px 2px rgba(0,0,0,0.1);
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
                        color: #ffffff;
                        background: #2c3e50;
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
                    contentDiv.className = 'sync-content';
                    contentDiv.style.cssText = `
                        background: #000000 !important;
                        color: #ffffff !important;
                        padding: 28px 32px;
                        border-radius: 0 0 12px 12px;
                        min-height: 80px;
                        font-size: 18px !important;
                        font-weight: 400;
                        word-break: break-word;
                        margin-top: 0;
                        line-height: 1.7 !important;
                        height: auto !important;
                        max-height: none !important;
                        overflow-y: visible !important;
                        overflow-x: auto !important;
                        box-sizing: border-box;
                        white-space: pre-line;
                    `;

                    this.safeCloneContent(container, contentDiv);

                    // 确保所有子元素都有足够的对比度
                    this.enhanceTextVisibility(contentDiv);

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

    enhanceTextVisibility(container) {
        // 强制应用高对比度样式
        const allElements = container.querySelectorAll('*');
        allElements.forEach(el => {
            if (el.nodeType === Node.ELEMENT_NODE) {
                // 使用!important 强制覆盖所有样式
                el.style.setProperty('color', '#ffffff', 'important');
                el.style.setProperty('background-color', 'transparent', 'important');
                el.style.setProperty('font-size', '16px', 'important');
                el.style.setProperty('line-height', '1.6', 'important');

                // 特殊处理一些元素
                if (el.tagName === 'CODE' || el.tagName === 'PRE') {
                    el.style.setProperty('background-color', 'rgba(255,255,255,0.1)', 'important');
                    el.style.setProperty('padding', '4px 8px', 'important');
                    el.style.setProperty('border-radius', '4px', 'important');
                    el.style.setProperty('font-family', 'Monaco, Consolas, monospace', 'important');
                    el.style.setProperty('color', '#ffffff', 'important');
                }

                if (el.tagName === 'A') {
                    el.style.setProperty('color', '#00bfff', 'important');
                    el.style.setProperty('text-decoration', 'underline', 'important');
                }

                if (el.tagName === 'STRONG' || el.tagName === 'B') {
                    el.style.setProperty('font-weight', '700', 'important');
                    el.style.setProperty('color', '#ffffff', 'important');
                }

                // 处理可能有深色背景的元素
                if (el.style.backgroundColor && el.style.backgroundColor !== 'transparent') {
                    el.style.setProperty('background-color', 'rgba(255,255,255,0.05)', 'important');
                }
            }
        });

        // 添加一个全局样式覆盖
        const styleOverride = document.createElement('style');
        styleOverride.textContent = `
            .sync-content * {
                color: #ffffff !important;
                background-color: transparent !important;
            }
            .sync-content code,
            .sync-content pre {
                background-color: rgba(255,255,255,0.1) !important;
                color: #ffffff !important;
                padding: 4px 8px !important;
                border-radius: 4px !important;
            }
            .sync-content a {
                color: #00bfff !important;
                text-decoration: underline !important;
            }
            .sync-content strong,
            .sync-content b {
                color: #ffffff !important;
                font-weight: 700 !important;
            }
        `;
        container.appendChild(styleOverride);
    }

    findChatContainers() {
        console.log('🔍 开始查找 Cursor 聊天容器...');
        // 优先选择最典型的主聊天区域
        const selectors = [
            '.composer-bar .conversations',
            '.conversations',
            '.composer-bar'
        ];
        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el && this.isValidContainer(el)) {
                console.log(`🎯 只选主聊天容器：${selector}`);
                return [el];
            }
        }
        // 兜底：选面积最大的 div
        let maxArea = 0;
        let maxDiv = null;
        document.querySelectorAll('div').forEach(div => {
            const rect = div.getBoundingClientRect();
            const area = rect.width * rect.height;
            if (area > maxArea && this.isValidContainer(div)) {
                maxArea = area;
                maxDiv = div;
            }
        });
        if (maxDiv) {
            console.log('🎯 兜底选最大 div');
            return [maxDiv];
        }
        return [];
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
