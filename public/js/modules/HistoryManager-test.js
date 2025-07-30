// 测试脚本 - 直接测试HistoryManager
class TestHistoryManager {
    constructor() {
        this.testContainer = document.createElement('div');
        this.testContainer.innerHTML = `
            <div id="chat-list"></div>
            <div id="chat-detail" style="display: none;">
                <h3>聊天详情</h3>
                <div id="detail-content"></div>
            </div>
        `;
        document.body.appendChild(this.testContainer);
    }

    async test() {
        console.log('🧪 开始测试HistoryManager...');
        
        try {
            // 测试API客户端
            console.log('📡 测试API客户端...');
            const apiClient = new HistoryApiClient();
            
            // 测试聊天列表
            console.log('🔍 获取聊天列表...');
            const chatsResponse = await apiClient.getAllChats();
            console.log('✅ 聊天列表响应:', chatsResponse);
            
            if (chatsResponse.success && chatsResponse.data) {
                console.log(`📊 找到 ${chatsResponse.data.length} 条聊天记录`);
                
                // 测试聊天详情
                if (chatsResponse.data.length > 0) {
                    const firstChat = chatsResponse.data[0];
                    console.log('🔍 测试聊天详情:', firstChat.sessionId);
                    const detailResponse = await apiClient.getChatDetail(firstChat.sessionId);
                    console.log('✅ 聊天详情响应:', detailResponse);
                    
                    if (detailResponse.success && detailResponse.data) {
                        console.log(`💬 消息数量: ${detailResponse.data.messages?.length || 0}`);
                        
                        // 显示结果
                        this.displayResult(chatsResponse.data, detailResponse.data);
                    }
                }
            } else {
                console.error('❌ API响应格式错误:', chatsResponse);
            }
            
        } catch (error) {
            console.error('❌ 测试失败:', error);
            this.testContainer.innerHTML = `<div class="error">测试失败: ${error.message}</div>`;
        }
    }

    displayResult(chats, detail) {
        const listDiv = this.testContainer.querySelector('#chat-list');
        let html = '<h4>聊天列表:</h4>';
        
        chats.forEach(chat => {
            html += `
                <div style="border: 1px solid #ccc; margin: 10px 0; padding: 10px;">
                    <strong>${chat.title}</strong><br>
                    <small>ID: ${chat.sessionId}</small><br>
                    <small>消息: ${chat.messages?.length || 0}</small>
                </div>
            `;
        });
        
        listDiv.innerHTML = html;
        
        const detailDiv = this.testContainer.querySelector('#detail-content');
        if (detail) {
            let detailHtml = '<h4>聊天详情:</h4>';
            detailHtml += `<p><strong>${detail.title}</strong></p>`;
            detailHtml += `<p>消息数量: ${detail.messages?.length || 0}</p>`;
            
            if (detail.messages) {
                detailHtml += '<h5>消息:</h5>';
                detail.messages.forEach(msg => {
                    detailHtml += `
                        <div style="margin: 5px 0; padding: 5px; border-left: 3px solid #007acc;">
                            <strong>${msg.role}:</strong> ${msg.content.substring(0, 50)}...
                        </div>
                    `;
                });
            }
            
            detailDiv.innerHTML = detailHtml;
            this.testContainer.querySelector('#chat-detail').style.display = 'block';
        }
    }
}

// 测试函数
window.testHistory = async function() {
    console.log('🚀 启动历史记录测试...');
    const tester = new TestHistoryManager();
    await tester.test();
};