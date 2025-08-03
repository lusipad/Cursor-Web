// 调试workspace数据库内容
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

function debugWorkspace() {
    const cursorStoragePath = path.join(os.homedir(), 'AppData/Roaming/Cursor');
    const workspaceStorage = path.join(cursorStoragePath, 'User/workspaceStorage');
    
    console.log(`🔍 调试Workspace数据库内容`);
    console.log(`📂 工作区存储路径: ${workspaceStorage}`);
    
    if (!fs.existsSync(workspaceStorage)) {
        console.log('❌ 工作区存储目录不存在');
        return;
    }
    
    const workspaceDirs = fs.readdirSync(workspaceStorage);
    console.log(`📁 找到 ${workspaceDirs.length} 个工作区目录`);
    
    // 检查前几个workspace数据库
    for (let i = 0; i < Math.min(3, workspaceDirs.length); i++) {
        const workspaceId = workspaceDirs[i];
        const workspaceDb = path.join(workspaceStorage, workspaceId, 'state.vscdb');
        
        console.log(`\n🔍 === 检查工作区 ${workspaceId} ===`);
        
        if (!fs.existsSync(workspaceDb)) {
            console.log('❌ 数据库文件不存在');
            continue;
        }
        
        try {
            const db = new Database(workspaceDb, { readonly: true });
            
            // 查看所有的键
            console.log('📋 所有键:');
            const allKeys = db.prepare("SELECT key FROM ItemTable LIMIT 20").all();
            allKeys.forEach((row, index) => {
                console.log(`  ${index + 1}. ${row.key}`);
            });
            
            // 特别检查可能包含路径信息的键
            const pathKeys = [
                'history.entries',
                'workbench.panel.explorer.state',
                'workbench.view.explorer',
                'files.workingCopy',
                'workbench.sidebar.viewlets',
                'workbench.main.editor',
                'searchHistory'
            ];
            
            console.log('\n🔎 检查特定键的值:');
            for (const key of pathKeys) {
                const row = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get(key);
                if (row) {
                    try {
                        const data = JSON.parse(row.value);
                        console.log(`✅ ${key}:`);
                        if (key === 'history.entries') {
                            console.log('  entries:', Object.keys(data.entries || {}).length);
                            if (data.entries) {
                                const entries = Object.values(data.entries).slice(0, 3);
                                entries.forEach((entry, idx) => {
                                    console.log(`    ${idx + 1}. ${entry.resource || 'No resource'}`);
                                });
                            }
                        } else {
                            console.log('  类型:', typeof data);
                            if (typeof data === 'object') {
                                console.log('  键:', Object.keys(data).slice(0, 5).join(', '));
                            }
                        }
                    } catch (e) {
                        console.log(`❌ ${key}: 解析JSON失败 - ${e.message}`);
                        console.log(`   原始值: ${row.value.substring(0, 100)}...`);
                    }
                } else {
                    console.log(`⚪ ${key}: 不存在`);
                }
            }
            
            db.close();
            
        } catch (error) {
            console.error(`❌ 处理数据库失败: ${error.message}`);
        }
    }
}

debugWorkspace();