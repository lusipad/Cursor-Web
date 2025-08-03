// 工作区聊天记录集成器
// 将工作区处理器的数据集成到现有的历史记录系统中

const fs = require('fs');
const path = require('path');
const WorkspaceProcessor = require('./workspace_processor');

class WorkspaceChatIntegrator {
    constructor() {
        this.workspaceProcessor = null;
        this.integrationData = null;
        this.historyDataPath = path.join(__dirname, '..', 'data', 'history.json');
    }

    // 初始化工作区处理器
    async initialize(customCursorPath = null) {
        this.workspaceProcessor = new WorkspaceProcessor(customCursorPath);
        console.log('📁 工作区聊天记录集成器已初始化');
    }

    // 处理工作区数据并转换为历史记录格式
    async processAndIntegrate() {
        if (!this.workspaceProcessor) {
            throw new Error('工作区处理器未初始化');
        }

        console.log('🔄 开始处理工作区数据...');
        
        // 处理所有工作区
        await this.workspaceProcessor.processAllWorkspaces();
        
        // 获取处理后的数据
        const workspaceData = this.workspaceProcessor.processedWorkspaces;
        
        // 转换为历史记录格式
        const historyRecords = this.convertToHistoryFormat(workspaceData);
        
        // 保存历史记录
        await this.saveHistoryRecords(historyRecords);
        
        // 保存工作区原始数据
        await this.workspaceProcessor.saveResults('integrated_workspace_chats.json');
        
        console.log(`✅ 集成完成！处理了 ${workspaceData.length} 个工作区，生成了 ${historyRecords.length} 条历史记录`);
        
        return {
            workspaceCount: workspaceData.length,
            historyRecordCount: historyRecords.length,
            workspaces: workspaceData,
            historyRecords: historyRecords
        };
    }

    // 将工作区数据转换为历史记录格式
    convertToHistoryFormat(workspaceData) {
        const historyRecords = [];
        let recordId = 1;

        for (const workspace of workspaceData) {
            if (workspace.chat_count === 0) continue;

            // 为每个工作区创建一个概览记录
            const overviewRecord = {
                id: `workspace_${workspace.workspace_id}_${Date.now()}`,
                timestamp: Date.now(),
                type: 'chat',
                content: `工作区 ${workspace.workspace_id} 的聊天记录概览`,
                metadata: {
                    source: 'workspace_processor',
                    workspace_id: workspace.workspace_id,
                    project_name: workspace.project_info.name,
                    project_path: workspace.project_info.rootPath,
                    chat_count: workspace.chat_count,
                    record_type: 'workspace_overview'
                },
                summary: `工作区 "${workspace.project_info.name}" 包含 ${workspace.chat_count} 条聊天记录`
            };
            historyRecords.push(overviewRecord);

            // 为每个聊天会话创建详细记录
            for (const chat of workspace.chats) {
                const chatRecord = {
                    id: `chat_${chat.session_id}_${Date.now()}_${recordId++}`,
                    timestamp: new Date(chat.date).getTime(),
                    type: 'chat',
                    content: this.formatChatContent(chat),
                    metadata: {
                        source: 'workspace_processor',
                        workspace_id: workspace.workspace_id,
                        session_id: chat.session_id,
                        project_name: workspace.project_info.name,
                        project_path: workspace.project_info.rootPath,
                        message_count: chat.messages.length,
                        record_type: 'chat_session'
                    },
                    summary: this.generateChatSummary(chat)
                };
                historyRecords.push(chatRecord);
            }
        }

        return historyRecords;
    }

    // 格式化聊天内容
    formatChatContent(chat) {
        const messages = chat.messages.map(msg => {
            const role = msg.role === 'user' ? '用户' : '助手';
            return `${role}: ${msg.content}`;
        }).join('\n\n');

        return `项目: ${chat.project.name}\n会话ID: ${chat.session_id}\n\n${messages}`;
    }

    // 生成聊天摘要
    generateChatSummary(chat) {
        if (chat.messages.length === 0) return '空聊天记录';
        
        const firstUserMessage = chat.messages.find(msg => msg.role === 'user');
        const firstAssistantMessage = chat.messages.find(msg => msg.role === 'assistant');
        
        let summary = '';
        if (firstUserMessage) {
            summary += `用户: ${firstUserMessage.content.substring(0, 50)}${firstUserMessage.content.length > 50 ? '...' : ''}`;
        }
        if (firstAssistantMessage) {
            summary += ` → 助手: ${firstAssistantMessage.content.substring(0, 50)}${firstAssistantMessage.content.length > 50 ? '...' : ''}`;
        }
        
        return summary || `${chat.messages.length} 条消息的聊天记录`;
    }

    // 保存历史记录
    async saveHistoryRecords(records) {
        try {
            // 读取现有历史记录
            let existingRecords = [];
            if (fs.existsSync(this.historyDataPath)) {
                const rawData = fs.readFileSync(this.historyDataPath, 'utf8');
                existingRecords = JSON.parse(rawData);
            }

            // 过滤掉之前的工作区处理器记录（避免重复）
            const filteredRecords = existingRecords.filter(record => 
                record.metadata?.source !== 'workspace_processor'
            );

            // 合并新记录
            const allRecords = [...filteredRecords, ...records];

            // 按时间戳排序
            allRecords.sort((a, b) => b.timestamp - a.timestamp);

            // 保存到文件
            fs.writeFileSync(this.historyDataPath, JSON.stringify(allRecords, null, 2));
            
            console.log(`💾 历史记录已保存到: ${this.historyDataPath}`);
            console.log(`   - 保留原有记录: ${filteredRecords.length} 条`);
            console.log(`   - 新增工作区记录: ${records.length} 条`);
            console.log(`   - 总记录数: ${allRecords.length} 条`);
            
        } catch (error) {
            console.error('❌ 保存历史记录失败:', error);
            throw error;
        }
    }

    // 获取集成统计信息
    getIntegrationStats() {
        if (!this.integrationData) {
            return null;
        }

        const { workspaces, historyRecords } = this.integrationData;
        const workspacesWithChats = workspaces.filter(ws => ws.chat_count > 0);
        const totalMessages = workspaces.reduce((sum, ws) => sum + ws.chat_count, 0);

        return {
            totalWorkspaces: workspaces.length,
            workspacesWithChats: workspacesWithChats.length,
            totalChatSessions: historyRecords.filter(r => r.metadata.record_type === 'chat_session').length,
            totalMessages: totalMessages,
            totalHistoryRecords: historyRecords.length,
            projects: [...new Set(workspaces.map(ws => ws.project_info.name))].sort()
        };
    }

    // 生成集成报告
    generateIntegrationReport() {
        const stats = this.getIntegrationStats();
        if (!stats) return '集成数据不可用';

        return `
📊 工作区聊天记录集成报告
================================

工作区统计:
- 总工作区数: ${stats.totalWorkspaces}
- 有聊天记录的工作区: ${stats.workspacesWithChats}
- 总聊天会话数: ${stats.totalChatSessions}
- 总消息数: ${stats.totalMessages}

历史记录:
- 新增历史记录: ${stats.totalHistoryRecords}
- 记录类型: 工作区概览 + 聊天会话详情

项目列表:
${stats.projects.map(project => `  - ${project}`).join('\n')}

数据文件:
- 工作区原始数据: integrated_workspace_chats.json
- 历史记录文件: data/history.json

使用方法:
1. 重启服务器以加载新的历史记录
2. 在主页的"历史记录"标签页查看
3. 或访问 /history.html 查看完整历史记录
        `.trim();
    }
}

// 主执行函数
async function main() {
    const integrator = new WorkspaceChatIntegrator();
    
    try {
        // 获取命令行参数（自定义 Cursor 路径）
        const customPath = process.argv[2];
        
        // 初始化
        await integrator.initialize(customPath);
        
        // 处理和集成数据
        const result = await integrator.processAndIntegrate();
        integrator.integrationData = result;
        
        // 显示报告
        console.log(integrator.generateIntegrationReport());
        
    } catch (error) {
        console.error('❌ 集成过程中发生错误:', error);
        process.exit(1);
    }
}

// 导出模块
module.exports = WorkspaceChatIntegrator;

// 如果直接运行此脚本
if (require.main === module) {
    main();
}