/**
 * 测试工具类
 * 提供通用的测试辅助功能
 */

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const testConfig = require('./test-config');

class TestUtils {
    /**
     * 创建WebSocket连接
     * @param {string} instanceId - 实例ID
     * @param {string} role - 角色
     * @param {number} timeout - 连接超时时间
     * @returns {Promise<WebSocket>}
     */
    static async createWebSocketConnection(instanceId, role = 'cursor', timeout = 5000) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(testConfig.server.wsUrl);
            let isRegistered = false;
            
            const timeoutId = setTimeout(() => {
                if (!isRegistered) {
                    ws.close();
                    reject(new Error(`连接超时: ${instanceId}`));
                }
            }, timeout);
            
            ws.on('open', () => {
                // 发送注册消息
                ws.send(JSON.stringify({
                    type: 'register',
                    instanceId: instanceId,
                    role: role
                }));
            });
            
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    if (message.type === 'register_ack' && !isRegistered) {
                        isRegistered = true;
                        clearTimeout(timeoutId);
                        resolve(ws);
                    }
                } catch (error) {
                    console.error('解析消息失败:', error);
                }
            });
            
            ws.on('error', (error) => {
                clearTimeout(timeoutId);
                reject(error);
            });
        });
    }
    
    /**
     * 发送消息并等待确认
     * @param {WebSocket} ws - WebSocket连接
     * @param {Object} message - 消息对象
     * @param {number} timeout - 等待超时时间
     * @returns {Promise<Object>}
     */
    static async sendMessageAndWait(ws, message, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const msgId = Date.now() + Math.random();
            message.msgId = msgId;
            
            let deliveryAck = false;
            let assistantHint = false;
            let deliveryError = false;
            let errorReason = null;
            
            const timeoutId = setTimeout(() => {
                reject(new Error('消息等待超时'));
            }, timeout);
            
            const messageHandler = (data) => {
                try {
                    const response = JSON.parse(data);
                    
                    if (response.msgId === msgId) {
                        switch (response.type) {
                            case 'delivery_ack':
                                deliveryAck = true;
                                break;
                            case 'assistant_hint':
                                assistantHint = true;
                                break;
                            case 'delivery_error':
                                deliveryError = true;
                                errorReason = response.reason || '未知错误';
                                break;
                        }
                        
                        // 检查是否满足成功条件
                        if (deliveryError) {
                            clearTimeout(timeoutId);
                            ws.removeListener('message', messageHandler);
                            reject(new Error(`消息发送失败: ${errorReason}`));
                        } else if (deliveryAck || assistantHint) {
                            clearTimeout(timeoutId);
                            ws.removeListener('message', messageHandler);
                            resolve({
                                success: true,
                                deliveryAck,
                                assistantHint,
                                msgId
                            });
                        }
                    }
                } catch (error) {
                    console.error('解析响应消息失败:', error);
                }
            };
            
            ws.on('message', messageHandler);
            ws.send(JSON.stringify(message));
        });
    }
    
    /**
     * 等待指定时间
     * @param {number} ms - 等待时间（毫秒）
     * @returns {Promise<void>}
     */
    static async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * 生成测试报告
     * @param {Object} testResults - 测试结果
     * @param {string} outputPath - 输出路径
     * @returns {Promise<void>}
     */
    static async generateTestReport(testResults, outputPath) {
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalTests: testResults.totalTests || 0,
                passedTests: testResults.passedTests || 0,
                failedTests: testResults.failedTests || 0,
                successRate: testResults.successRate || 0
            },
            details: testResults.details || [],
            environment: {
                nodeVersion: process.version,
                platform: process.platform,
                serverConfig: testConfig.server
            }
        };
        
        // 确保输出目录存在
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        // 写入JSON报告
        await fs.promises.writeFile(outputPath, JSON.stringify(report, null, 2));
        
        // 如果配置了HTML格式，也生成HTML报告
        if (testConfig.reporting.formats.includes('html')) {
            const htmlPath = outputPath.replace('.json', '.html');
            const htmlContent = this.generateHtmlReport(report);
            await fs.promises.writeFile(htmlPath, htmlContent);
        }
    }
    
    /**
     * 生成HTML格式的测试报告
     * @param {Object} report - 报告数据
     * @returns {string}
     */
    static generateHtmlReport(report) {
        return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>测试报告</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .summary { display: flex; gap: 20px; margin: 20px 0; }
        .metric { background: #e9ecef; padding: 15px; border-radius: 5px; text-align: center; }
        .metric.success { background: #d4edda; }
        .metric.failure { background: #f8d7da; }
        .details { margin-top: 20px; }
        .test-item { margin: 10px 0; padding: 10px; border-left: 4px solid #ccc; }
        .test-item.passed { border-left-color: #28a745; }
        .test-item.failed { border-left-color: #dc3545; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Cursor Web 测试报告</h1>
        <p>生成时间: ${report.timestamp}</p>
    </div>
    
    <div class="summary">
        <div class="metric">
            <h3>总测试数</h3>
            <p>${report.summary.totalTests}</p>
        </div>
        <div class="metric success">
            <h3>通过测试</h3>
            <p>${report.summary.passedTests}</p>
        </div>
        <div class="metric failure">
            <h3>失败测试</h3>
            <p>${report.summary.failedTests}</p>
        </div>
        <div class="metric">
            <h3>成功率</h3>
            <p>${report.summary.successRate}%</p>
        </div>
    </div>
    
    <div class="details">
        <h2>测试详情</h2>
        ${report.details.map(test => `
            <div class="test-item ${test.success ? 'passed' : 'failed'}">
                <h4>${test.name || '未命名测试'}</h4>
                <p>状态: ${test.success ? '通过' : '失败'}</p>
                ${test.error ? `<p>错误: ${test.error}</p>` : ''}
                ${test.duration ? `<p>耗时: ${test.duration}ms</p>` : ''}
            </div>
        `).join('')}
    </div>
    
    <div class="environment">
        <h2>环境信息</h2>
        <p>Node.js版本: ${report.environment.nodeVersion}</p>
        <p>平台: ${report.environment.platform}</p>
        <p>服务器: ${report.environment.serverConfig.baseUrl}</p>
    </div>
</body>
</html>
        `;
    }
    
    /**
     * 验证服务器是否运行
     * @returns {Promise<boolean>}
     */
    static async isServerRunning() {
        try {
            const response = await fetch(`${testConfig.server.baseUrl}/health`);
            return response.ok;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * 清理测试资源
     * @param {Array<WebSocket>} connections - WebSocket连接数组
     */
    static cleanupConnections(connections) {
        connections.forEach(ws => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        });
    }
    
    /**
     * 格式化测试结果
     * @param {Object} results - 原始测试结果
     * @returns {Object}
     */
    static formatTestResults(results) {
        return {
            totalTests: results.totalTests || 0,
            passedTests: results.passedTests || 0,
            failedTests: results.failedTests || 0,
            successRate: results.successRate || 0,
            details: results.details || [],
            duration: results.duration || 0,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = TestUtils;