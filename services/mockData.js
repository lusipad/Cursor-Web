/**
 * 模拟数据生成器
 * 当没有 Cursor 安装时提供示例数据
 */

const mockChatData = [
    {
        sessionId: 'mock-session-001',
        title: '欢迎使用 Cursor 聊天历史查看器',
        preview: '这是一个示例聊天，展示了 Cursor 聊天历史的格式...',
        timestamp: Date.now() - 3600000,
        lastModified: Date.now() - 1800000,
        workspaceId: 'mock-workspace-123',
        project: {
            name: '示例项目',
            rootPath: '/示例/项目/路径',
            id: 'mock-workspace-123'
        },
        messages: [
            {
                role: 'user',
                content: '你好，我想了解如何使用这个聊天历史查看器',
                timestamp: Date.now() - 3600000
            },
            {
                role: 'assistant',
                content: '您好！欢迎使用 Cursor 聊天历史查看器。这个工具可以帮助您查看和管理在 Cursor 中的所有 AI 对话历史。\n\n主要功能包括：\n- 查看所有聊天记录\n- 搜索特定对话\n- 导出聊天记录为 HTML 或 JSON 格式\n- 按项目或时间筛选聊天',
                timestamp: Date.now() - 3500000
            },
            {
                role: 'user',
                content: '这看起来很棒！如何搜索特定的聊天记录？',
                timestamp: Date.now() - 3400000
            },
            {
                role: 'assistant',
                content: '您可以使用顶部的搜索框来搜索聊天记录。搜索功能支持：\n\n1. 按聊天内容搜索\n2. 按项目名称搜索\n3. 按文件路径搜索\n\n只需输入关键词，系统会实时显示匹配的聊天记录。',
                timestamp: Date.now() - 3300000
            }
        ]
    },
    {
        sessionId: 'mock-session-002',
        title: 'JavaScript 代码调试会话',
        preview: '帮我调试这个 JavaScript 函数，它似乎有异步问题...',
        timestamp: Date.now() - 7200000,
        lastModified: Date.now() - 3600000,
        workspaceId: 'mock-workspace-123',
        project: {
            name: '示例项目',
            rootPath: '/示例/项目/路径',
            id: 'mock-workspace-123'
        },
        messages: [
            {
                role: 'user',
                content: '帮我调试这个 JavaScript 函数，它似乎有异步问题：\n\n```javascript\nasync function fetchUserData(userId) {\n  const response = await fetch(`/api/users/${userId}`);\n  const data = await response.json();\n  return data;\n}\n```\n\n有时候这个函数会返回 undefined',
                timestamp: Date.now() - 7200000
            },
            {
                role: 'assistant',
                content: '我看到您遇到的问题了。这个函数可能返回 undefined 的原因有几个：\n\n1. **网络请求失败**：如果 fetch 失败，没有错误处理\n2. **响应格式问题**：如果响应不是有效的 JSON\n3. **用户不存在**：API 可能返回 404\n\n建议的修复方案：\n\n```javascript\nasync function fetchUserData(userId) {\n  try {\n    const response = await fetch(`/api/users/${userId}`);\n    if (!response.ok) {\n      throw new Error(`HTTP error! status: ${response.status}`);\n    }\n    const data = await response.json();\n    return data;\n  } catch (error) {\n    console.error("Error fetching user data:", error);\n    return null; // 或者抛出错误\n  }\n}\n```',
                timestamp: Date.now() - 7100000
            }
        ]
    },
    {
        sessionId: 'mock-session-003',
        title: 'React 组件设计讨论',
        preview: '我正在设计一个可复用的 React 组件，需要一些建议...',
        timestamp: Date.now() - 86400000,
        lastModified: Date.now() - 43200000,
        workspaceId: 'mock-workspace-456',
        project: {
            name: 'React 应用',
            rootPath: '/示例/react-app',
            id: 'mock-workspace-456'
        },
        messages: [
            {
                role: 'user',
                content: '我正在设计一个可复用的 React 组件，需要一些建议。这个组件需要：\n- 显示用户列表\n- 支持搜索和筛选\n- 响应式设计\n- 可配置的主题\n\n有什么好的设计模式推荐吗？',
                timestamp: Date.now() - 86400000
            },
            {
                role: 'assistant',
                content: '对于您描述的需求，我建议使用以下设计模式：\n\n## 组件结构建议\n\n```javascript\n// 使用复合组件模式\nconst UserList = {\n  Container,\n  Search,\n  Filter,\n  Item,\n  Pagination\n};\n\n// 使用 render props 模式提供灵活性\nfunction UserListContainer({ children, theme }) {\n  const [users, setUsers] = useState([]);\n  const [searchTerm, setSearchTerm] = useState("");\n  \n  return children({\n    users,\n    searchTerm,\n    setSearchTerm,\n    theme\n  });\n}\n```\n\n## 关键技术点\n1. **使用 Context API** 管理主题和状态\n2. **自定义 hooks** 处理业务逻辑\n3. **CSS-in-JS** 支持主题切换\n4. **虚拟滚动** 处理大量数据',
                timestamp: Date.now() - 85800000
            }
        ]
    }
];

function generateMockChats() {
    return mockChatData.map(chat => ({
        ...chat,
        id: chat.sessionId,
        fileCount: Math.floor(Math.random() * 5) + 1,
        duration: Math.floor(Math.random() * 3600) + 300,
        tags: ['示例', '测试', '演示']
    }));
}

module.exports = {
    mockChatData,
    generateMockChats
};