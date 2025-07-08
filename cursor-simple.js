/* style.css - 简化的 Web 端样式 */

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    background-color: #1a1a1a;
    color: #ffffff;
    height: 100vh;
    overflow: hidden;
}

.container {
    display: flex;
    flex-direction: column;
    height: 100vh;
}

.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 20px;
    background-color: #2d2d2d;
    border-bottom: 1px solid #404040;
    flex-shrink: 0;
}

.header h1 {
    font-size: 18px;
    font-weight: 600;
    color: #ffffff;
}

.status {
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
}

.status.connected {
    background-color: #22c55e;
    color: #ffffff;
}

.status.disconnected {
    background-color: #ef4444;
    color: #ffffff;
}

.status.error {
    background-color: #f59e0b;
    color: #ffffff;
}

.status.connecting {
    background-color: #3b82f6;
    color: #ffffff;
}

.status.waiting {
    background-color: #f59e0b;
    color: #ffffff;
}

.main {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.messages-container {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    background-color: #1a1a1a;
}

.welcome-message {
    text-align: center;
    padding: 60px 20px;
    color: #888888;
}

.welcome-message h2 {
    font-size: 24px;
    color: #ffffff;
    margin-bottom: 16px;
}

.welcome-message p {
    font-size: 16px;
    margin-bottom: 8px;
}

.welcome-message .instruction {
    font-size: 14px;
    color: #666666;
    font-style: italic;
}

/* 同步的 Cursor 聊天内容样式 */
.sync-content {
    animation: fadeIn 0.3s ease-in;
}

.sync-content * {
    color: inherit !important;
}

/* 时间戳样式 */
.last-update {
    font-size: 12px;
    color: #888888;
    margin-left: 16px;
}

/* 淡入动画 */
@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* 滚动条样式 */
.messages-container::-webkit-scrollbar {
    width: 8px;
}

.messages-container::-webkit-scrollbar-track {
    background: #2d2d2d;
}

.messages-container::-webkit-scrollbar-thumb {
    background: #404040;
    border-radius: 4px;
}

.messages-container::-webkit-scrollbar-thumb:hover {
    background: #505050;
}

/* 响应式设计 */
@media (max-width: 768px) {
    .header {
        padding: 8px 16px;
    }

    .header h1 {
        font-size: 16px;
    }

    .messages-container {
        padding: 16px;
    }

    .welcome-message {
        padding: 40px 16px;
    }

    .welcome-message h2 {
        font-size: 20px;
    }
}

    // 更新时间戳
    updateTimestamp(date) {
        let timestampEl = document.querySelector('.last-update');
        if (!timestampEl) {
            timestampEl = document.createElement('div');
            timestampEl.className = 'last-update';
            document.querySelector('.header').appendChild(timestampEl);
        }

        timestampEl.textContent = `最后更新：${date.toLocaleTimeString()}`;
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 页面加载完成，启动简化客户端...');
    window.simpleClient = new SimpleWebClient();
});

// 全局错误处理
window.addEventListener('error', (event) => {
    console.error('🔥 页面错误：', event.error);
});

console.log('✅ Simple Client JS 加载完成');
// 启动脚本
if (window.SimpleCursorSync) {
    console.log('⚠️ 脚本已在运行');
    alert('脚本已在运行中！');
} else {
    setTimeout(() => {
        window.SimpleCursorSync = new SimpleCursorSync();
        alert('🚀 Cursor 同步脚本已启动！\n\n专门定位右侧聊天区域\n每 5 秒自动同步');
    }, 1000);
}
