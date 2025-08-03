#!/usr/bin/env node

/**
 * Workspace processor based on cursor-view-main implementation
 * Processes all workspace configurations and extracts chat data
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const sqlite3 = require('sqlite3').verbose();
const { promisify } = require('util');

// Utility functions
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const access = promisify(fs.access);

class WorkspaceProcessor {
    constructor() {
        this.workspaceCount = 0;
        this.processedWorkspaces = [];
        this.logger = this.createLogger();
    }

    createLogger() {
        return {
            info: (msg) => console.log(`[INFO] ${msg}`),
            debug: (msg) => console.log(`[DEBUG] ${msg}`),
            error: (msg) => console.error(`[ERROR] ${msg}`),
            warn: (msg) => console.warn(`[WARN] ${msg}`)
        };
    }

    getCursorStoragePath() {
        const platform = os.platform();
        const home = os.homedir();
        
        if (platform === 'darwin') { // macOS
            return path.join(home, 'Library', 'Application Support', 'Cursor');
        } else if (platform === 'win32') { // Windows
            return path.join(home, 'AppData', 'Roaming', 'Cursor');
        } else if (platform === 'linux') { // Linux
            return path.join(home, '.config', 'Cursor');
        } else {
            throw new Error(`Unsupported platform: ${platform}`);
        }
    }

    async findWorkspaceDatabases() {
        const cursorPath = this.getCursorStoragePath();
        const workspaceStorage = path.join(cursorPath, 'User', 'workspaceStorage');
        
        this.logger.info(`Looking for workspaces in: ${workspaceStorage}`);
        
        if (!await this.pathExists(workspaceStorage)) {
            this.logger.warn(`Workspace storage not found: ${workspaceStorage}`);
            return [];
        }

        const workspaces = [];
        const folders = await fs.promises.readdir(workspaceStorage);
        
        for (const folder of folders) {
            const workspacePath = path.join(workspaceStorage, folder);
            const stateDb = path.join(workspacePath, 'state.vscdb');
            
            if (await this.pathExists(stateDb)) {
                workspaces.push({
                    workspace_id: folder,
                    workspace_path: workspacePath,
                    state_db: stateDb
                });
            }
        }
        
        this.logger.info(`Found ${workspaces.length} workspace databases`);
        return workspaces;
    }

    async findGlobalStorageDatabases() {
        const cursorPath = this.getCursorStoragePath();
        const globalStoragePaths = [
            path.join(cursorPath, 'User', 'globalStorage', 'state.vscdb'),
            path.join(cursorPath, 'User', 'globalStorage', 'cursor.cursor'),
            path.join(cursorPath, 'User', 'globalStorage', 'cursor')
        ];

        const databases = [];
        
        for (const storagePath of globalStoragePaths) {
            if (await this.pathExists(storagePath)) {
                if (storagePath.endsWith('.vscdb')) {
                    databases.push(storagePath);
                } else {
                    // Look for .sqlite files in directory
                    try {
                        const files = await fs.promises.readdir(storagePath);
                        for (const file of files) {
                            if (file.endsWith('.sqlite') || file.endsWith('.db')) {
                                databases.push(path.join(storagePath, file));
                            }
                        }
                    } catch (error) {
                        this.logger.debug(`Error reading ${storagePath}: ${error.message}`);
                    }
                }
            }
        }
        
        this.logger.info(`Found ${databases.length} global storage databases`);
        return databases;
    }

    async pathExists(filePath) {
        try {
            await access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    async queryDatabase(dbPath, query, params = []) {
        return new Promise((resolve, reject) => {
            const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
                if (err) {
                    this.logger.debug(`Error opening database ${dbPath}: ${err.message}`);
                    reject(err);
                    return;
                }
            });

            db.all(query, params, (err, rows) => {
                db.close();
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async extractWorkspaceInfo(workspaceDb) {
        try {
            // Get project info from history entries
            const historyEntries = await this.queryDatabase(
                workspaceDb,
                "SELECT value FROM ItemTable WHERE key = 'history.entries'"
            );

            let projectInfo = {
                name: "(unknown)",
                rootPath: "(unknown)"
            };

            if (historyEntries.length > 0) {
                try {
                    const entries = JSON.parse(historyEntries[0].value);
                    const paths = [];
                    
                    for (const entry of entries) {
                        const resource = entry.editor?.resource || '';
                        if (resource.startsWith('file:///')) {
                            paths.push(resource.slice(8)); // Remove 'file:///'
                        }
                    }
                    
                    if (paths.length > 0) {
                        const commonPrefix = this.findCommonPrefix(paths);
                        const projectName = this.extractProjectNameFromPath(commonPrefix);
                        projectInfo = {
                            name: projectName,
                            rootPath: '/' + commonPrefix.replace(/^\/+/, '')
                        };
                    }
                } catch (error) {
                    this.logger.debug(`Error parsing history entries: ${error.message}`);
                }
            }

            // Get composer metadata
            const composerData = await this.queryDatabase(
                workspaceDb,
                "SELECT value FROM ItemTable WHERE key = 'composer.composerData'"
            );

            const composerMeta = {};
            if (composerData.length > 0) {
                try {
                    const data = JSON.parse(composerData[0].value);
                    for (const composer of data.allComposers || []) {
                        composerMeta[composer.composerId] = {
                            title: composer.name || "(untitled)",
                            createdAt: composer.createdAt,
                            lastUpdatedAt: composer.lastUpdatedAt
                        };
                    }
                } catch (error) {
                    this.logger.debug(`Error parsing composer data: ${error.message}`);
                }
            }

            return { projectInfo, composerMeta };
        } catch (error) {
            this.logger.error(`Error extracting workspace info from ${workspaceDb}: ${error.message}`);
            return {
                projectInfo: { name: "(unknown)", rootPath: "(unknown)" },
                composerMeta: {}
            };
        }
    }

    findCommonPrefix(paths) {
        if (paths.length === 0) return '';
        if (paths.length === 1) return paths[0];

        let prefix = paths[0];
        for (let i = 1; i < paths.length; i++) {
            let j = 0;
            while (j < prefix.length && j < paths[i].length && prefix[j] === paths[i][j]) {
                j++;
            }
            prefix = prefix.substring(0, j);
            if (prefix === '') break;
        }

        // Return the directory containing the common prefix
        const lastSlash = prefix.lastIndexOf('/');
        return lastSlash > 0 ? prefix.substring(0, lastSlash) : prefix;
    }

    extractProjectNameFromPath(fullPath) {
        if (!fullPath || fullPath === '/') return 'Root';

        const parts = fullPath.split('/').filter(p => p);
        if (parts.length === 0) return 'Root';

        // Skip user directories and get the project name
        const username = os.userInfo().username;
        const userIndex = parts.findIndex(p => p === username);
        
        if (userIndex >= 0 && userIndex + 1 < parts.length) {
            // Skip common container directories
            const containers = ['Documents', 'Projects', 'Code', 'workspace', 'repos'];
            let projectIndex = parts.length - 1;
            
            while (projectIndex > userIndex && containers.includes(parts[projectIndex])) {
                projectIndex--;
            }
            
            return parts[projectIndex] || 'Unknown Project';
        }

        return parts[parts.length - 1] || 'Unknown Project';
    }

    async extractChatData(dbPath, sourceType = 'workspace') {
        const chats = [];
        
        try {
            // Extract from ItemTable - chat data
            const chatData = await this.queryDatabase(
                dbPath,
                "SELECT value FROM ItemTable WHERE key LIKE 'workbench.panel.aichat.view.aichat.chatdata'"
            );

            if (chatData.length > 0) {
                try {
                    const data = JSON.parse(chatData[0].value);
                    for (const tab of data.tabs || []) {
                        const chat = {
                            session_id: tab.tabId,
                            workspace_id: sourceType,
                            project: { name: sourceType === 'global' ? 'Global Chat' : 'Unknown Project', rootPath: '/' },
                            messages: [],
                            date: new Date().toISOString()
                        };

                        for (const bubble of tab.bubbles || []) {
                            const content = bubble.text || bubble.content || '';
                            if (content) {
                                chat.messages.push({
                                    role: bubble.type === 'user' ? 'user' : 'assistant',
                                    content: content
                                });
                            }
                        }

                        if (chat.messages.length > 0) {
                            chats.push(chat);
                        }
                    }
                } catch (error) {
                    this.logger.debug(`Error parsing chat data: ${error.message}`);
                }
            }

            // Extract from ItemTable - composer data
            const composerData = await this.queryDatabase(
                dbPath,
                "SELECT value FROM ItemTable WHERE key = 'composer.composerData'"
            );

            if (composerData.length > 0) {
                try {
                    const data = JSON.parse(composerData[0].value);
                    for (const composer of data.allComposers || []) {
                        const chat = {
                            session_id: composer.composerId,
                            workspace_id: sourceType,
                            project: { name: sourceType === 'global' ? 'Global Chat' : 'Unknown Project', rootPath: '/' },
                            messages: [],
                            date: new Date().toISOString()
                        };

                        for (const message of composer.messages || []) {
                            if (message.content) {
                                chat.messages.push({
                                    role: message.role,
                                    content: message.content
                                });
                            }
                        }

                        if (chat.messages.length > 0) {
                            chats.push(chat);
                        }
                    }
                } catch (error) {
                    this.logger.debug(`Error parsing composer data: ${error.message}`);
                }
            }

        } catch (error) {
            this.logger.error(`Error extracting chat data from ${dbPath}: ${error.message}`);
        }

        return chats;
    }

    async processWorkspace(workspace) {
        this.logger.info(`📂 处理工作区: ${workspace.workspace_id}`);
        
        try {
            const { projectInfo, composerMeta } = await this.extractWorkspaceInfo(workspace.state_db);
            const chats = await this.extractChatData(workspace.state_db, workspace.workspace_id);

            // Update project info for each chat
            for (const chat of chats) {
                chat.project = projectInfo;
            }

            this.processedWorkspaces.push({
                workspace_id: workspace.workspace_id,
                project_info: projectInfo,
                chat_count: chats.length,
                chats: chats
            });

            this.workspaceCount++;
            
            if (chats.length > 0) {
                this.logger.info(`  - 提取了 ${chats.length} 条聊天记录`);
            } else {
                this.logger.info(`  - 没有找到聊天记录`);
            }

        } catch (error) {
            this.logger.error(`Error processing workspace ${workspace.workspace_id}: ${error.message}`);
        }
    }

    async processGlobalStorage() {
        const globalDbs = await this.findGlobalStorageDatabases();
        
        for (const dbPath of globalDbs) {
            this.logger.info(`📂 处理全局存储: ${path.basename(dbPath)}`);
            
            try {
                const chats = await this.extractChatData(dbPath, 'global');
                
                if (chats.length > 0) {
                    this.processedWorkspaces.push({
                        workspace_id: 'global',
                        project_info: { name: 'Global Storage', rootPath: '/' },
                        chat_count: chats.length,
                        chats: chats
                    });
                    
                    this.logger.info(`  - 提取了 ${chats.length} 条聊天记录`);
                } else {
                    this.logger.info(`  - 没有找到聊天记录`);
                }
            } catch (error) {
                this.logger.error(`Error processing global storage ${dbPath}: ${error.message}`);
            }
        }
    }

    async processAllWorkspaces() {
        this.logger.info('开始处理工作区配置...');
        
        const workspaces = await this.findWorkspaceDatabases();
        
        if (workspaces.length === 0) {
            this.logger.warn('没有找到工作区配置');
            return;
        }

        this.logger.info(`总共找到 ${workspaces.length} 个工作区配置`);

        // Process each workspace
        for (const workspace of workspaces) {
            await this.processWorkspace(workspace);
        }

        // Process global storage
        await this.processGlobalStorage();

        // Generate summary
        this.generateSummary();
    }

    generateSummary() {
        const totalChats = this.processedWorkspaces.reduce((sum, ws) => sum + ws.chat_count, 0);
        const workspacesWithChats = this.processedWorkspaces.filter(ws => ws.chat_count > 0).length;

        console.log('\n=== 处理完成 ===');
        console.log(`总共处理了 ${this.workspaceCount} 个工作区`);
        console.log(`找到 ${workspacesWithChats} 个有聊天记录的工作区`);
        console.log(`总共提取了 ${totalChats} 条聊天记录`);

        if (totalChats === 0) {
            console.log('没有找到数据');
        }
    }

    async saveResults(outputPath = 'workspace_chats.json') {
        const results = {
            summary: {
                total_workspaces: this.workspaceCount,
                workspaces_with_chats: this.processedWorkspaces.filter(ws => ws.chat_count > 0).length,
                total_chats: this.processedWorkspaces.reduce((sum, ws) => sum + ws.chat_count, 0),
                processed_at: new Date().toISOString()
            },
            workspaces: this.processedWorkspaces
        };

        try {
            await writeFile(outputPath, JSON.stringify(results, null, 2));
            this.logger.info(`结果已保存到: ${outputPath}`);
        } catch (error) {
            this.logger.error(`Error saving results: ${error.message}`);
        }
    }
}

// Main execution
async function main() {
    const processor = new WorkspaceProcessor();
    
    try {
        await processor.processAllWorkspaces();
        await processor.saveResults();
    } catch (error) {
        console.error('处理过程中发生错误:', error);
        process.exit(1);
    }
}

// Export for use as module
module.exports = WorkspaceProcessor;

// Run if called directly
if (require.main === module) {
    main();
}