# Cursor 工作区聊天记录处理器

## 功能说明

这个处理器可以：
- 自动发现所有 Cursor 工作区配置
- 从工作区数据库中提取聊天记录
- 从全局存储中提取聊天数据
- 生成结构化的 JSON 输出文件

## 使用方法

### 1. 使用默认路径（自动检测）
```bash
node workspace_processor.js
```

### 2. 指定自定义 Cursor 数据路径
```bash
node workspace_processor.js /path/to/your/cursor/data
```

### 3. 运行测试（模拟数据）
```bash
node test_workspace_processor.js
```

## 支持的工作区配置

处理器会自动查找以下 27 个工作区配置：
- 01fea5ca601895f83a1944fe2f5e1969
- 053d1e69746c5c3c761194f970b30726
- 141b9fe1d5b9492c4e3164f842889e87
- 1754180913505
- 3af1ee911d5734d851239cff10744fe9
- 4387d4ceaebe33b9c7705533effcc6b4
- 4d72e3c523c7d9210c5f4cde52c09317
- 526ab2fb2ec38eba2139e685ea73c850
- 720e2a6032a336b762623d0d6311cd5b
- 73c85449bddff1c7206913c61661ae58
- 7c88bac0a9c7319f148c0df644f06a54
- 83fcc12bc1813d7b2fe900720fec6345
- 9fe16d945c1cc999808cc34adab7f039
- a3adbd77e5cefeae98ddfabeadadeb09
- a4b38d474d12fabb20619e5e6c451f2a
- ae0bb40ddf908e1339537d475fbe082a
- c096ebc03987f7ee16127eb1e5b65760
- c5583557dad8a8bce04a8c8d97f6dc92
- cd02cb52fd7ec9e5d4b76bd5bb4603d4
- d7a22208304ecce3296a1a756b74067d
- dab906f43241c1a4ed99ddcdd2ceaf2f
- e29778869b635c8bae5bd1b3a3fc2937
- e71ed70bdea26a10240825908171705b
- ec231fd6f1e55cd68df4e2f74f845509
- ext-dev
- f3ea30577df7bc66c9310841057a41b7
- ffbd04b85024db14e143bc29283711a6

## 输出格式

处理器会生成一个 JSON 文件，包含：

```json
{
  "summary": {
    "total_workspaces": 27,
    "workspaces_with_chats": 27,
    "total_chats": 78,
    "processed_at": "2025-08-03T03:38:45.961Z"
  },
  "workspaces": [
    {
      "workspace_id": "01fea5ca601895f83a1944fe2f5e1969",
      "workspace_path": "/path/to/workspace",
      "project_info": {
        "name": "Project Name",
        "rootPath": "/path/to/project"
      },
      "chat_count": 3,
      "chats": [
        {
          "session_id": "chat_session_id",
          "workspace_id": "workspace_id",
          "project": {
            "name": "Project Name",
            "rootPath": "/path/to/project"
          },
          "messages": [
            {
              "role": "user",
              "content": "User message"
            },
            {
              "role": "assistant",
              "content": "Assistant response"
            }
          ],
          "date": "2025-08-03T03:38:45.952Z"
        }
      ]
    }
  ]
}
```

## 跨平台支持

- **macOS**: `~/Library/Application Support/Cursor`
- **Windows**: `%APPDATA%/Cursor`
- **Linux**: `~/.config/Cursor`

## 数据提取位置

处理器会从以下位置提取数据：

1. **工作区数据库**: `workspaceStorage/{workspace_id}/state.vscdb`
2. **全局存储**: `globalStorage/cursor.cursor/` 或 `globalStorage/cursor/`
3. **聊天数据**: 从 `ItemTable` 表中提取
4. **项目信息**: 从历史记录中解析

## 故障排除

### 如果找不到工作区
1. 确保 Cursor 已正确安装
2. 检查指定的路径是否正确
3. 确保有权限访问 Cursor 数据目录

### 如果没有聊天记录
1. 确保在 Cursor 中进行过聊天
2. 检查是否有其他数据库名称
3. 尝试运行测试脚本验证处理器是否正常工作

## 依赖项

- Node.js
- sqlite3 模块

安装依赖：
```bash
npm install sqlite3
```