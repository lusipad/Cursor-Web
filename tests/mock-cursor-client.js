/*
 * 模拟Cursor客户端
 * 用于测试消息发送和反馈机制
 */

const WebSocket = require('ws');

class MockCursorClient {
  constructor() {
    this.wsUrl = 'ws://127.0.0.1:3000';
    this.webSocket = null;
    this.instanceId = 'default'; // 使用默认实例ID
    this.messageHandlers = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      console.log('🔗 模拟Cursor客户端连接到WebSocket服务器...');
      
      this.webSocket = new WebSocket(this.wsUrl);
      
      const timeout = setTimeout(() => {
        reject(new Error('连接超时'));
      }, 5000);

      this.webSocket.on('open', () => {
        clearTimeout(timeout);
        console.log('✅ 模拟Cursor客户端连接成功');
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
      console.log('❌ 模拟Cursor客户端连接已关闭');
    });

    this.webSocket.on('error', (error) => {
      console.error('❌ 模拟Cursor客户端WebSocket错误:', error.message);
    });
  }

  handleMessage(message) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`📥 [${timestamp}] 模拟Cursor收到消息:`, JSON.stringify(message, null, 2));
    
    switch (message.type) {
      case 'register_ack':
        console.log(`✅ 模拟Cursor注册确认: ${message.role} (${message.instanceId})`);
        break;
        
      case 'user_message':
        console.log(`📨 收到用户消息: "${message.data}" (ID: ${message.msgId})`);
        this.handleUserMessage(message);
        break;
        
      case 'ping':
        this.sendMessage({ type: 'pong' });
        break;
        
      case 'clients_update':
        console.log(`👥 客户端更新: ${message.data.length} 个客户端在线`);
        break;
    }
  }

  async handleUserMessage(message) {
    const { data: content, msgId, sourceInstanceId } = message;
    
    // 模拟处理延迟
    await this.wait(500);
    
    // 发送投递确认
    this.sendDeliveryAck(msgId);
    
    // 模拟处理消息并生成回复
    await this.wait(1000);
    
    // 发送助手提示
    this.sendAssistantHint(`正在处理您的请求: "${content.substring(0, 30)}..."`);
    
    // 模拟生成回复内容
    await this.wait(2000);
    
    let reply = '';
    if (content.includes('Hello World') || content.includes('程序')) {
      reply = `这是一个简单的Hello World程序:\n\n\`\`\`python\nprint("Hello, World!")\n\`\`\`\n\n这个程序会在控制台输出 "Hello, World!"。`;
    } else if (content.includes('你好') || content.includes('Hello')) {
      reply = `你好！我是Cursor AI助手。很高兴为您服务！您有什么需要帮助的吗？`;
    } else if (content.includes('测试')) {
      reply = `测试消息已收到！消息发送和反馈机制工作正常。\n\n收到的消息内容: "${content}"\n消息ID: ${msgId}\n处理时间: ${new Date().toLocaleString()}`;
    } else {
      reply = `我已收到您的消息: "${content}"\n\n这是一个模拟回复，用于测试消息发送和反馈机制。如果您有具体问题，请告诉我！`;
    }
    
    // 发送内容同步
    this.sendContentSync(reply, sourceInstanceId);
    
    console.log(`✅ 已处理消息 ${msgId} 并发送回复`);
  }

  sendDeliveryAck(msgId) {
    const ackMessage = {
      type: 'delivery_ack',
      msgId: msgId,
      timestamp: Date.now()
    };
    
    console.log(`📤 发送投递确认: ${msgId}`);
    this.sendMessage(ackMessage);
  }

  sendAssistantHint(hint) {
    const hintMessage = {
      type: 'assistant_hint',
      hint: hint,
      timestamp: Date.now()
    };
    
    console.log(`📤 发送助手提示: ${hint}`);
    this.sendMessage(hintMessage);
  }

  sendContentSync(content, targetInstanceId) {
    const syncMessage = {
      type: 'content_sync',
      content: content,
      targetInstanceId: targetInstanceId,
      timestamp: Date.now()
    };
    
    console.log(`📤 发送内容同步到 ${targetInstanceId}: ${content.substring(0, 50)}...`);
    this.sendMessage(syncMessage);
  }

  async register() {
    const registerMessage = {
      type: 'register',
      role: 'cursor',
      instanceId: this.instanceId,
      injected: true
    };
    
    console.log(`📝 注册模拟Cursor客户端 (${this.instanceId})...`);
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

  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  cleanup() {
    if (this.webSocket) {
      this.webSocket.close();
    }
  }

  async start() {
    try {
      console.log('🚀 启动模拟Cursor客户端...');
      console.log(`📋 实例ID: ${this.instanceId}`);
      
      await this.connect();
      await this.register();
      
      console.log('\n✅ 模拟Cursor客户端已就绪!');
      console.log('💡 现在可以从Web界面发送消息进行测试');
      
      // 保持连接
      console.log('\n⏳ 等待消息... (按 Ctrl+C 退出)');
      
      // 设置定期ping以保持连接
      setInterval(() => {
        if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
          this.sendMessage({ type: 'ping' });
        }
      }, 30000);
      
    } catch (error) {
      console.error('❌ 模拟Cursor客户端启动失败:', error.message);
      process.exit(1);
    }
  }
}

// 处理中断信号
process.on('SIGINT', () => {
  console.log('\n⏹️ 收到中断信号，正在退出模拟Cursor客户端...');
  process.exit(0);
});

// 主函数
async function main() {
  const mockClient = new MockCursorClient();
  await mockClient.start();
}

// 运行模拟客户端
if (require.main === module) {
  main();
}

module.exports = MockCursorClient;