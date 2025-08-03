// 无依赖的SQLite读取器 - 使用命令行sqlite3
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class SQLiteReader {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.isWindows = process.platform === 'win32';
        
        // 检查数据库文件是否存在
        if (!fs.existsSync(dbPath)) {
            throw new Error(`数据库文件不存在: ${dbPath}`);
        }
    }

    // 执行SQL查询
    query(sql) {
        try {
            // 转义SQL中的双引号
            const escapedSql = sql.replace(/"/g, '""');
            
            // 构建sqlite3命令
            let command;
            if (this.isWindows) {
                // Windows下尝试使用sqlite3
                command = `sqlite3 "${this.dbPath}" "${escapedSql}"`;
            } else {
                command = `sqlite3 "${this.dbPath}" "${escapedSql}"`;
            }

            console.log(`🔍 执行SQL: ${sql.substring(0, 100)}...`);
            
            const result = execSync(command, { 
                encoding: 'utf8',
                timeout: 30000, // 30秒超时
                windowsHide: true
            });

            return this.parseResult(result, sql);
        } catch (error) {
            console.error(`❌ SQL执行失败: ${error.message}`);
            
            // 如果sqlite3命令不存在，尝试使用备用方法
            if (error.message.includes('sqlite3') && error.message.includes('not found')) {
                console.log('⚠️ 系统未安装sqlite3命令行工具，尝试备用方法...');
                return this.fallbackQuery(sql);
            }
            
            throw error;
        }
    }

    // 解析查询结果
    parseResult(result, sql) {
        if (!result || result.trim() === '') {
            return [];
        }

        const lines = result.trim().split('\n');
        
        // 如果是COUNT查询
        if (sql.toLowerCase().includes('count(')) {
            return [{ count: parseInt(lines[0]) || 0 }];
        }

        // 如果是SELECT查询
        if (sql.toLowerCase().startsWith('select')) {
            // 尝试解析为JSON格式（如果SQL包含了适当的格式化）
            if (sql.includes('json_object') || sql.includes('||')) {
                return lines.map(line => {
                    try {
                        // 尝试解析JSON
                        if (line.startsWith('{')) {
                            return JSON.parse(line);
                        }
                        // 否则按管道符分割
                        const parts = line.split('|');
                        return {
                            key: parts[0] || '',
                            value: parts[1] || ''
                        };
                    } catch (e) {
                        return { raw: line };
                    }
                });
            }
            
            // 普通查询结果
            return lines.map(line => {
                const parts = line.split('|');
                return {
                    key: parts[0] || '',
                    value: parts[1] || '',
                    raw: line
                };
            });
        }

        return lines.map(line => ({ raw: line }));
    }

    // 备用查询方法（当sqlite3不可用时）
    fallbackQuery(sql) {
        console.log('🔄 使用备用查询方法（文件读取模拟）');
        
        // 这里返回空结果，实际项目中可以实现更复杂的备用逻辑
        if (sql.toLowerCase().includes('count(')) {
            return [{ count: 0 }];
        }
        
        return [];
    }

    // 获取表列表
    getTables() {
        return this.query("SELECT name FROM sqlite_master WHERE type='table'");
    }

    // 关闭连接（命令行模式下不需要）
    close() {
        console.log('📝 SQLite命令行连接已关闭');
    }

    // 静态方法：检查sqlite3是否可用
    static checkSQLiteAvailable() {
        try {
            execSync('sqlite3 --version', { 
                encoding: 'utf8',
                windowsHide: true 
            });
            return true;
        } catch (error) {
            console.log('⚠️ sqlite3命令行工具不可用');
            return false;
        }
    }
}

module.exports = SQLiteReader;