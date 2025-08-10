/**
 * 事件管理器
 * 负责事件绑定和处理
 */
class EventManager {
    constructor(client) {
        this.client = client;
        this.boundEvents = new Map();
    }

    /**
     * 初始化所有事件
     */
    init() {
        console.log('🔧 初始化事件管理器...');

        // 延迟一点时间确保DOM完全加载
        setTimeout(() => {
            this.bindAllEvents();
        }, 100);
    }

    /**
     * 绑定所有事件
     */
    bindAllEvents() {
        this.bindSendMessageEvents();
        this.bindClearEvents();
        this.bindGlobalEvents();
        console.log('✅ 事件绑定完成');
    }

    /**
     * 绑定发送消息事件
     */
    bindSendMessageEvents() {
        console.log('🔧 绑定发送消息事件...');

        const sendForm = document.getElementById('send-form');
        const sendInput = document.getElementById('send-input');
        const sendBtn = document.getElementById('send-btn');

        console.log('📋 表单元素:', {
            sendForm: !!sendForm,
            sendInput: !!sendInput,
            sendBtn: !!sendBtn,
            sendFormId: sendForm?.id,
            sendInputId: sendInput?.id,
            sendBtnId: sendBtn?.id
        });

        if (sendForm && sendInput) {
            // 表单提交事件（方案1：发送 + 历史轮询）
            const submitHandler = async (e) => {
                e.preventDefault();
                const msg = sendInput.value.trim();
                console.log('📤 尝试发送消息:', msg);

                if (!msg) {
                    console.log('❌ 消息为空，跳过发送');
                    return;
                }

                if (!this.client || !this.client.wsManager) {
                    console.error('❌ WebSocket管理器未初始化');
                    return;
                }

                if (!this.client.wsManager.isConnected()) {
                    console.error('❌ WebSocket未连接，无法发送消息');
                    return;
                }

                // 使用统一的发送与轮询逻辑
                try {
                    const success = await this.client.sendAndPoll(msg);
                    if (success) {
                        console.log('✅ 消息发送成功');
                        sendInput.value = '';
                    } else {
                        console.error('❌ 消息发送失败');
                    }
                } catch (err) {
                    console.error('❌ 发送与轮询出错：', err);
                }
            };

            // 回车键事件
            const keydownHandler = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    // 直接调用提交处理函数，而不是触发事件
                    submitHandler(e);
                }
            };

            // 绑定发送按钮点击事件
            const sendBtn = document.getElementById('send-btn');
            if (sendBtn) {
                sendBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    submitHandler(e);
                });
                this.boundEvents.set('sendBtn', { element: sendBtn, event: 'click', handler: submitHandler });
            }

            sendForm.addEventListener('submit', submitHandler);
            sendInput.addEventListener('keydown', keydownHandler);

            // 记录绑定的事件，用于后续清理
            this.boundEvents.set('sendForm', { element: sendForm, event: 'submit', handler: submitHandler });
            this.boundEvents.set('sendInput', { element: sendInput, event: 'keydown', handler: keydownHandler });

            console.log('✅ 发送消息事件绑定成功');
        } else {
            console.error('❌ 发送消息表单元素未找到');
        }
    }

    /**
     * 绑定清除事件
     */
    bindClearEvents() {
        const clearBtn = document.getElementById('clear-btn');
        const sendInput = document.getElementById('send-input');

        if (clearBtn && sendInput) {
            const clearHandler = () => {
                sendInput.value = '';
                sendInput.focus();

                // 记录清理时间点
                const now = Date.now();
                if (this.client && this.client.contentManager) {
                    this.client.contentManager.setClearTimestamp(now);
                }

                // 清空聊天内容区域
                if (this.client && this.client.uiManager) {
                    this.client.uiManager.clearContent();
                }

                // 通知服务器清空内容
                if (this.client && this.client.wsManager) {
                    this.client.wsManager.send({
                        type: 'clear_content',
                        timestamp: now
                    });
                }

                // 显示清理确认信息
                if (this.client && this.client.uiManager) {
                    this.client.uiManager.showClearNotification(now);
                }
            };

            clearBtn.addEventListener('click', clearHandler);
            this.boundEvents.set('clearBtn', { element: clearBtn, event: 'click', handler: clearHandler });
        }
    }

    /**
     * 绑定全局事件
     */
    bindGlobalEvents() {
        // 全局错误处理
        const errorHandler = (event) => {
            console.error('🔥 页面错误:', event.error);
        };

        // 页面卸载事件
        const beforeUnloadHandler = () => {
            this.client.cleanup();
        };

        // 页面可见性变化事件
        const visibilityChangeHandler = () => {
            if (document.hidden) {
                console.log('📱 页面隐藏，暂停部分功能');
            } else {
                console.log('📱 页面显示，恢复功能');
            }
        };

        window.addEventListener('error', errorHandler);
        window.addEventListener('beforeunload', beforeUnloadHandler);
        document.addEventListener('visibilitychange', visibilityChangeHandler);

        this.boundEvents.set('windowError', { element: window, event: 'error', handler: errorHandler });
        this.boundEvents.set('windowBeforeUnload', { element: window, event: 'beforeunload', handler: beforeUnloadHandler });
        this.boundEvents.set('documentVisibilityChange', { element: document, event: 'visibilitychange', handler: visibilityChangeHandler });
    }

    /**
     * 绑定自定义事件
     */
    bindCustomEvent(eventName, handler, element = document) {
        element.addEventListener(eventName, handler);
        this.boundEvents.set(eventName, { element, event: eventName, handler });
    }

    /**
     * 解绑事件
     */
    unbindEvent(eventKey) {
        const eventInfo = this.boundEvents.get(eventKey);
        if (eventInfo) {
            eventInfo.element.removeEventListener(eventInfo.event, eventInfo.handler);
            this.boundEvents.delete(eventKey);
        }
    }

    /**
     * 解绑所有事件
     */
    unbindAllEvents() {
        for (const [key, eventInfo] of this.boundEvents) {
            try {
                eventInfo.element.removeEventListener(eventInfo.event, eventInfo.handler);
            } catch (error) {
                console.warn(`解绑事件失败: ${key}`, error);
            }
        }
        this.boundEvents.clear();
        console.log('🧹 所有事件已解绑');
    }

    /**
     * 触发自定义事件
     */
    triggerEvent(eventName, data = {}) {
        const event = new CustomEvent(eventName, { detail: data });
        document.dispatchEvent(event);
    }

    /**
     * 获取绑定的事件列表
     */
    getBoundEvents() {
        return Array.from(this.boundEvents.keys());
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventManager;
} else {
    window.EventManager = EventManager;
}
