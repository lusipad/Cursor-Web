#!/usr/bin/env node

/**
 * Test script for workspace processor with mock data
 */

const WorkspaceProcessor = require('./workspace_processor');

class TestWorkspaceProcessor extends WorkspaceProcessor {
    constructor() {
        super();
        this.mockData = this.createMockData();
    }

    createMockData() {
        // Create mock workspace data that matches the 27 workspace IDs from the user
        const workspaceIds = [
            '01fea5ca601895f83a1944fe2f5e1969',
            '053d1e69746c5c3c761194f970b30726',
            '141b9fe1d5b9492c4e3164f842889e87',
            '1754180913505',
            '3af1ee911d5734d851239cff10744fe9',
            '4387d4ceaebe33b9c7705533effcc6b4',
            '4d72e3c523c7d9210c5f4cde52c09317',
            '526ab2fb2ec38eba2139e685ea73c850',
            '720e2a6032a336b762623d0d6311cd5b',
            '73c85449bddff1c7206913c61661ae58',
            '7c88bac0a9c7319f148c0df644f06a54',
            '83fcc12bc1813d7b2fe900720fec6345',
            '9fe16d945c1cc999808cc34adab7f039',
            'a3adbd77e5cefeae98ddfabeadadeb09',
            'a4b38d474d12fabb20619e5e6c451f2a',
            'ae0bb40ddf908e1339537d475fbe082a',
            'c096ebc03987f7ee16127eb1e5b65760',
            'c5583557dad8a8bce04a8c8d97f6dc92',
            'cd02cb52fd7ec9e5d4b76bd5bb4603d4',
            'd7a22208304ecce3296a1a756b74067d',
            'dab906f43241c1a4ed99ddcdd2ceaf2f',
            'e29778869b635c8bae5bd1b3a3fc2937',
            'e71ed70bdea26a10240825908171705b',
            'ec231fd6f1e55cd68df4e2f74f845509',
            'ext-dev',
            'f3ea30577df7bc66c9310841057a41b7',
            'ffbd04b85024db14e143bc29283711a6'
        ];

        return workspaceIds.map((id, index) => ({
            workspace_id: id,
            workspace_path: `/mock/workspace/${id}`,
            state_db: `/mock/workspace/${id}/state.vscdb`,
            project_info: {
                name: `Project ${index + 1}`,
                rootPath: `/projects/project${index + 1}`
            },
            chat_count: Math.floor(Math.random() * 5) + 1, // 1-5 chats per workspace
            chats: this.generateMockChats(id, index)
        }));
    }

    generateMockChats(workspaceId, projectIndex) {
        const chatCount = Math.floor(Math.random() * 5) + 1;
        const chats = [];
        
        for (let i = 0; i < chatCount; i++) {
            chats.push({
                session_id: `${workspaceId}_chat_${i}`,
                workspace_id: workspaceId,
                project: {
                    name: `Project ${projectIndex + 1}`,
                    rootPath: `/projects/project${projectIndex + 1}`
                },
                messages: [
                    {
                        role: 'user',
                        content: `Hello, can you help me with Project ${projectIndex + 1}?`
                    },
                    {
                        role: 'assistant',
                        content: `Of course! I'd be happy to help you with Project ${projectIndex + 1}. What specific assistance do you need?`
                    }
                ],
                date: new Date().toISOString()
            });
        }
        
        return chats;
    }

    async findWorkspaceDatabases() {
        // Return mock workspace data
        this.logger.info(`Looking for workspaces in: /mock/workspace`);
        this.logger.info(`Found ${this.mockData.length} workspace databases`);
        
        return this.mockData.map(workspace => ({
            workspace_id: workspace.workspace_id,
            workspace_path: workspace.workspace_path,
            state_db: workspace.state_db
        }));
    }

    async processWorkspace(workspace) {
        this.logger.info(`📂 处理工作区: ${workspace.workspace_id}`);
        
        // Find the corresponding mock data
        const mockWorkspace = this.mockData.find(w => w.workspace_id === workspace.workspace_id);
        
        if (mockWorkspace) {
            this.processedWorkspaces.push(mockWorkspace);
            this.workspaceCount++;
            
            if (mockWorkspace.chat_count > 0) {
                this.logger.info(`  - 提取了 ${mockWorkspace.chat_count} 条聊天记录`);
            } else {
                this.logger.info(`  - 没有找到聊天记录`);
            }
        }
    }

    async processGlobalStorage() {
        // Skip global storage for mock test
        this.logger.info('📂 处理全局存储: (跳过 - 模拟数据)');
    }
}

// Main execution
async function main() {
    const processor = new TestWorkspaceProcessor();
    
    try {
        await processor.processAllWorkspaces();
        await processor.saveResults('mock_workspace_chats.json');
        
        console.log('\n=== 模拟测试完成 ===');
        console.log(`模拟处理了 ${processor.workspaceCount} 个工作区`);
        console.log(`找到 ${processor.processedWorkspaces.filter(ws => ws.chat_count > 0).length} 个有聊天记录的工作区`);
        console.log(`总共提取了 ${processor.processedWorkspaces.reduce((sum, ws) => sum + ws.chat_count, 0)} 条聊天记录`);
        
    } catch (error) {
        console.error('测试过程中发生错误:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}