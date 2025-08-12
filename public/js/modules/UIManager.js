/**
 * UI管理器
 * 负责DOM操作、事件处理和界面更新
 */
class UIManager {
    constructor() {
        this.clearNotificationTimeout = null;
    }

    /**
     * 更新状态显示
     */
    updateStatus(message, type) {
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = `status ${type}`;
        } else {
            // 在诊断页面中，如果没有status元素，就输出到控制台
            console.log(`📊 状态更新: ${message} (${type})`);
        }
    }

    /**
     * 更新分离的状态显示（WebSocket和Cursor分别显示）
     */
    updateSeparatedStatus(websocketStatus, cursorStatus) {
        // 更新WebSocket状态
        const wsStatusEl = document.getElementById('ws-status');
        if (wsStatusEl) {
            wsStatusEl.textContent = websocketStatus.message;
            wsStatusEl.className = `status ${websocketStatus.type}`;
        }

        // 更新Cursor状态
        const cursorStatusEl = document.getElementById('cursor-status');
        if (cursorStatusEl) {
            cursorStatusEl.textContent = cursorStatus.message;
            cursorStatusEl.className = `status ${cursorStatus.type}`;
        }

        // 如果没有分离的状态元素，使用传统方式
        if (!wsStatusEl && !cursorStatusEl) {
            this.updateStatus(`${websocketStatus.message} | ${cursorStatus.message}`, websocketStatus.type);
        }
    }

    /**
     * 显示聊天内容
     */
    displayContent(contentData) {
        const targetId = window.__renderTargetId || 'messages-container';
        const container = document.getElementById(targetId);
        if (!container) {
            // 在诊断页面中，如果没有messages-container，就输出到控制台
            console.log('📄 内容更新 (诊断模式):', contentData);
            return;
        }

        const { html, timestamp } = contentData;

        if (html) {
            // 若当前不在“实时回显”模式，则仍更新但隐藏 DOM（以便切换时可秒显）
            const realtimeOnly = (window.__enableRealtimeRender === true);
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
            this.applyContentStyles(contentArea);

            // 添加时间戳
            this.updateTimestamp(new Date(timestamp));

            // 自动滚动到底部
            this.scrollToBottom(container);

            if (window.__cwDebugLogs) {
                console.log('✅ 内容已更新，长度:', html.length);
                console.log('📊 内容预览:', html.substring(0, 200) + '...');
                console.log('📏 容器高度:', container.scrollHeight, 'px');
                console.log('📏 视口高度:', container.clientHeight, 'px');
                console.log('📏 滚动位置:', container.scrollTop, 'px');
            }

            // 根据子Tab显示模式切换可见性
            try{
              const timelineEl = (window.simpleClient && window.simpleClient.timeline && window.simpleClient.timeline.timeline) || null;
              if (realtimeOnly){
                if (timelineEl) timelineEl.style.display = 'none';
                contentArea.style.display = '';
              } else {
                if (timelineEl) timelineEl.style.display = '';
                // 默认回显区域隐藏（仍保留最新内容，切换到实时回显时立即可见）
                contentArea.style.display = 'none';
              }
            }catch{}
        }
    }

    /**
     * 应用内容样式
     */
    applyContentStyles(contentArea) {
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
    }

    /**
     * 滚动到底部
     */
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
        }, 50);
    }

    /**
     * 更新时间戳
     */
    updateTimestamp(date) {
        let timestampEl = document.querySelector('.last-update');
        if (!timestampEl) {
            timestampEl = document.createElement('div');
            timestampEl.className = 'last-update';
            document.querySelector('.header').appendChild(timestampEl);
        }

        timestampEl.textContent = `最后更新: ${date.toLocaleTimeString()}`;
    }

    /**
     * 清空内容区域
     */
    clearContent() {
        const contentArea = document.querySelector('.sync-content');
        if (contentArea) {
            contentArea.innerHTML = '';
        }

        const ts = document.querySelector('.last-update');
        if (ts) {
            ts.textContent = '';
        }

        // 在诊断页面中，输出清理信息到控制台
        console.log('🧹 内容已清理 (诊断模式)');
    }

    /**
     * 显示清理确认信息
     */
    showClearNotification(clearTimestamp) {
        // 清除之前的通知
        this.hideClearNotification();

        // 创建或更新清理状态显示
        let clearStatusEl = document.querySelector('.clear-status');
        if (!clearStatusEl) {
            clearStatusEl = document.createElement('div');
            clearStatusEl.className = 'clear-status';
            clearStatusEl.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #4CAF50;
                color: white;
                padding: 10px 15px;
                border-radius: 5px;
                font-size: 14px;
                z-index: 1000;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                transform: translateX(100%);
                transition: transform 0.3s ease-out;
            `;

            // 强制重排后添加动画
            clearStatusEl.offsetHeight;
            clearStatusEl.style.transform = 'translateX(0)';
            document.body.appendChild(clearStatusEl);
        }

        const clearTime = new Date(clearTimestamp).toLocaleTimeString();
        clearStatusEl.textContent = `🧹 已清理 ${clearTime} 之前的所有消息`;
        clearStatusEl.style.background = '#4CAF50';

        // 3秒后自动隐藏
        this.clearNotificationTimeout = setTimeout(() => {
            this.hideClearNotification();
        }, 3000);

        console.log('🧹 清理确认信息已显示');
    }

    /**
     * 隐藏清理确认信息
     */
    hideClearNotification() {
        if (this.clearNotificationTimeout) {
            clearTimeout(this.clearNotificationTimeout);
            this.clearNotificationTimeout = null;
        }

        const clearStatusEl = document.querySelector('.clear-status');
        if (clearStatusEl && clearStatusEl.parentNode) {
            clearStatusEl.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (clearStatusEl && clearStatusEl.parentNode) {
                    clearStatusEl.remove();
                }
            }, 300);
        }
    }

    /**
     * 显示手动重连按钮
     */
    showReconnectButton(onReconnect) {
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
            if (onReconnect) {
                onReconnect();
            }
            reconnectBtn.remove();
        };

        statusEl.appendChild(reconnectBtn);
    }

    /**
     * 简单的HTML清理
     */
    sanitizeHTML(html) {
        // 移除可能的恶意脚本
        return html
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/on\w+="[^"]*"/gi, '')
            .replace(/javascript:/gi, '');
    }

    /**
     * 显示通知
     */
    showNotification(message, type = 'info') {
        // 在诊断页面中，输出通知到控制台
        console.log(`🔔 通知 (${type}): ${message}`);

        // 创建通知元素
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #007cba;
            color: white;
            padding: 10px 15px;
            border-radius: 5px;
            font-size: 14px;
            z-index: 1000;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            transform: translateX(100%);
            transition: transform 0.3s ease-out;
        `;

        document.body.appendChild(notification);

        // 强制重排后添加动画
        notification.offsetHeight;
        notification.style.transform = 'translateX(0)';

        // 3秒后自动隐藏
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }, 3000);
    }

    /**
     * 移除高度限制样式
     */
    removeHeightRestrictions(element) {
        if (!element) return;

        // 递归处理所有子元素
        const allElements = [element, ...element.querySelectorAll('*')];

        allElements.forEach(el => {
            const style = el.style;

            // 移除 max-height 限制
            if (style.maxHeight && style.maxHeight !== 'none') {
                if (window.__cwDebugLogs) console.log('🔓 移除 max-height 限制:', style.maxHeight, '-> none');
                style.maxHeight = 'none';
            }

            // 移除 overflow: hidden 限制
            if (style.overflow === 'hidden') {
                if (window.__cwDebugLogs) console.log('🔓 移除 overflow: hidden 限制');
                style.overflow = 'visible';
            }

            // 移除 overflow-y: hidden 限制
            if (style.overflowY === 'hidden') {
                if (window.__cwDebugLogs) console.log('🔓 移除 overflow-y: hidden 限制');
                style.overflowY = 'visible';
            }

            // 移除 overflow-x: hidden 限制
            if (style.overflowX === 'hidden') {
                if (window.__cwDebugLogs) console.log('🔓 移除 overflow-x: hidden 限制');
                style.overflowX = 'visible';
            }
        });

        if (window.__cwDebugLogs) console.log('🎯 已移除所有高度限制样式，确保内容完整显示');
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIManager;
} else {
    window.UIManager = UIManager;
}
