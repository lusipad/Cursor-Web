/*
 * 简化的消息发送测试
 * 通过HTTP API测试消息发送功能
 */

const http = require('http');

class SimpleSendTest {
  constructor() {
    this.baseUrl = 'http://127.0.0.1:3000';
    this.testResults = [];
  }

  async httpRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SimpleSendTest/1.0'
        }
      };

      if (data) {
        const jsonData = JSON.stringify(data);
        options.headers['Content-Length'] = Buffer.byteLength(jsonData);
      }

      const req = http.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            const result = {
              statusCode: res.statusCode,
              headers: res.headers,
              data: responseData
            };
            
            if (res.headers['content-type']?.includes('application/json')) {
              try {
                result.json = JSON.parse(responseData);
              } catch (e) {
                // 忽略JSON解析错误
              }
            }
            
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('请求超时'));
      });

      if (data) {
        req.write(JSON.stringify(data));
      }
      
      req.end();
    });
  }

  async testServerConnection() {
    console.log('🔗 测试服务器连接...');
    try {
      const response = await this.httpRequest('GET', '/api/test');
      console.log(`✅ 服务器连接成功 (状态码: ${response.statusCode})`);
      return true;
    } catch (error) {
      console.log(`❌ 服务器连接失败: ${error.message}`);
      return false;
    }
  }

  async testGetStatus() {
    console.log('📊 获取系统状态...');
    try {
      const response = await this.httpRequest('GET', '/api/status');
      console.log(`✅ 状态获取成功 (状态码: ${response.statusCode})`);
      if (response.json) {
        console.log('📋 系统状态:', JSON.stringify(response.json, null, 2));
        return response.json;
      }
      return response.data;
    } catch (error) {
      console.log(`❌ 状态获取失败: ${error.message}`);
      return null;
    }
  }

  async testSendMessage(content, targetInstance = 'default') {
    console.log(`📤 发送消息: "${content}"`);
    const messageData = {
      type: 'html_content',
      data: {
        html: content,
        timestamp: Date.now(),
        url: 'test-sender'
      }
    };
    
    try {
      const response = await this.httpRequest('POST', '/api/content', messageData);
      console.log(`✅ 消息发送成功 (状态码: ${response.statusCode})`);
      
      if (response.json) {
        console.log('📋 响应数据:', JSON.stringify(response.json, null, 2));
        return response.json;
      } else {
        console.log('📋 响应内容:', response.data);
        return { success: true, response: response.data };
      }
    } catch (error) {
      console.log(`❌ 消息发送失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async testGetClients() {
    console.log('👥 获取客户端列表...');
    try {
      const response = await this.httpRequest('GET', '/api/clients');
      console.log(`✅ 客户端列表获取成功 (状态码: ${response.statusCode})`);
      if (response.json) {
        console.log('📋 客户端列表:', JSON.stringify(response.json, null, 2));
        return response.json;
      }
      return response.data;
    } catch (error) {
      console.log(`❌ 客户端列表获取失败: ${error.message}`);
      return null;
    }
  }

  async runFullTest() {
    console.log('🧪 开始完整的消息发送测试...');
    console.log('=' * 50);
    
    // 1. 测试服务器连接
    const serverOk = await this.testServerConnection();
    if (!serverOk) {
      console.log('❌ 服务器连接失败，测试终止');
      return;
    }
    
    console.log('');
    
    // 2. 获取系统状态
    const status = await this.testGetStatus();
    console.log('');
    
    // 3. 获取客户端列表
    const clients = await this.testGetClients();
    console.log('');
    
    // 4. 发送测试消息
    const testMessages = [
      '你好，这是一条测试消息',
      'Hello, this is a test message',
      '请帮我写一个Hello World程序',
      '测试消息发送和反馈机制'
    ];
    
    console.log('📤 开始发送测试消息...');
    for (let i = 0; i < testMessages.length; i++) {
      const message = testMessages[i];
      console.log(`\n📨 测试消息 ${i + 1}/${testMessages.length}:`);
      const result = await this.testSendMessage(message);
      this.testResults.push({
        message: message,
        result: result,
        timestamp: Date.now()
      });
      
      // 等待1秒再发送下一条
      await this.wait(1000);
    }
    
    console.log('\n📊 测试结果汇总:');
    console.log('=' * 50);
    
    const successCount = this.testResults.filter(r => r.result.success !== false).length;
    const totalCount = this.testResults.length;
    
    console.log(`✅ 成功发送: ${successCount}/${totalCount} 条消息`);
    console.log(`📈 成功率: ${(successCount / totalCount * 100).toFixed(1)}%`);
    
    if (successCount < totalCount) {
      console.log('\n❌ 失败的消息:');
      this.testResults.filter(r => r.result.success === false).forEach((r, i) => {
        console.log(`  ${i + 1}. "${r.message}" - ${r.result.error}`);
      });
    }
    
    console.log('\n🏁 测试完成!');
  }

  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async start() {
    try {
      console.log('🚀 启动简化消息发送测试器...');
      console.log(`🌐 目标服务器: ${this.baseUrl}`);
      console.log('');
      
      await this.runFullTest();
      
    } catch (error) {
      console.error('❌ 测试器启动失败:', error.message);
      process.exit(1);
    }
  }
}

// 主函数
async function main() {
  const tester = new SimpleSendTest();
  await tester.start();
}

// 运行测试器
if (require.main === module) {
  main();
}

module.exports = SimpleSendTest;