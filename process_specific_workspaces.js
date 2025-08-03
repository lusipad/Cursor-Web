#!/usr/bin/env node

/**
 * 专门用于处理 27 个工作区配置的脚本
 * 支持指定 Cursor 数据路径
 */

const WorkspaceProcessor = require('./workspace_processor');
const fs = require('fs');
const path = require('path');

// 您的 27 个工作区配置 ID
const WORKSPACE_IDS = [
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

class SpecificWorkspaceProcessor extends WorkspaceProcessor {
    constructor(customCursorPath = null) {
        super(customCursorPath);
        this.targetWorkspaceIds = new Set(WORKSPACE_IDS);
    }

    async findWorkspaceDatabases() {
        const cursorPath = this.getCursorStoragePath();
        const workspaceStorage = path.join(cursorPath, 'User', 'workspaceStorage');
        
        this.logger.info(`Looking for specific workspaces in: ${workspaceStorage}`);
        
        if (!await this.pathExists(workspaceStorage)) {
            this.logger.warn(`Workspace storage not found: ${workspaceStorage}`);
            this.logger.info(`请确保 Cursor 数据路径正确，或使用命令行参数指定路径：`);
            this.logger.info(`node process_specific_workspaces.js /path/to/your/cursor/data`);
            return [];
        }

        const workspaces = [];
        const folders = await fs.promises.readdir(workspaceStorage);
        
        for (const folder of folders) {
            // 只处理指定的 27 个工作区 ID
            if (this.targetWorkspaceIds.has(folder)) {
                const workspacePath = path.join(workspaceStorage, folder);
                const stateDb = path.join(workspacePath, 'state.vscdb');
                
                if (await this.pathExists(stateDb)) {
                    workspaces.push({
                        workspace_id: folder,
                        workspace_path: workspacePath,
                        state_db: stateDb
                    });
                    this.logger.info(`✅ 找到目标工作区: ${folder}`);
                } else {
                    this.logger.warn(`⚠️  工作区 ${folder} 存在但没有 state.vscdb 文件`);
                }
            }
        }
        
        // 检查是否有遗漏的工作区
        const foundIds = new Set(workspaces.map(w => w.workspace_id));
        const missingIds = WORKSPACE_IDS.filter(id => !foundIds.has(id));
        
        if (missingIds.length > 0) {
            this.logger.warn(`⚠️  以下工作区未找到：`);
            missingIds.forEach(id => this.logger.warn(`   - ${id}`));
        }
        
        this.logger.info(`Found ${workspaces.length} out of ${WORKSPACE_IDS.length} target workspace databases`);
        return workspaces;
    }

    async processAllWorkspaces() {
        this.logger.info('开始处理指定的 27 个工作区配置...');
        
        const workspaces = await this.findWorkspaceDatabases();
        
        if (workspaces.length === 0) {
            this.logger.warn('没有找到指定的目标工作区');
            this.logger.info('请检查：');
            this.logger.info('1. Cursor 数据路径是否正确');
            this.logger.info('2. 是否有权限访问数据目录');
            this.logger.info('3. 工作区配置是否存在于预期位置');
            return;
        }

        this.logger.info(`总共找到 ${workspaces.length} 个目标工作区配置`);

        // Process each workspace
        for (const workspace of workspaces) {
            await this.processWorkspace(workspace);
        }

        // Process global storage
        await this.processGlobalStorage();

        // Generate summary
        this.generateSummary();
    }
}

// Main execution
async function main() {
    // Get custom path from command line arguments
    const customPath = process.argv[2];
    
    const processor = new SpecificWorkspaceProcessor(customPath);
    
    try {
        await processor.processAllWorkspaces();
        await processor.saveResults('specific_workspace_chats.json');
        
        console.log('\n=== 处理完成 ===');
        console.log(`目标工作区总数: ${WORKSPACE_IDS.length}`);
        console.log(`成功处理: ${processor.workspaceCount}`);
        console.log(`有聊天记录的工作区: ${processor.processedWorkspaces.filter(ws => ws.chat_count > 0).length}`);
        console.log(`总聊天记录数: ${processor.processedWorkspaces.reduce((sum, ws) => sum + ws.chat_count, 0)}`);
        console.log('结果已保存到: specific_workspace_chats.json');
        
    } catch (error) {
        console.error('处理过程中发生错误:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = SpecificWorkspaceProcessor;