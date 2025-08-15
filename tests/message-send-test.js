/*
 * 消息发送和反馈测试脚本
 * 测试从Web界面发送消息到Cursor并接收反馈的完整流程
 */

const WebSocket = require('ws');
const readline = require('readline');

class MessageSendTester {
  constructor() {
    this.wsUrl = 'ws://127.0.0.1:3000';
    this.webSocket = null;
    this.testInstanceId = 'test-sender-' + Date.now();
    this.messageId = 1;
    this.pendingMessages = new Map(); // 存储待确认的消息
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  // 连接WebSocket
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

  // 设置事件处理器
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

  // 处理收到的消息
  handleMessage(message) {
    console.log('📥 收到消息:', JSON.stringify(message, null, 2));
    
    switch (message.type) {
      case 'register_ack':
        console.log(`✅ 注册确认: ${message.role} (${message.instanceId})`);
        break;
        
      case 'delivery_ack':
        this.handleDeliveryAck(message);
        break;
        
      case 'delivery_error':
        this.handleDeliveryError(message);
        break;
        
      case 'assistant_hint':
        this.handleAssistantHint(message);
        break;
        
      case 'content_sync':
        this.handleContentSync(message);
        break;
        
      case 'ping':
        // 响应ping
        this.sendMessage({ type: 'pong' });
        break;
        
      default:
        console.log(`📨 未知消息类型: ${message.type}`);
    }
  }

  // 处理投递确认
  handleDeliveryAck(message) {
    const msgId = message.msgId;
    if (this.pendingMessages.has(msgId)) {
      const originalMsg = this.pendingMessages.get(msgId);
      console.log(`✅ 消息投递成功: "${originalMsg.data}" (ID: ${msgId})`);
      this.pendingMessages.delete(msgId);
    }
  }

  // 处理投递错误
  handleDeliveryError(message) {
    const msgId = message.msgId;
    if (this.pendingMessages.has(msgId)) {
      const originalMsg = this.pendingMessages.get(msgId);
      console.log(`❌ 消息投递失败: "${originalMsg.data}" (ID: ${msgId})`);
      console.log(`   错误原因: ${message.error}`);
      this.pendingMessages.delete(msgId);
    }
  }

  // 处理助手提示
  handleAssistantHint(message) {
    console.log(`💡 助手提示: ${message.hint}`);
  }

  // 处理内容同步
  handleContentSync(message) {
    console.log(`🔄 内容同步: ${message.content}`);
  }

  // 注册客户端
  async register() {
    const registerMessage = {
      type: 'register',
      role: 'web',
      instanceId: this.testInstanceId,
      injected: false
    };
    
    console.log('📝 注册Web客户端...');
    this.sendMessage(registerMessage);
    
    // 等待注册确认
    await this.wait(1000);
  }

  // 发送消息
  sendMessage(message) {
    if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
      this.webSocket.send(JSON.stringify(message));
    } else {
      console.error('❌ WebSocket未连接，无法发送消息');
    }
  }

  // 发送用户消息到Cursor
  sendUserMessage(content, targetInstance = 'default') {
    const msgId = `msg-${this.messageId++}-${Date.now()}`;
    const message = {
      type: 'user_message',
      data: content,
      targetInstanceId: targetInstance,
      msgId: msgId
    };
    
    // 记录待确认的消息
    this.pendingMessages.set(msgId, message);
    
    console.log(`📤 发送消息到Cursor (${targetInstance}): "${content}"`);
    console.log(`   消息ID: ${msgId}`);
    
    this.sendMessage(message);
    
    // 设置超时检查
    setTimeout(() => {
      if (this.pendingMessages.has(msgId)) {
        console.log(`⏰ 消息投递超时: "${content}" (ID: ${msgId})`);
        this.pendingMessages.delete(msgId);
      }
    }, 10000); // 10秒超时
  }

  // 等待指定时间
  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 显示帮助信息
  showHelp() {
    console.log('\n📋 可用命令:');
    console.log('  send <消息内容>     - 发送消息到默认Cursor实例');
    console.log('  send <实例ID> <消息> - 发送消息到指定Cursor实例');
    console.log('  status              - 显示连接状态');
    console.log('  pending             - 显示待确认的消息');
    console.log('  test                - 运行自动测试');
    console.log('  help                - 显示此帮助信息');
    console.log('  quit                - 退出程序');
    console.log('');
  }

  // 显示状态
  showStatus() {
    const wsStatus = this.webSocket ? 
      (this.webSocket.readyState === WebSocket.OPEN ? '已连接' : '未连接') : '未初始化';
    
    console.log('\n📊 连接状态:');
    console.log(`  WebSocket: ${wsStatus}`);
    console.log(`  实例ID: ${this.testInstanceId}`);
    console.log(`  待确认消息: ${this.pendingMessages.size}个`);
    console.log('');
  }

  // 显示待确认的消息
  showPendingMessages() {
    console.log('\n⏳ 待确认的消息:');
    if (this.pendingMessages.size === 0) {
      console.log('  无待确认消息');
    } else {
      for (const [msgId, message] of this.pendingMessages) {
        console.log(`  ${msgId}: "${message.data}"`);
      }
    }
    console.log('');
  }

  // 运行自动测试
  async runAutoTest() {
    console.log('\n🧪 开始自动测试...');
    
    const testMessages = [
      '这是一条测试消息',
      'Hello from Web interface!',
      '测试中文消息发送',
      '请帮我写一个简单的JavaScript函数'
    ];
    
    for (let i = 0; i < testMessages.length; i++) {
      const message = testMessages[i];
      console.log(`\n📤 测试消息 ${i + 1}/${testMessages.length}`);
      this.sendUserMessage(message);
      
      // 等待2秒再发送下一条
      await this.wait(2000);
    }
    
    console.log('\n✅ 自动测试完成，等待反馈...');
  }

  // 处理用户输入
  async handleUserInput() {
    this.showHelp();
    
    const askQuestion = () => {
      this.rl.question('> ', async (input) => {
        const parts = input.trim().split(' ');
        const command = parts[0].toLowerCase();
        
        switch (command) {
          case 'send':
            if (parts.length < 2) {
              console.log('❌ 用法: send <消息内容> 或 send <实例ID> <消息>');
            } else if (parts.length === 2) {
              // send <消息>
              this.sendUserMessage(parts.slice(1).join(' '));
            } else {
              // send <实例ID> <消息>
              const targetInstance = parts[1];
              const message = parts.slice(2).join(' ');
              this.sendUserMessage(message, targetInstance);
            }
            break;
            
          case 'status':
            this.showStatus();
            break;
            
          case 'pending':
            this.showPendingMessages();
            break;
            
          case 'test':
            await this.runAutoTest();
            break;
            
          case 'help':
            this.showHelp();
            break;
            
          case 'quit':
          case 'exit':
            console.log('👋 再见!');
            this.cleanup();
            return;
            
          default:
            if (input.trim()) {
              console.log('❌ 未知命令，输入 help 查看帮助');
            }
        }
        
        askQuestion();
      });
    };
    
    askQuestion();
  }

  // 清理资源
  cleanup() {
    if (this.webSocket) {
      this.webSocket.close();
    }
    this.rl.close();
    process.exit(0);
  }

  // 启动测试器
  async start() {
    try {
      console.log('🚀 启动消息发送测试器...');
      console.log(`📋 测试实例ID: ${this.testInstanceId}`);
      
      await this.connect();
      await this.register();
      
      console.log('\n✅ 测试器已就绪!');
      console.log('💡 提示: 确保Cursor已打开并且注入脚本正在运行');
      
      await this.handleUserInput();
      
    } catch (error) {
      console.error('❌ 启动失败:', error.message);
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
  const tester = new MessageSendTester();
  await tester.start();
}

// 运行测试器
if (require.main === module) {
  main();
}

module.exports = MessageSendTester;