// 简单的测试服务器，展示真实的Cursor聊天数据
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3002; // 使用不同的端口避免冲突

// 静态文件服务
app.use(express.static('.'));

// CORS支持
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// 读取测试数据
let testData = [];
try {
    const dataPath = path.join(__dirname, 'test-chat-data.json');
    if (fs.existsSync(dataPath)) {
        testData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        console.log(`📚 加载了 ${testData.length} 个测试聊天会话`);
    }
} catch (error) {
    console.error('❌ 加载测试数据失败:', error.message);
}

// API路由 - 获取所有聊天会话
app.get('/api/test/chats', (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        
        const paginatedData = testData.slice(startIndex, endIndex);
        
        res.json({
            success: true,
            data: paginatedData,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: testData.length,
                pages: Math.ceil(testData.length / limit)
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API路由 - 获取单个聊天会话
app.get('/api/test/chats/:sessionId', (req, res) => {
    try {
        const { sessionId } = req.params;
        const chat = testData.find(c => c.sessionId === sessionId);
        
        if (chat) {
            res.json({
                success: true,
                data: chat
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Chat session not found'
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API路由 - 获取统计信息
app.get('/api/test/stats', (req, res) => {
    try {
        const totalMessages = testData.reduce((sum, chat) => sum + chat.messages.length, 0);
        
        res.json({
            success: true,
            data: {
                totalChats: testData.length,
                totalMessages: totalMessages,
                avgMessagesPerChat: Math.round(totalMessages / testData.length),
                extractedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 重新生成测试数据
app.post('/api/test/regenerate', async (req, res) => {
    try {
        console.log('🔄 重新生成测试数据...');
        const { runTest } = require('./test-data.js');
        const newData = await runTest();
        
        if (newData && newData.length > 0) {
            testData = newData;
            res.json({
                success: true,
                message: `成功重新生成了 ${newData.length} 个聊天会话`,
                data: {
                    totalChats: newData.length,
                    totalMessages: newData.reduce((sum, chat) => sum + chat.messages.length, 0)
                }
            });
        } else {
            res.status(500).json({
                success: false,
                error: '重新生成数据失败'
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`\n🚀 测试服务器启动成功！`);
    console.log(`📍 访问地址: http://localhost:${PORT}`);
    console.log(`📱 测试页面: http://localhost:${PORT}/test.html`);
    console.log(`📊 测试API: http://localhost:${PORT}/api/test/stats`);
    console.log(`💬 聊天数据: http://localhost:${PORT}/api/test/chats`);
    
    if (testData.length > 0) {
        const totalMessages = testData.reduce((sum, chat) => sum + chat.messages.length, 0);
        console.log(`\n📚 已加载数据:`);
        console.log(`  - ${testData.length} 个聊天会话`);
        console.log(`  - ${totalMessages} 条聊天消息`);
        console.log(`  - 平均每会话 ${Math.round(totalMessages / testData.length)} 条消息`);
    } else {
        console.log(`\n⚠️  没有测试数据，请先运行: node test-data.js`);
    }
});

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n🛑 测试服务器正在关闭...');
    process.exit(0);
});