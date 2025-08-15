## 使用说明（方案1 + 自动注入 + 多实例）

### 环境准备
- Node.js 16+（已包含 `better-sqlite3`、`sqlite3`、`express` 等依赖）
- 首次安装依赖：

```powershell
npm install
```

### 启动服务
- 开发模式（自动重载）：

```powershell
npm run dev
```

- 普通启动：

```powershell
npm start
```

- 健康检查（期望返回 `{ status: 'ok', ... }`）：

```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/health
```

> 注意（PowerShell）：不要在上述命令后追加 `| cat`，否则会触发 `Get-Content` 相关报错。

---

### 调试目录与历史记录（读取 SQLite）
- 目的：让前端从“本地历史（SQLite）”读取回复。可在调试目录放置 `state.vscdb`。
- 默认配置：`config/serverConfig.js` 中 `debug.useTestCursorPath = true` 且 `testCursorPath = 'D:\\test'`。若该目录存在，服务会优先用它作为历史根。
- 建议将真实库复制到：`D:\\test\\User\\globalStorage\\state.vscdb`

- 也可通过接口设置/查看历史根：

```powershell
# 设置历史根为 D:\test
$b = @{ path = "D:\test" } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri http://localhost:3000/api/history/cursor-path -Method POST -Body $b -ContentType 'application/json'

# 查看当前根路径
Invoke-RestMethod -Uri http://localhost:3000/api/history/cursor-path
```

> 说明：这个“历史读取目录”仅用于后端读取 SQLite，不影响你在 Cursor 客户端里的登录账号。

---

### 网页端使用
- 打开 `http://localhost:3000`
- 底部输入框发送消息：
  - 注入脚本会把文字粘贴到 Cursor 输入框并点击发送
  - 前端开始短周期轮询 `/api/chats`，读到最新 `assistant` 气泡后会提示“已获取最新回复”
- 如果 15–20 秒仍未命中：
  - 会自动清一次缓存 `/api/history/cache/clear`
  - 仍无则提示“等待超时，可稍后在历史里查看”

#### 多网页（实例绑定）
- 多开网页并用 URL 绑定实例：
  - 例如：`http://localhost:3000/?instance=cursor-1`、`http://localhost:3000/?instance=cursor-2`
  - 网页会在 WS 连接后自动 `register { role: 'web', instanceId }`
  - 发送时自动带上 `targetInstanceId=instance`
  - 历史侧暂为全局，后续可加实例过滤（或前端本地过滤）

#### 一体化测试页面
- 打开 `http://localhost:3000/test.html`：
  - 可填写 Cursor 路径，一键“启动并注入”（后台）
  - 可设置历史根目录，获取会话
  - 可填写实例 ID 并“一键打开绑定实例的聊天页面”
  - 支持从历史中拉取最新助手回复并显示在本页

> 手动注入（无需接口）：在 Cursor 开发者工具中执行 `public/cursor-browser.js` 内容（页面 `http://localhost:3000/script.html` 有一键复制）。

---

### 自动注入（服务器托管，支持多实例）
服务器可负责启动 Cursor（或连接现有实例）、开启远程调试端口、自动注入 `public/cursor-browser.js`。

- 查看注入进程
  - GET `/api/inject/processes`

- 启动一个实例并注入（PowerShell）：

```powershell
$b = @{
  cursorPath     = "C:\Users\you\AppData\Local\Programs\Cursor\Cursor.exe"
  userDataDir    = "D:\tmp\cursor-1"    # 多实例建议每个不同目录
  detach         = $true                    # 后台运行
  exitAfterReady = $false                   # 仅注入后退出可设 $true
  # port        = 9222                      # 可省略，自动找空闲端口
  # args        = ""                        # 额外命令行参数
  # shouldSpawn = $true                     # $false => 仅连接现有端口（不新开进程）
  # pollMs      = 30000                     # 注入轮询时长（毫秒）
} | ConvertTo-Json -Compress

Invoke-RestMethod -Uri http://localhost:3000/api/inject/launch -Method POST -Body $b -ContentType 'application/json'
```

- 一次启动多个实例：

```powershell
$b = @{
  count               = 3
  cursorPath          = "C:\Users\you\AppData\Local\Programs\Cursor\Cursor.exe"
  userDataDirTemplate = "D:\tmp\cursor-{i}"   # {i} -> 0..count-1
  basePort            = 9300                      # 可选，连续分配 9300..9302
  detach              = $true
  exitAfterReady      = $false
} | ConvertTo-Json -Compress

Invoke-RestMethod -Uri http://localhost:3000/api/inject/launch-many -Method POST -Body $b -ContentType 'application/json'
```

- 停止实例：

```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/inject/stop -Method POST -Body (@{ pid = 12345 } | ConvertTo-Json -Compress) -ContentType 'application/json'
```

> 多实例务必为每个实例指定不同的 `userDataDir` 与端口，避免 Profile/端口冲突。

#### 多实例下“消息路由”的推荐做法（设计建议）
为避免一个网页的消息被广播到所有 Cursor 实例，建议引入“实例 ID / 频道（instanceId/channel）”并做定向路由：

- 注入端（Cursor 页面中的 `cursor-browser.js`）
  - WebSocket 连接后，先发送注册报文：
    ```json
    { "type": "register", "instanceId": "cursor-1", "label": "工作账号", "workspaceRoot": "C:/repo/..." }
    ```
  - instanceId 可以在 `/api/inject/launch` 时指定并通过注入脚本内联到页面（由 `scripts/auto-inject-cursor.js` 在注入时注入变量），或在“多实例启动”返回里带回。

- 服务器（`services/websocketManager.js`）
  - 增加 `register` 处理：为 `ws` 记录 `ws.meta.instanceId`、`label` 等。
  - 修改 `user_message` 路由：当报文包含 `targetInstanceId` 时，仅投递给匹配 `instanceId` 的连接；否则按旧逻辑广播。

- 网页端
  - 方案 A（多网页）：每个页面绑定一个实例
    - 用 URL 参数绑定：`http://localhost:3000/?instance=cursor-1`
    - 发送时自动带上 `targetInstanceId=cursor-1`；历史轮询也按该实例过滤（见下）
  - 方案 B（单网页 + 实例选择器）：
    - 顶部下拉列出目标实例（来源：`/api/inject/processes` + WS “hello/register” 信息）
    - 发送时附带 `targetInstanceId`；轮询时按该实例过滤

- 历史读取的区分
  - `cursorHistoryManager-real` 的 `mode=cv` 结果中包含 `workspaceId` / `dbPath` 等字段（在部分路径中已返回）。
  - 网页端可对 `/api/chats` 结果做前端过滤：只显示 `workspaceId/dbPath` 与所选实例匹配的消息；
  - 或在后端为 `/api/chats` 增加查询参数（例如 `workspaceId`、`dbPath`、`instanceId`）进行服务端过滤（推荐后续改造）。

> 简述：为每个 Cursor 实例注册一个 `instanceId`，网页发送时带上 `targetInstanceId`，服务器按实例定向转发，历史侧按 `workspaceId/dbPath` 过滤显示，即可清晰区分“由哪个网页发往哪个 Cursor 实例”。

---

### 使用“当前账号”进行注入
如果你要使用现在 Cursor 已登录的账号与配置：
1) 手动启动 Cursor，并加参数 `--remote-debugging-port=9222`（不要传 `--user-data-dir`）
2) 只做注入（不新开 Cursor）：

```json
POST /api/inject/launch
{
  "shouldSpawn": false,
  "port": 9222,
  "exitAfterReady": true
}
```

---

### 常用接口速查
- 服务器/内容：
  - GET `/api/health`
  - GET `/api/status`
  - GET `/api/content`

- 历史/会话：
  - GET `/api/chats`
  - GET `/api/history`
  - GET `/api/history/cursor-path`、POST 同路径
  - GET `/api/history/cache/clear`

- 注入管理：
  - GET `/api/inject/processes`
  - POST `/api/inject/launch`
  - POST `/api/inject/launch-many`
  - POST `/api/inject/stop`

---

### 测试与验证（可选）
- 运行集成测试（会尝试连本地服务，必要时临时启动）：

```powershell
node tests/run-all-tests.js
```

> 注意：PowerShell 中不要在 `npm run dev` 等命令后加 `| cat`，会导致 `Get-Content` 相关报错。

---

### 故障排查
- “CDP 等待超时”：远程调试端口不可用。手动用 `--remote-debugging-port=9222` 启动 Cursor，或检查被策略/安全软件阻断。
- “历史为空”：确认 `D:\test\User\globalStorage\state.vscdb` 是否存在；必要时调用 `/api/history/cache/clear` 后再看 `/api/chats`。
- “未获取最新回复”：回复写入 SQLite 需要时间，前端轮询有退避；可稍等或手动刷新历史。
- “账号不对”：你使用了新的 `userDataDir`。要使用当前账号，采用“使用当前账号进行注入”的方式。

---

### 安全提示
- 远程调试端口仅建议绑定 `127.0.0.1`；服务器默认监听 `0.0.0.0`，如暴露到局域网，请注意网络访问控制与链路安全。


