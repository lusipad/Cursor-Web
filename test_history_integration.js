#!/usr/bin/env node

/**
 * 测试历史记录 API 和主页显示功能
 */

const fetch = require('node-fetch');

async function testHistoryAPI() {
    console.log('🧪 测试历史记录 API...\n');

    try {
        // 测试历史记录统计 API
        console.log('1. 测试历史记录统计 API...');
        const statsResponse = await fetch('http://localhost:3001/api/history/stats');
        const statsResult = await statsResponse.json();
        
        console.log('统计 API 响应:', JSON.stringify(statsResult, null, 2));
        
        if (statsResult.success) {
            const stats = statsResult.data;
            console.log(`✅ 统计信息:`);
            console.log(`   - 总记录数: ${stats.total}`);
            console.log(`   - 聊天记录: ${stats.byType.chat || 0}`);
            console.log(`   - 系统记录: ${stats.byType.system || 0}`);
            console.log(`   - 错误记录: ${stats.byType.error || 0}`);
        } else {
            console.log('❌ 统计 API 失败');
        }

        console.log('\n' + '='.repeat(50) + '\n');

        // 测试历史记录列表 API
        console.log('2. 测试历史记录列表 API...');
        const listResponse = await fetch('http://localhost:3001/api/history?limit=10&sortOrder=desc');
        const listResult = await listResponse.json();
        
        console.log('列表 API 响应状态:', listResult.success);
        
        if (listResult.success) {
            const items = listResult.data.items;
            console.log(`✅ 获取到 ${items.length} 条历史记录`);
            
            // 显示前几条记录
            console.log('\n前 5 条记录:');
            items.slice(0, 5).forEach((item, index) => {
                console.log(`   ${index + 1}. [${item.type}] ${item.summary}`);
                console.log(`      时间: ${new Date(item.timestamp).toLocaleString()}`);
                console.log(`      来源: ${item.metadata?.source || 'unknown'}`);
                console.log();
            });
            
            // 统计工作区处理器记录
            const workspaceRecords = items.filter(item => item.metadata?.source === 'integrated_history');
            console.log(`📊 工作区处理器记录: ${workspaceRecords.length} 条`);
            
            if (workspaceRecords.length > 0) {
                console.log('工作区记录类型分布:');
                const overviewCount = workspaceRecords.filter(r => r.metadata.record_type === 'workspace_overview').length;
                const sessionCount = workspaceRecords.filter(r => r.metadata.record_type === 'chat_session').length;
                console.log(`   - 工作区概览: ${overviewCount} 条`);
                console.log(`   - 聊天会话: ${sessionCount} 条`);
            }
        } else {
            console.log('❌ 列表 API 失败:', listResult.message);
        }

        console.log('\n' + '='.repeat(50) + '\n');

        // 测试主页快速历史记录
        console.log('3. 模拟主页快速历史记录加载...');
        
        // 模拟主页的快速历史记录请求
        const quickStatsResponse = await fetch('http://localhost:3001/api/history/stats');
        const quickStats = await quickStatsResponse.json();
        
        const quickListResponse = await fetch('http://localhost:3001/api/history?limit=10&sortOrder=desc');
        const quickList = await quickListResponse.json();
        
        if (quickStats.success && quickList.success) {
            console.log('✅ 主页快速历史记录数据加载成功');
            console.log(`   - 总记录数: ${quickStats.data.total}`);
            console.log(`   - 聊天记录: ${quickStats.data.byType.chat || 0}`);
            console.log(`   - 最近记录: ${quickList.data.items.length} 条`);
            
            // 检查是否有工作区记录
            const hasWorkspaceRecords = quickList.data.items.some(item => 
                item.metadata?.source === 'integrated_history'
            );
            
            if (hasWorkspaceRecords) {
                console.log('✅ 主页将显示工作区聊天记录');
            } else {
                console.log('❌ 主页未找到工作区聊天记录');
            }
        } else {
            console.log('❌ 主页快速历史记录加载失败');
        }

    } catch (error) {
        console.error('❌ 测试失败:', error.message);
        console.log('请确保服务器正在运行在 http://localhost:3001');
    }
}

// 主函数
async function main() {
    console.log('🔍 工作区聊天记录集成测试\n');
    
    await testHistoryAPI();
    
    console.log('\n📋 测试完成！');
    console.log('如果测试通过，请访问 http://localhost:3001 查看主页的历史记录标签页');
}

// 运行测试
if (require.main === module) {
    main();
}

module.exports = { testHistoryAPI };