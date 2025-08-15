// 反馈机制诊断脚本
const WebSocket = require('ws');
const http = require('http');

class FeedbackDiagnostic {
  constructor() {
    this.ws = null;
    this.receivedMessages = [];
    this.testStartTime = null;
  }

  log(message) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${message}`);
  }

  async checkServerStatus() {
    try {
      const data = await this.httpGet('http://127.0.0.1:3000/api/status');
      this.log(`✅ 服务器状态: ${JSON.stringify(data)}`);
      return true;
    } catch (error) {
      this.log(`❌ 服务器连接失败: ${error.message}`);
      return false;
    }
  }

  async checkCursorClients() {
    try {
      const response = await this.httpGet('http://127.0.0.1:3000/api/inject/clients');
      const clients = response.data || [];
      const cursorClients = clients.filter(c => c.role === 'cursor');
      this.log(`📱 Cursor客户端数量: ${cursorClients.length}`);
      cursorClients.forEach((client, index) => {
        this.log(`   客户端${index + 1}: instanceId=${client.instanceId}, injected=${client.injected}, online=${client.online}`);
      });
      return cursorClients.length > 0;
    } catch (error) {
      this.log(`❌ 获取客户端信息失败: ${error.message}`);
      return false;
    }
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
        
        // 注册为web客户端，使用default instanceId来接收反馈
        const registerMsg = {
          type: 'register',
          role: 'web',
          instanceId: 'default'
        };
        this.ws.send(JSON.stringify(registerMsg));
        this.log('📝 已注册为web客户端');
        
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

      this.ws.on('close', () => {
        this.log('❌ WebSocket连接已关闭');
      });
    });
  }

  handleMessage(message) {
    const timestamp = Date.now();
    this.receivedMessages.push({ ...message, receivedAt: timestamp });
    
    this.log(`📥 收到消息: ${message.type}`);
    
    if (message.type === 'delivery_ack') {
      this.log(`   ✅ 投递确认: msgId=${message.msgId}, instanceId=${message.instanceId}`);
    } else if (message.type === 'delivery_error') {
      this.log(`   ❌ 投递错误: msgId=${message.msgId}, reason=${message.reason}`);
    } else if (message.type === 'assistant_hint') {
      this.log(`   💡 助手提示: msgId=${message.msgId}, instanceId=${message.instanceId}`);
    } else {
      this.log(`   ℹ️ 其他消息: ${JSON.stringify(message)}`);
      // 详细记录未知消息类型
      this.log(`   🔍 消息详情: type=${message.type}, keys=[${Object.keys(message).join(', ')}]`);
    }
  }

  async sendTestMessage(messageText, targetInstanceId = 'default') {
    const msgId = 'diagnostic-' + Date.now();
    const message = {
      type: 'user_message',
      data: messageText,
      targetInstanceId: targetInstanceId,
      msgId: msgId
    };
    
    this.log(`📤 发送测试消息: "${messageText}" (msgId: ${msgId})`);
    this.ws.send(JSON.stringify(message));
    
    return msgId;
  }

  async runDiagnostic() {
    this.log('🔍 开始反馈机制诊断...');
    
    // 1. 检查服务器状态
    this.log('\n1️⃣ 检查服务器状态...');
    const serverOk = await this.checkServerStatus();
    if (!serverOk) {
      this.log('❌ 服务器不可用，诊断终止');
      return;
    }
    
    // 2. 检查Cursor客户端
    this.log('\n2️⃣ 检查Cursor客户端...');
    const clientsOk = await this.checkCursorClients();
    if (!clientsOk) {
      this.log('❌ 没有Cursor客户端连接，诊断终止');
      return;
    }
    
    // 3. 连接WebSocket
    this.log('\n3️⃣ 连接WebSocket...');
    try {
      await this.connectWebSocket();
    } catch (error) {
      this.log(`❌ WebSocket连接失败: ${error.message}`);
      return;
    }
    
    // 4. 发送测试消息
    this.log('\n4️⃣ 发送测试消息...');
    this.testStartTime = Date.now();
    
    const msgId1 = await this.sendTestMessage('诊断测试消息 1 - 检查反馈机制');
    await this.wait(3000);
    
    const msgId2 = await this.sendTestMessage('诊断测试消息 2 - 验证投递确认');
    await this.wait(3000);
    
    // 5. 等待反馈
    this.log('\n5️⃣ 等待反馈消息...');
    await this.wait(10000);
    
    // 6. 分析结果
    this.log('\n6️⃣ 分析诊断结果...');
    this.analyzeResults([msgId1, msgId2]);
    
    // 关闭连接
    if (this.ws) {
      this.ws.close();
    }
    
    this.log('\n🏁 反馈机制诊断完成!');
  }

  analyzeResults(sentMsgIds) {
    this.log(`\n📊 诊断结果分析:`);
    this.log(`📤 发送消息数量: ${sentMsgIds.length}`);
    this.log(`📥 收到反馈数量: ${this.receivedMessages.length}`);
    
    const deliveryAcks = this.receivedMessages.filter(m => m.type === 'delivery_ack');
    const deliveryErrors = this.receivedMessages.filter(m => m.type === 'delivery_error');
    const assistantHints = this.receivedMessages.filter(m => m.type === 'assistant_hint');
    const others = this.receivedMessages.filter(m => !['delivery_ack', 'delivery_error', 'assistant_hint'].includes(m.type));
    
    this.log(`✅ 投递确认: ${deliveryAcks.length}`);
    this.log(`❌ 投递错误: ${deliveryErrors.length}`);
    this.log(`💡 助手提示: ${assistantHints.length}`);
    this.log(`ℹ️ 其他消息: ${others.length}`);
    
    // 检查消息ID匹配
    sentMsgIds.forEach(msgId => {
      const ack = deliveryAcks.find(m => m.msgId === msgId);
      const error = deliveryErrors.find(m => m.msgId === msgId);
      const hint = assistantHints.find(m => m.msgId === msgId);
      
      this.log(`\n📋 消息 ${msgId}:`);
      this.log(`   投递确认: ${ack ? '✅' : '❌'}`);
      this.log(`   投递错误: ${error ? '⚠️' : '✅'}`);
      this.log(`   助手提示: ${hint ? '✅' : '❌'}`);
    });
    
    // 总结
    const successRate = (deliveryAcks.length / sentMsgIds.length) * 100;
    this.log(`\n📈 反馈成功率: ${successRate.toFixed(1)}%`);
    
    if (successRate === 0) {
      this.log('\n🔍 可能的问题:');
      this.log('   1. Cursor客户端注入脚本未正确处理消息');
      this.log('   2. 反馈消息路由有问题');
      this.log('   3. WebSocket消息处理中存在错误');
      this.log('   4. 消息格式不符合预期');
    } else if (successRate < 100) {
      this.log('\n⚠️ 部分消息处理失败，需要进一步调试');
    } else {
      this.log('\n🎉 反馈机制工作正常!');
    }
  }

  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async httpGet(url) {
    return new Promise((resolve, reject) => {
      const req = http.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(new Error(`JSON解析失败: ${error.message}`));
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('请求超时'));
      });
    });
  }
}

// 运行诊断
if (require.main === module) {
  const diagnostic = new FeedbackDiagnostic();
  diagnostic.runDiagnostic().catch(error => {
    console.error('诊断过程中发生错误:', error);
    process.exit(1);
  });
}

module.exports = FeedbackDiagnostic;