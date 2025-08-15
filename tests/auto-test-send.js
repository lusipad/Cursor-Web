/*
 * 自动消息发送测试脚本
 * 自动发送测试消息并监控反馈
 */

const WebSocket = require('ws');

class AutoTestSender {
  constructor() {
    this.wsUrl = 'ws://127.0.0.1:3000';
    this.webSocket = null;
    this.testInstanceId = 'auto-test-' + Date.now();
    this.messageId = 1;
    this.testResults = [];
  }

  async connect() {
    return new Promise((resolve, reject) => {
      console.log('🔗 连接到WebSocket服务器...');
      
      this.webSocket = new WebSocket(this.wsUrl);
      
      const timeout = setTimeout(() => {
        reject(new Error('连接超时'));
      }, 5000);

      this.webSocket.on('open', () => {
        clearTimeout(timeout);
        console.log('✅ WebSocket连接成功');
        this.setupEventHandlers();
        resolve();
      });

      this.webSocket.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  setupEventHandlers() {
    this.webSocket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (error) {
        console.log('📥 收到非JSON消息:', data.toString());
      }
    });

    this.webSocket.on('close', () => {
      console.log('❌ WebSocket连接已关闭');
    });

    this.webSocket.on('error', (error) => {
      console.error('❌ WebSocket错误:', error.message);
    });
  }

  handleMessage(message) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`📥 [${timestamp}] 收到消息:`, JSON.stringify(message, null, 2));
    
    switch (message.type) {
      case 'register_ack':
        console.log(`✅ 注册确认: ${message.role} (${message.instanceId})`);
        break;
        
      case 'delivery_ack':
        console.log(`✅ 消息投递成功: ID=${message.msgId}`);
        this.testResults.push({
          type: 'delivery_ack',
          msgId: message.msgId,
          timestamp: Date.now()
        });
        break;
        
      case 'delivery_error':
        console.log(`❌ 消息投递失败: ID=${message.msgId}, 错误=${message.error}`);
        this.testResults.push({
          type: 'delivery_error',
          msgId: message.msgId,
          error: message.error,
          timestamp: Date.now()
        });
        break;
        
      case 'assistant_hint':
        console.log(`💡 助手提示: ${message.hint}`);
        this.testResults.push({
          type: 'assistant_hint',
          hint: message.hint,
          timestamp: Date.now()
        });
        break;
        
      case 'content_sync':
        console.log(`🔄 内容同步: ${message.content?.substring(0, 100)}...`);
        this.testResults.push({
          type: 'content_sync',
          contentLength: message.content?.length || 0,
          timestamp: Date.now()
        });
        break;
        
      case 'ping':
        this.sendMessage({ type: 'pong' });
        break;
    }
  }

  async register() {
    const registerMessage = {
      type: 'register',
      role: 'web',
      instanceId: this.testInstanceId,
      injected: false
    };
    
    console.log('📝 注册Web客户端...');
    this.sendMessage(registerMessage);
    
    await this.wait(1000);
  }

  sendMessage(message) {
    if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
      this.webSocket.send(JSON.stringify(message));
    } else {
      console.error('❌ WebSocket未连接，无法发送消息');
    }
  }

  sendUserMessage(content, targetInstance = 'default') {
    const msgId = `auto-msg-${this.messageId++}-${Date.now()}`;
    const message = {
      type: 'user_message',
      data: content,
      targetInstanceId: targetInstance,
      msgId: msgId
    };
    
    const timestamp = new Date().toLocaleTimeString();
    console.log(`📤 [${timestamp}] 发送消息到Cursor (${targetInstance}): "${content}"`);
    console.log(`   消息ID: ${msgId}`);
    
    this.sendMessage(message);
    return msgId;
  }

  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async runAutoTest() {
    console.log('\n🧪 开始自动消息发送测试...');
    
    const testMessages = [
      '你好，这是一条测试消息',
      'Hello, this is a test message from Web interface',
      '请帮我写一个简单的Hello World程序',
      '测试消息发送和反馈机制是否正常工作'
    ];
    
    for (let i = 0; i < testMessages.length; i++) {
      const message = testMessages[i];
      console.log(`\n📤 测试消息 ${i + 1}/${testMessages.length}`);
      const msgId = this.sendUserMessage(message);
      
      // 等待3秒再发送下一条
      await this.wait(3000);
    }
    
    console.log('\n✅ 所有测试消息已发送，等待反馈...');
    
    // 等待10秒收集反馈
    await this.wait(10000);
    
    this.showTestResults();
  }

  showTestResults() {
    console.log('\n📊 测试结果统计:');
    console.log('=' * 50);
    
    const deliveryAcks = this.testResults.filter(r => r.type === 'delivery_ack');
    const deliveryErrors = this.testResults.filter(r => r.type === 'delivery_error');
    const assistantHints = this.testResults.filter(r => r.type === 'assistant_hint');
    const contentSyncs = this.testResults.filter(r => r.type === 'content_sync');
    
    console.log(`✅ 投递成功: ${deliveryAcks.length}个`);
    console.log(`❌ 投递失败: ${deliveryErrors.length}个`);
    console.log(`💡 助手提示: ${assistantHints.length}个`);
    console.log(`🔄 内容同步: ${contentSyncs.length}个`);
    
    if (deliveryErrors.length > 0) {
      console.log('\n❌ 投递失败详情:');
      deliveryErrors.forEach(error => {
        console.log(`  - ${error.msgId}: ${error.error}`);
      });
    }
    
    if (assistantHints.length > 0) {
      console.log('\n💡 助手提示详情:');
      assistantHints.forEach(hint => {
        console.log(`  - ${hint.hint}`);
      });
    }
    
    const successRate = deliveryAcks.length / (deliveryAcks.length + deliveryErrors.length) * 100;
    console.log(`\n📈 投递成功率: ${successRate.toFixed(1)}%`);
    
    console.log('\n🏁 测试完成!');
  }

  cleanup() {
    if (this.webSocket) {
      this.webSocket.close();
    }
    process.exit(0);
  }

  async start() {
    try {
      console.log('🚀 启动自动消息发送测试...');
      console.log(`📋 测试实例ID: ${this.testInstanceId}`);
      
      await this.connect();
      await this.register();
      
      console.log('\n✅ 测试器已就绪!');
      console.log('💡 提示: 确保Cursor已打开并且注入脚本正在运行');
      
      await this.runAutoTest();
      
      // 等待额外时间收集可能的延迟反馈
      console.log('\n⏳ 等待额外反馈...');
      await this.wait(5000);
      
      this.cleanup();
      
    } catch (error) {
      console.error('❌ 测试失败:', error.message);
      process.exit(1);
    }
  }
}

// 处理中断信号
process.on('SIGINT', () => {
  console.log('\n⏹️ 收到中断信号，正在退出...');
  process.exit(0);
});

// 主函数
async function main() {
  const tester = new AutoTestSender();
  await tester.start();
}

// 运行测试器
if (require.main === module) {
  main();
}

module.exports = AutoTestSender;