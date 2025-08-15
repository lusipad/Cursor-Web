#!/usr/bin/env node

/**
 * 端到端消息传递测试
 * 测试从Web界面发送消息到Cursor客户端，并验证反馈机制
 */

const WebSocket = require('ws');
const http = require('http');

class EndToEndTest {
  constructor() {
    this.ws = null;
    this.testResults = {
      messagesSent: 0,
      feedbackReceived: 0,
      deliveryAcks: 0,
      assistantHints: 0,
      contentSyncs: 0,
      errors: 0
    };
    this.testMessages = [
      "你好，这是端到端测试消息 1",
      "Hello, this is end-to-end test message 2", 
      "请帮我写一个简单的Python函数",
      "测试Cursor Web系统的完整消息传递流程"
    ];
    this.instanceId = `e2e-test-${Date.now()}`;
  }

  log(message) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${message}`);
  }

  async connectWebSocket() {
    return new Promise((resolve, reject) => {
      this.log('🔗 连接到WebSocket服务器...');
      this.ws = new WebSocket('ws://127.0.0.1:3000');
      
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket连接超时'));
      }, 10000);

      this.ws.on('open', () => {
        clearTimeout(timeout);
        this.log('✅ WebSocket连接成功');
        resolve();
      });

      this.ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          this.log(`❌ 解析消息失败: ${error.message}`);
        }
      });
    });
  }

  handleMessage(message) {
    this.log(`📥 收到消息: ${JSON.stringify(message, null, 2)}`);
    
    switch (message.type) {
      case 'register_ack':
        if (message.ok) {
          this.log(`✅ 注册确认: ${message.role} (${message.instanceId})`);
        }
        break;
        
      case 'delivery_ack':
        this.testResults.deliveryAcks++;
        this.testResults.feedbackReceived++;
        this.log(`✅ 投递确认: ${message.msgId}`);
        break;
        
      case 'delivery_error':
        this.testResults.errors++;
        this.log(`❌ 投递失败: ${message.msgId} - ${message.reason}`);
        break;
        
      case 'assistant_hint':
        this.testResults.assistantHints++;
        this.testResults.feedbackReceived++;
        this.log(`💡 助手提示: ${message.msgId}`);
        break;
        
      case 'content_sync':
        this.testResults.contentSyncs++;
        this.testResults.feedbackReceived++;
        this.log(`🔄 内容同步: ${message.content?.substring(0, 50)}...`);
        break;
        
      case 'clients_update':
        this.log(`👥 客户端更新: ${message.data?.length || 0} 个客户端`);
        break;
        
      default:
        this.log(`ℹ️ 未知消息类型: ${message.type}`);
    }
  }

  async registerClient() {
    return new Promise((resolve) => {
      this.log('📝 注册Web客户端...');
      const registerMessage = {
        type: 'register',
        role: 'web',
        instanceId: 'default' // 使用default来接收反馈消息
      };
      
      this.ws.send(JSON.stringify(registerMessage));
      
      // 等待注册确认
      setTimeout(resolve, 1000);
    });
  }

  async sendTestMessages() {
    this.log('🧪 开始发送测试消息...');
    
    for (let i = 0; i < this.testMessages.length; i++) {
      const message = this.testMessages[i];
      const messageId = `e2e-msg-${i + 1}-${Date.now()}`;
      
      this.log(`📤 发送测试消息 ${i + 1}/${this.testMessages.length}`);
      this.log(`📤 消息内容: "${message}"`);
      
      const userMessage = {
        type: 'user_message',
        targetInstanceId: 'default', // 发送到default实例
        msgId: messageId,
        data: message,
        timestamp: Date.now()
      };
      
      this.ws.send(JSON.stringify(userMessage));
      this.testResults.messagesSent++;
      
      // 消息间隔
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  async waitForFeedback(timeoutMs = 15000) {
    this.log('⏳ 等待反馈...');
    
    return new Promise((resolve) => {
      setTimeout(() => {
        this.log('⏰ 反馈等待时间结束');
        resolve();
      }, timeoutMs);
    });
  }

  printResults() {
    this.log('\n📊 端到端测试结果:');
    this.log(`📤 发送消息: ${this.testResults.messagesSent}个`);
    this.log(`📥 收到反馈: ${this.testResults.feedbackReceived}个`);
    this.log(`✅ 投递确认: ${this.testResults.deliveryAcks}个`);
    this.log(`💡 助手提示: ${this.testResults.assistantHints}个`);
    this.log(`🔄 内容同步: ${this.testResults.contentSyncs}个`);
    this.log(`❌ 错误数量: ${this.testResults.errors}个`);
    
    const successRate = this.testResults.messagesSent > 0 
      ? ((this.testResults.feedbackReceived / this.testResults.messagesSent) * 100).toFixed(1)
      : '0.0';
    
    this.log(`📈 反馈成功率: ${successRate}%`);
    
    if (this.testResults.feedbackReceived > 0) {
      this.log('\n🎉 端到端测试成功！消息传递和反馈机制正常工作。');
    } else {
      this.log('\n⚠️ 端到端测试部分成功：消息已发送，但未收到反馈。');
      this.log('   这可能是因为Cursor客户端未正确处理消息或反馈机制需要调整。');
    }
  }

  async checkServerStatus() {
    return new Promise((resolve, reject) => {
      const req = http.get('http://127.0.0.1:3000/api/test', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            this.log('✅ 服务器状态正常');
            resolve(true);
          } else {
            reject(new Error(`服务器状态异常: ${res.statusCode}`));
          }
        });
      });
      
      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('服务器连接超时'));
      });
    });
  }

  async checkCursorClients() {
    return new Promise((resolve, reject) => {
      const req = http.get('http://127.0.0.1:3000/api/inject/clients', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.success && Array.isArray(response.data)) {
              const cursorClients = response.data.filter(client => 
                client.role === 'cursor' && client.online
              );
              
              this.log(`👥 发现 ${cursorClients.length} 个在线Cursor客户端`);
              
              if (cursorClients.length > 0) {
                cursorClients.forEach((client, index) => {
                  this.log(`   客户端 ${index + 1}: instanceId=${client.instanceId || 'null'}, injected=${client.injected}`);
                });
                resolve(true);
              } else {
                reject(new Error('没有发现在线的Cursor客户端'));
              }
            } else {
              reject(new Error('获取客户端列表失败'));
            }
          } catch (error) {
            reject(new Error(`解析客户端列表失败: ${error.message}`));
          }
        });
      });
      
      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('获取客户端列表超时'));
      });
    });
  }

  async run() {
    try {
      this.log('🚀 启动端到端测试...');
      this.log(`📋 测试实例ID: ${this.instanceId}`);
      
      // 检查服务器状态
      await this.checkServerStatus();
      
      // 检查Cursor客户端
      await this.checkCursorClients();
      
      // 连接WebSocket
      await this.connectWebSocket();
      
      // 注册客户端
      await this.registerClient();
      
      // 发送测试消息
      await this.sendTestMessages();
      
      // 等待反馈
      await this.waitForFeedback();
      
      // 打印结果
      this.printResults();
      
    } catch (error) {
      this.log(`❌ 测试失败: ${error.message}`);
      process.exit(1);
    } finally {
      if (this.ws) {
        this.ws.close();
      }
      this.log('🏁 端到端测试完成!');
    }
  }
}

// 运行测试
if (require.main === module) {
  const test = new EndToEndTest();
  test.run().catch(console.error);
}

module.exports = EndToEndTest;