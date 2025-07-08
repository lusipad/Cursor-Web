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
            // 测试服务器连接
            await this.testServer();
            console.log('✅ 服务器连接测试成功');

            // 立即发送一次当前内容
            await this.checkAndSync();

            // 开始定时同步
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

    // 保持格式的内容抓取方法
    getContent() {
        try {
            console.log('🔍 开始抓取页面内容（保持原始格式）...');

            // 查找聊天容器
            const chatContainers = this.findChatContainers();

            if (chatContainers.length > 0) {
                console.log(`🎯 找到 ${chatContainers.length} 个聊天容器`);

                // 使用安全的方法获取 HTML 内容
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

    // 安全获取HTML内容的方法
    safeGetHTML(containers) {
        try {
            // 创建一个临时容器
            const tempContainer = document.createElement('div');
            tempContainer.style.cssText = `
                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
                background: #fff;
            `;

            // 添加标题
            const title = document.createElement('h1');
            title.style.cssText = `
                color: #2196F3;
                border-bottom: 2px solid #eee;
                padding-bottom: 10px;
                margin-bottom: 20px;
            `;
            title.textContent = '🚀 Cursor 聊天内容';
            tempContainer.appendChild(title);

            // 添加时间戳
            const timestamp = document.createElement('p');
            timestamp.style.cssText = `
                color: #666;
                font-size: 14px;
                margin-bottom: 20px;
            `;
            timestamp.textContent = `同步时间: ${new Date().toLocaleString()}`;
            tempContainer.appendChild(timestamp);

            // 处理每个聊天容器
            containers.forEach((container, index) => {
                try {
                    // 创建容器包装
                    const wrapper = document.createElement('div');
                    wrapper.style.cssText = `
                        border: 1px solid #ddd;
                        border-radius: 8px;
                        margin-bottom: 20px;
                        padding: 15px;
                        background: #f9f9f9;
                    `;

                    // 添加容器标题
                    const containerTitle = document.createElement('h3');
                    containerTitle.style.cssText = `
                        color: #4CAF50;
                        margin: 0 0 15px 0;
                        font-size: 16px;
                    `;
                    containerTitle.textContent = `聊天区域 ${index + 1}`;
                    wrapper.appendChild(containerTitle);

                    // 创建内容区域
                    const contentDiv = document.createElement('div');
                    contentDiv.style.cssText = `
                        background: white;
                        padding: 10px;
                        border-radius: 4px;
                        min-height: 50px;
                    `;

                    // 安全地复制内容
                    this.safeCloneContent(container, contentDiv);

                    wrapper.appendChild(contentDiv);
                    tempContainer.appendChild(wrapper);

                    console.log(`✅ 聊天容器 ${index + 1} 处理成功`);
                } catch (error) {
                    console.warn(`⚠️ 聊天容器 ${index} 处理失败:`, error);
                }
            });

            // 使用 XMLSerializer 安全地获取 HTML
            const serializer = new XMLSerializer();
            return serializer.serializeToString(tempContainer);

        } catch (error) {
            console.error('❌ 安全获取 HTML 失败：', error);
            return null;
        }
    }

    // 安全地复制内容
    safeCloneContent(source, target) {
        try {
            // 深度复制节点，但要安全处理
            const clone = source.cloneNode(true);

            // 清理可能有问题的属性
            this.cleanElement(clone);

            // 将清理后的内容添加到目标
            while (clone.firstChild) {
                target.appendChild(clone.firstChild);
            }
        } catch (error) {
            console.warn('克隆内容失败，使用文本内容：', error);
            // 如果克隆失败，至少保留文本内容
            const textDiv = document.createElement('div');
            textDiv.textContent = source.textContent || '';
            target.appendChild(textDiv);
        }
    }

    // 清理元素，移除可能有问题的属性
    cleanElement(element) {
        if (element.nodeType === Node.ELEMENT_NODE) {
            // 移除脚本标签
            if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE') {
                element.remove();
                return;
            }

            // 移除事件处理器
            const attributes = [...element.attributes];
            attributes.forEach(attr => {
                if (attr.name.startsWith('on') || attr.name.startsWith('data-')) {
                    element.removeAttribute(attr.name);
                }
            });

            // 递归处理子元素
            const children = [...element.children];
            children.forEach(child => this.cleanElement(child));
        }
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
