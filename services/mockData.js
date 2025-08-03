/**
 * 模拟数据生成器
 * 当没有 Cursor 安装时提供示例数据
 */

const mockChatData = [
    {
        sessionId: 'demo-session-001',
        title: '演示数据 - Cursor 聊天历史查看器',
        preview: '这是演示数据，因为未找到真实的 Cursor 聊天记录...',
        timestamp: Date.now() - 3600000,
        lastModified: Date.now() - 1800000,
        workspaceId: 'demo-workspace-123',
        project: {
            name: '演示项目',
            rootPath: 'D:\\Repos\\cursor-web',
            id: 'demo-workspace-123'
        },
        messages: [
            {
                role: 'user',
                content: '注意：这是演示数据，因为系统未找到真实的 Cursor 聊天记录',
                timestamp: Date.now() - 3600000
            },
            {
                role: 'assistant',
                content: '这是演示数据。如果您看到这个消息，说明：\n\n1. Cursor 可能未安装或未在标准位置\n2. 聊天记录数据库可能为空\n3. 权限问题导致无法访问数据\n\n请检查：\n- Cursor 是否已安装\n- 是否有聊天记录\n- 程序是否有访问权限',
                timestamp: Date.now() - 3500000
            }
        ]
    },
    {
        sessionId: 'demo-session-002',
        title: '演示数据 - 代码调试示例',
        preview: '这是演示数据，展示聊天记录的格式...',
        timestamp: Date.now() - 7200000,
        lastModified: Date.now() - 3600000,
        workspaceId: 'demo-workspace-123',
        project: {
            name: '演示项目',
            rootPath: 'D:\\Repos\\cursor-web',
            id: 'demo-workspace-123'
        },
        messages: [
            {
                role: 'user',
                content: '这是演示数据 - 如果您看到这个，说明未找到真实的聊天记录',
                timestamp: Date.now() - 7200000
            },
            {
                role: 'assistant',
                content: '这是演示数据。真实的聊天记录应该显示您与 Cursor AI 的实际对话内容。\n\n如果一直显示演示数据，请检查：\n1. Cursor 是否正确安装\n2. 是否有聊天历史记录\n3. 数据库文件是否可访问',
                timestamp: Date.now() - 7100000
            }
        ]
    },
    {
        sessionId: 'demo-session-003',
        title: '演示数据 - 无真实聊天记录',
        preview: '这是演示数据，用于展示界面功能...',
        timestamp: Date.now() - 86400000,
        lastModified: Date.now() - 43200000,
        workspaceId: 'demo-workspace-456',
        project: {
            name: '演示项目2',
            rootPath: 'D:\\Repos\\other-project',
            id: 'demo-workspace-456'
        },
        messages: [
            {
                role: 'user',
                content: '演示数据说明：当前显示的是演示数据，因为未找到真实的 Cursor 聊天记录',
                timestamp: Date.now() - 86400000
            },
            {
                role: 'assistant',
                content: '这是演示数据。要查看真实的聊天记录，请确保：\n\n1. **Cursor 已安装**：确认 Cursor 编辑器已正确安装\n2. **有聊天历史**：在 Cursor 中与 AI 进行过对话\n3. **数据库可访问**：程序有权限访问 Cursor 的数据文件\n\n如果问题持续，请检查 Cursor 的安装路径和数据存储位置。',
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