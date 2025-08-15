/*
 * 综合测试脚本 - Cursor Web 系统完整功能测试
 * 测试覆盖：WebSocket连接、消息传递、注入脚本、API接口、历史记录等
 */

const WebSocket = require('ws');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class CursorWebTester {
  constructor() {
    this.serverUrl = 'http://127.0.0.1:3000';
    this.wsUrl = 'ws://127.0.0.1:3000';
    this.testResults = [];
    this.webSocket = null;
    this.testInstanceId = 'test-instance-' + Date.now();
  }

  // 记录测试结果
  logResult(testName, passed, message = '') {
    const result = {
      test: testName,
      passed,
      message,
      timestamp: new Date().toISOString()
    };
    this.testResults.push(result);
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${testName}: ${message}`);
  }

  // 等待指定时间
  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 测试HTTP服务器连接
  async testServerConnection() {
    console.log('\n🔍 测试服务器连接...');
    try {
      const response = await this.httpRequest('GET', '/');
      this.logResult('服务器连接', response.statusCode === 200, `状态码: ${response.statusCode}`);
    } catch (error) {
      this.logResult('服务器连接', false, `错误: ${error.message}`);
    }
  }

  // 测试API接口
  async testApiEndpoints() {
    console.log('\n🔍 测试API接口...');
    
    const endpoints = [
      { path: '/api/test', method: 'GET', name: 'API测试接口' },
      { path: '/api/status', method: 'GET', name: 'API状态接口' },
      { path: '/api/inject/processes', method: 'GET', name: '注入进程接口' },
      { path: '/api/history/chats', method: 'GET', name: '聊天历史接口' }
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await this.httpRequest(endpoint.method, endpoint.path);
        this.logResult(endpoint.name, response.statusCode === 200, `状态码: ${response.statusCode}`);
      } catch (error) {
        this.logResult(endpoint.name, false, `错误: ${error.message}`);
      }
    }
  }

  // 测试WebSocket连接
  async testWebSocketConnection() {
    console.log('\n🔍 测试WebSocket连接...');
    
    return new Promise((resolve) => {
      try {
        this.webSocket = new WebSocket(this.wsUrl);
        
        const timeout = setTimeout(() => {
          this.logResult('WebSocket连接', false, '连接超时');
          resolve();
        }, 5000);

        this.webSocket.on('open', () => {
          clearTimeout(timeout);
          this.logResult('WebSocket连接', true, '连接成功');
          resolve();
        });

        this.webSocket.on('error', (error) => {
          clearTimeout(timeout);
          this.logResult('WebSocket连接', false, `连接错误: ${error.message}`);
          resolve();
        });
      } catch (error) {
        this.logResult('WebSocket连接', false, `异常: ${error.message}`);
        resolve();
      }
    });
  }

  // 测试WebSocket注册
  async testWebSocketRegistration() {
    console.log('\n🔍 测试WebSocket注册...');
    
    if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) {
      this.logResult('WebSocket注册', false, 'WebSocket未连接');
      return;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.logResult('WebSocket注册', false, '注册超时');
        resolve();
      }, 3000);

      this.webSocket.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'register_ack') {
            clearTimeout(timeout);
            this.logResult('WebSocket注册', true, `注册成功: ${message.role}`);
            resolve();
          }
        } catch (error) {
          // 忽略解析错误
        }
      });

      // 发送注册消息
      const registerMessage = {
        type: 'register',
        role: 'web',
        instanceId: this.testInstanceId,
        injected: false
      };
      
      this.webSocket.send(JSON.stringify(registerMessage));
    });
  }

  // 测试消息发送
  async testMessageSending() {
    console.log('\n🔍 测试消息发送...');
    
    if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) {
      this.logResult('消息发送', false, 'WebSocket未连接');
      return;
    }

    try {
      const testMessage = {
        type: 'user_message',
        data: '这是一条测试消息',
        targetInstanceId: 'default',
        msgId: 'test-msg-' + Date.now()
      };
      
      this.webSocket.send(JSON.stringify(testMessage));
      this.logResult('消息发送', true, '消息已发送');
      
      // 等待可能的响应
      await this.wait(1000);
    } catch (error) {
      this.logResult('消息发送', false, `发送失败: ${error.message}`);
    }
  }

  // 测试注入脚本文件
  async testInjectionScripts() {
    console.log('\n🔍 测试注入脚本文件...');
    
    const scripts = [
      { path: 'public/cursor-browser.js', name: '主注入脚本' },
      { path: 'public/inject-lite.js', name: '轻量注入脚本' },
      { path: 'scripts/auto-inject-cursor.js', name: '自动注入脚本' }
    ];

    for (const script of scripts) {
      const fullPath = path.join(__dirname, '..', script.path);
      try {
        const exists = fs.existsSync(fullPath);
        if (exists) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const hasWebSocket = content.includes('WebSocket');
          const hasRegister = content.includes('register');
          
          this.logResult(script.name, hasWebSocket && hasRegister, 
            `文件存在，包含WebSocket: ${hasWebSocket}, 包含注册: ${hasRegister}`);
        } else {
          this.logResult(script.name, false, '文件不存在');
        }
      } catch (error) {
        this.logResult(script.name, false, `读取错误: ${error.message}`);
      }
    }
  }

  // 测试静态文件访问
  async testStaticFiles() {
    console.log('\n🔍 测试静态文件访问...');
    
    const files = [
      '/index.html',
      '/chat.html',
      '/script.html',
      '/style.css',
      '/js/SimpleWebClient.js',
      '/cursor-browser.js',
      '/inject-lite.js'
    ];

    for (const file of files) {
      try {
        const response = await this.httpRequest('GET', file);
        this.logResult(`静态文件${file}`, response.statusCode === 200, 
          `状态码: ${response.statusCode}`);
      } catch (error) {
        this.logResult(`静态文件${file}`, false, `错误: ${error.message}`);
      }
    }
  }

  // 测试POST API
  async testPostApi() {
    console.log('\n🔍 测试POST API...');
    
    try {
      const testData = {
        content: '测试内容',
        instanceId: this.testInstanceId
      };
      
      const response = await this.httpRequest('POST', '/api/content', testData);
      this.logResult('POST API', response.statusCode === 200, 
        `状态码: ${response.statusCode}`);
    } catch (error) {
      this.logResult('POST API', false, `错误: ${error.message}`);
    }
  }

  // HTTP请求辅助方法
  httpRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.serverUrl);
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: method,
        headers: {
          'User-Agent': 'CursorWebTester/1.0'
        }
      };

      if (data) {
        const postData = JSON.stringify(data);
        options.headers['Content-Type'] = 'application/json';
        options.headers['Content-Length'] = Buffer.byteLength(postData);
      }

      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body, headers: res.headers });
        });
      });

      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('请求超时'));
      });

      if (data) {
        req.write(JSON.stringify(data));
      }
      req.end();
    });
  }

  // 生成测试报告
  generateReport() {
    console.log('\n📊 测试报告');
    console.log('=' * 50);
    
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;
    const successRate = totalTests > 0 ? (passedTests / totalTests * 100).toFixed(1) : 0;

    console.log(`总测试数: ${totalTests}`);
    console.log(`通过: ${passedTests}`);
    console.log(`失败: ${failedTests}`);
    console.log(`成功率: ${successRate}%`);
    
    if (failedTests > 0) {
      console.log('\n❌ 失败的测试:');
      this.testResults.filter(r => !r.passed).forEach(r => {
        console.log(`  - ${r.test}: ${r.message}`);
      });
    }

    console.log('\n📝 详细结果:');
    this.testResults.forEach(r => {
      const status = r.passed ? '✅' : '❌';
      console.log(`  ${status} ${r.test}: ${r.message}`);
    });

    // 保存报告到文件
    const reportPath = path.join(__dirname, 'test-report.json');
    const report = {
      timestamp: new Date().toISOString(),
      summary: { totalTests, passedTests, failedTests, successRate },
      results: this.testResults
    };
    
    try {
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`\n📄 测试报告已保存到: ${reportPath}`);
    } catch (error) {
      console.log(`\n⚠️ 无法保存测试报告: ${error.message}`);
    }

    return successRate >= 80; // 80%以上通过率视为成功
  }

  // 清理资源
  cleanup() {
    if (this.webSocket) {
      try {
        this.webSocket.close();
      } catch (error) {
        // 忽略关闭错误
      }
    }
  }

  // 运行所有测试
  async runAllTests() {
    console.log('🚀 开始Cursor Web系统综合测试...');
    console.log(`测试实例ID: ${this.testInstanceId}`);
    
    try {
      // 基础连接测试
      await this.testServerConnection();
      await this.wait(500);
      
      // API接口测试
      await this.testApiEndpoints();
      await this.wait(500);
      
      // WebSocket测试
      await this.testWebSocketConnection();
      await this.wait(1000);
      
      await this.testWebSocketRegistration();
      await this.wait(1000);
      
      await this.testMessageSending();
      await this.wait(1000);
      
      // 文件和脚本测试
      await this.testInjectionScripts();
      await this.wait(500);
      
      await this.testStaticFiles();
      await this.wait(500);
      
      // POST API测试
      await this.testPostApi();
      await this.wait(500);
      
    } catch (error) {
      console.error('测试过程中发生错误:', error);
      this.logResult('测试执行', false, `异常: ${error.message}`);
    } finally {
      this.cleanup();
    }
    
    // 生成报告
    const success = this.generateReport();
    
    console.log('\n🏁 测试完成!');
    process.exit(success ? 0 : 1);
  }
}

// 主函数
async function main() {
  const tester = new CursorWebTester();
  
  // 检查服务器是否运行
  try {
    const response = await tester.httpRequest('GET', '/');
    console.log(`✅ 服务器连接成功 (状态码: ${response.statusCode})`);
  } catch (error) {
    console.error('❌ 服务器未运行，请先启动服务器: npm run dev');
    console.error('错误详情:', error.message);
    process.exit(1);
  }
  
  await tester.runAllTests();
}

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
  process.exit(1);
});

// 运行测试
if (require.main === module) {
  main();
}

module.exports = CursorWebTester;