## 首页与实例选择统一化改造计划（vNext）

### 目标
- 首屏优先进入“实例选择”，选定后再进入主页。
- 统一右上角状态条：实例选择 + 连接/注入状态 + 快捷操作，替换零散的状态/悬浮条。

### 改造要点
- 服务端在 `/` 路由检测 Cookie `cw_instance_id`，缺失则重定向到 `instances.html?first=1&return=/`。
- 前端兜底：`index.html` 头部加载 `js/instance-utils.js` 并调用 `InstanceUtils.ensureOrRedirect('/instances.html?first=1&return=/')`。
- 统一状态条：重用 `js/modules/InjectBar.js`，改为全局固定在右上角（position: fixed）。
  - 内容：实例下拉、状态圆点与文案（注入/连接），“仅注入(扫)/重启并注入/启动并注入”进入菜单或保持按钮。
  - 数据源：`/api/instances`、`/api/inject/clients`、WS 状态由 `WebSocketManager` 或本地 `localStorage.websocket_status` 广播。
- 清理重复状态：移除 `index.html` 顶部 header 的“等待连接”状态 pill 与聊天页内局部悬浮条（由统一条替代）。
- 选择默认实例后支持带 `return` 回跳，便于首次引导全链路闭环。

### 受影响文件
- `middleware/appMiddleware.js`：`/` 路由增加 Cookie 检查与重定向。
- `public/index.html`：在 `<head>` 早期引入 `instance-utils` 并兜底重定向；移除旧状态 pill；引入统一状态条脚本。
- `public/js/modules/InjectBar.js`：取消对 `#chat-tab` 的依赖，改为挂载到 `document.body`；实例获取增加 `InstanceUtils.get()` 兜底。
- `public/style.css`：`.inject-bar` 改为 `position: fixed; right: 16px; top: 12px; z-index: 9999;`。
- `public/js/instances-tab.js`：点击“设为默认”后，若 URL 含 `return` 参数则跳回。
- （可选）`public/instances.html`、`public/diagnostic.html`、`public/history-new.html`：统一引入状态条脚本。

### 任务清单（逐条落实）
1) 服务端首页重定向（无实例 Cookie → `instances.html`）。
2) `index.html` 头部兜底重定向；移除旧状态 pill；引入统一状态条脚本。
3) `InjectBar` 提升为全局右上角组件；样式改为 fixed；实例获取完善。
4) `instances-tab.js`：设为默认后按 `return` 返回。
5) 其余页面按需引入统一状态条；删除冗余悬浮条/状态位。
6) 回归测试：
   - 未选择实例访问 `/` → 跳转到实例页；选择后跳回首页。
   - 右上角状态条在各页可见，切换实例可用；注入/连接状态 5s 内更新。
   - 聊天页无重复状态 pill。

---

## 多实例整体工作流（更新版）

### 目标
- 在配置文件中声明多个实例（Instance），每个实例包含 Cursor 启动参数（打开目录、用户数据目录、额外参数等）。
- Web 管理页统一查看各实例状态，执行注入/重启/发送消息/查看回复等操作。
- 发送侧通过 WebSocket → 注入脚本写入 Cursor 输入并触发发送；返回侧不再依赖 WebSocket 回显，统一通过 HTTP 拉取历史展示（轮询）。

### 通信架构重构（WebSocket 控制面 + HTTP 展示面）

- WebSocket（控制面）
  - 仅用于控制/指令：`register`、`user_message`、`delivery_ack|delivery_error`、`assistant_hint`、`clear_content`、`ping/pong`。
  - 关闭 `html_content` 回显广播（默认禁用，保留调试开关 `config.websocket.broadcastHtmlEnabled=false`）。
- HTTP（数据面）
  - UI 展示统一使用 `/api/chats` 读取聚合会话；支持 `?instance=`、`maxAgeMs`、`nocache`。
  - 可选增强：新增轻量 `/api/chats/latest?instance=` 与 `ETag/If-None-Match` 增量以降带宽。
- 前端
  - 保留“发送消息”和“按钮动作”（注入/重启/仅注入等）。
  - 不再基于 WebSocket `html_content` 做 UI 回显；展示改为：
    - 常驻轮询：默认每 12s 拉取一次 `/api/chats`，仅在基线变化时更新。
    - 发送后快轮询：间隔 [2000, 2000, 5000, 10000, 10000] ms，命中即渲染并结束快轮询。
  - 仅使用 WS 回执更新状态（已路由/已投递/失败等），不直接驱动内容展示。
- 时序（发送后）
  - 本地先插入用户消息 → 通过 WS 投递 → 启动快轮询 `/api/chats` → 命中新助手消息后渲染 → 回到常驻轮询。
- 兼容与回退
  - 先在前端停用回显路径；确认稳定后在服务端关闭 `html_content` 广播。
  - 如需回退，仅恢复前端 `html_content` 监听即可。
- 验收要点
  - 单页/多页在 1~5s 内通常能看到助手回复（取决于写入延迟）。
  - 断网与重连期间，按钮可见、发送失败有提示、轮询自动恢复。

### 实例配置（建议）
- 新增 `config/instances.json`（示例）：
  - id: 实例标识（如 `cursor-1`）
  - cursorPath: 可执行路径（可留空自动查找）
  - userDataDir: 独立配置目录（多实例隔离）
  - openPath: 启动后打开的项目/工作区目录
  - args: 额外启动参数（支持 JSON 数组或带引号字符串）
  - autoStart: 服务器启动时是否自动拉起
  - pollMs: 注入轮询时长

### 后端 API（扩展）
- 进程/注入
  - POST `/api/inject/launch`：启动并注入；参数支持 `instanceId, cursorPath, userDataDir, openPath, args, pollMs`
  - POST `/api/inject/restart`：强制重启并注入；同上参数
  - POST `/api/inject/scan-inject`：扫描端口并注入；参数 `startPort, endPort, instanceId`
  - POST `/api/inject/inject-port`：指定端口注入；参数 `port, pollMs, instanceId`
  - POST `/api/inject/kill-all`：关闭所有 Cursor
  - POST `/api/inject/launch-many`：批量启动；参数 `count, basePort, userDataDirTemplate, args, pollMs, instanceId`
  - POST `/api/inject/stop`：按 PID 停止
  - GET `/api/inject/processes`：列出已启动进程
  - GET `/api/inject/clients`：列出当前 WebSocket 客户端（含 role/instanceId/是否已注入/URL）
- 历史/内容
  - GET `/api/chats`：聚合会话；支持 `includeUnmapped`；前端拉取回复前可先调用 `GET /api/history/cache/clear`
  - GET `/api/history/cursor-path` 与 POST 同名端点：读取/设置历史根
  - GET `/api/history/debug`：输出 SQLite 检测与采样信息
  - GET `/api/history/projects`：唯一项目列表
  - GET `/api/content`：最新 HTML 内容（可选调试用途；展示不再依赖该接口）
  - GET `/api/status`、GET `/api/health`：状态/健康检查

### 注入脚本（关键点）
- `openPath`：以单独参数追加在启动参数末尾（支持含空格路径）
- `args`：支持 JSON 数组或带引号字符串解析，避免空格拆词
- 持久注入：`Page.addScriptToEvaluateOnNewDocument` + 定时 `CDP.List()` 轮询/Target 监听
- `ensureAiPanelOpen()`：注入后尽力点击 Activity Bar/侧栏的 Chat/AI 图标以打开聊天面板

### 前端测试页（已集成，先用于全量验证）
- 表单项：实例 ID、Cursor 路径、用户数据目录、打开目录、其他启动参数（`args`）、注入轮询时长（`pollMs`）、扫描范围、单端口注入、批量启动模板、停止指定 PID、历史根设置/读取、清缓存、服务器状态/健康检查、历史调试、项目列表、获取当前内容、发送/拉取最新回复。
- 发送消息：定向到 `instanceId`；接收侧 DOM 广播与历史轮询同时可用。
- 拉取回复：先清缓存，再 `GET /api/chats?includeUnmapped=true`，兼容 `assistant/assistant_bot`。

### 优化方向
- 多实例历史管理器：按实例维护独立的 `CursorHistoryManager` 与缓存，新增 `/api/instances/:id/chats`。
- 会话精确定位：注入端回传当前会话线索（composerId 等），前端仅轮询该会话。
- 安全：管理端口认证（Token/Bearer）、限制 CORS。
- 监控：DB mtime 触发缓存失效；状态灯（WS/注入/内容/心跳）。

---

## 发送同步 + 历史拉取方案（设计说明）

### 目标
- 在 Web 前端提供一个“发送框”，把消息同步到 Cursor 的输入并触发发送；
- 返回侧不再依赖流式 WebSocket，而是改为“从本地历史记录读取最新回复”。

### 关键要点
- **发送链路已具备**：Web 前端通过 WS 发送 `user_message`，注入脚本把文本粘贴进 Cursor 输入框并点击发送。
- **历史读取已具备**：服务端已暴露 `GET /api/chats`、`GET /api/history` 等接口，可从本机 SQLite 拉取会话与消息。
- **缓存存在**：历史读取默认 30 秒缓存；可通过已有 `GET /api/history/cache/clear` 临时绕过。
- **权衡**：放弃流式推送，转为轮询历史，鲁棒性更高但有写入延迟与会话映射问题。

---

### 代码证据（可点击跳转）

- Web 前端发送 `user_message`（表单提交/回车/按钮）

```startLine:52:endLine:76:public/js/modules/EventManager.js
if (sendForm && sendInput) {
    const submitHandler = (e) => {
        e.preventDefault();
        const msg = sendInput.value.trim();
        ...
        const success = this.client.wsManager.send({ type: 'user_message', data: msg });
        if (success) {
            sendInput.value = '';
        }
    };
}
```

- 注入脚本将文本写入 Cursor 输入框并点击“发送”

```startLine:669:endLine:707:public/cursor-browser.js
// 处理用户消息 - 将消息发送到 Cursor 聊天输入框
handleUserMessage(messageText) {
    const inputDiv = document.querySelector('div.aislash-editor-input[contenteditable="true"]');
    ...
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', messageText);
    const pasteEvent = new ClipboardEvent('paste', { ... });
    inputDiv.dispatchEvent(pasteEvent);
    setTimeout(() => { this.clickCursorSendButton(); }, 100);
}
```

```startLine:719:endLine:747:public/cursor-browser.js
// 点击 Cursor 发送按钮
clickCursorSendButton() {
    const sendBtn = document.querySelector('.anysphere-icon-button .codicon-arrow-up-two')?.parentElement;
    if (sendBtn && sendBtn.offsetParent !== null && !sendBtn.disabled) {
        sendBtn.click();
        return true;
    }
    // 备用选择器...
}
```

- 服务端 WS：接收并转发 `user_message`；广播 HTML 内容

```startLine:72:endLine:86:services/websocketManager.js
handleMessage(ws, data) {
    const message = JSON.parse(data.toString());
    switch (message.type) {
        case 'html_content': this.handleHtmlContent(ws, message); break;
        case 'user_message': this.handleUserMessage(ws, message); break;
        ...
    }
}
```

```startLine:155:endLine:163:services/websocketManager.js
// 处理用户消息
handleUserMessage(ws, message) {
    this.broadcastToClients({ type: 'user_message', data: message.data, timestamp: Date.now() }, ws);
}
```

```startLine:133:endLine:153:services/websocketManager.js
// 广播至所有客户端
broadcastToClients(message, sender) {
    const messageStr = JSON.stringify(message);
    this.connectedClients.forEach(client => { ... client.send(messageStr) ... });
}
```

- 历史/聊天接口（HTTP）

```startLine:158:endLine:166:routes/contentRoutes.js
// 获取聊天记录（聚合会话）
async handleGetChats(req, res) {
    const chats = await this.historyManager.getChats();
    res.json(chats);
}
```

```startLine:173:endLine:187:routes/contentRoutes.js
// 获取单个聊天记录
async handleGetChat(req, res) {
    const { sessionId } = req.params;
    const chat = await this.historyManager.getHistoryItem(sessionId);
    res.json(chat);
}
```

```startLine:11:endLine:45:routes/historyRoutes.js
// 历史路由汇总（列表、搜索、导出、缓存清理、项目等）
setupRoutes() {
    router.get('/history', this.getHistory.bind(this));
    router.get('/history/stats', this.getStats.bind(this));
    router.get('/history/debug', this.getDebugInfo.bind(this));
    router.get('/history/cursor-path', this.getCursorRoot.bind(this));
    router.post('/history/cursor-path', this.setCursorRoot.bind(this));
    router.get('/history/cache/clear', this.clearCache.bind(this));
    router.get('/history/projects', this.getProjects.bind(this));
    router.get('/history/search', this.searchHistory.bind(this));
    router.get('/history/export', this.exportHistory.bind(this));
    router.get('/history/:id', this.getHistoryItem.bind(this));
    router.post('/history', this.addHistory.bind(this));
    router.delete('/history/:id', this.deleteHistory.bind(this));
    router.delete('/history', this.clearHistory.bind(this));
}
```

```startLine:284:endLine:292:routes/historyRoutes.js
// 清空后端提取缓存
async clearCache(req, res){
    if (this.historyManager?.clearCache) this.historyManager.clearCache();
    res.json({success:true, message:'cache cleared'});
}
```

- 历史提取缓存（30s）

```startLine:6:endLine:12:services/cursorHistoryManager-real.js
class CursorHistoryManager {
    constructor() {
        this.cursorStoragePath = this.getCursorStoragePath();
        this.cachedHistory = null;
        this.lastCacheTime = 0;
        this.cacheTimeout = 30000; // 30秒缓存
    }
}
```

- 前端发送表单（存在发送框）

```startLine:40:endLine:44:public/index.html
<form id="send-form" autocomplete="off">
  <input id="send-input" type="text" placeholder="输入消息..." autocomplete="off" />
  <button id="send-btn" type="submit">发送</button>
  <button id="clear-btn" type="button">清除</button>
</form>
```

- 备用轮询能力示例（已用于拉取当前 HTML 内容）

```startLine:79:endLine:92:public/js/modules/StatusManager.js
startContentPolling() {
  this.contentPollingInterval = setInterval(async () => {
    const response = await fetch('/api/content');
    const result = await response.json();
    if (result.success && result.data && this.onContentPollingCallback) {
      this.onContentPollingCallback(result.data);
    }
  }, 10000);
}
```

---

## 方案 1：最小改动（推荐先上）

不改后端结构，发送侧沿用现有 WS → 注入脚本逻辑；返回侧统一采用“短周期轮询历史 + 常驻轮询”展示，不再使用 WS 回显。

1) 前端发送后的轮询策略
- 发送成功后记录 `sentAt = Date.now()`；
- 进入短周期轮询：2s、2s、5s、10s（最多 4~6 次，或总时长 ~20s）；
- 每次调用下列任一接口：
  - `GET /api/chats`（推荐，聚合为会话，包含 `messages`）；
  - 或 `GET /api/history?limit=1&sortBy=timestamp&sortOrder=desc`（全局最近项）。
- 选择“最近活跃会话”的“最新 assistant 气泡”作为回复展示。

2) 新消息判定（去重与归属）
- 基线法：发送前缓存“最近会话的最后一条消息哈希”；轮询时若新末尾为 `assistant` 且哈希不同，即认为是新回复；
- 时间阈值法：若消息对象含时间（或会话 `lastUpdatedAt`），要求 `> sentAt`；
- 兜底：若多会话并发，选择“最近更新会话”的末尾 `assistant`。

3) 缓存与失败回退
- 若 6~10 秒无新消息，调用 `GET /api/history/cache/clear` 一次后继续轮询；
- 若 20 秒仍未出现，提示“可能未写入历史或回复失败”，允许“重试”。

4) 前端示例（伪代码）

```js
async function pollLatestReply({ sentAt, maxTries = 6 }) {
  const delays = [2000, 2000, 5000, 10000, 10000, 10000];
  const baseline = getBaselineHashOfLatestMessage();
  for (let i = 0; i < Math.min(maxTries, delays.length); i++) {
    await sleep(delays[i]);
    const chats = await fetchJson('/api/chats');
    const { session, lastMsg } = pickMostRecentlyUpdatedAssistant(chats);
    if (lastMsg && hash(lastMsg) !== baseline && (lastMsg.timestamp ? lastMsg.timestamp > sentAt : true)) {
      renderAssistantReply(lastMsg);
      return true;
    }
    if (i === 2) { await fetchJson('/api/history/cache/clear').catch(() => {}); }
  }
  notifyTimeout();
  return false;
}
```

5) 用户体验
- 有“发送中/等待回复”的轻提示；命中后滚动到最新；
- 支持中断轮询（用户切换标签或再次发送）。

— 适用场景：快速上线、低改动、健壮性优先。

---

## 方案 2：增强方案（精准会话/绕过缓存/更快可见）

在方案 1 基础上，增强后端与注入脚本，提升“会话归属准确度”与“接近实时”。

1) 后端支持绕过缓存（最小改造）
- 为 `GET /api/history`、`GET /api/chats` 增加 `?nocache=1` 或 `?maxAgeMs=2000`；
- 实现建议：在路由处理开始处，检测参数后调用 `historyManager.clearCache()` 或临时降低 `cacheTimeout`。

2) 会话 ID 绑定（精准匹配）
- 注入脚本在发送 `user_message` 时，尽量附带“当前会话线索（如 composerId / workspaceId）”；
- 服务端在 `getChats()` 聚合后按该线索过滤会话，前端只轮询该会话；
- 若 DOM 难以直接拿到 ID，可采用“发送前/后快照差分”识别活跃会话（例如对 `chatdata`/`bubbles` 数量变化进行比对）。

3) 更快可见（可选）
- 为 `GET /api/chats` 增加 `updatedAfter=sentAt` 过滤，减少前端判断成本；
- 历史管理器内部：若启用 `nocache`，临时复制 SQLite 到临时文件后读取，尽量避免锁与延迟（已有 `better-sqlite3` 优先路径）。

4) 简易路由改造示例（伪代码）

```js
// routes/historyRoutes.js
router.get('/history', async (req, res) => {
  const { nocache, maxAgeMs } = req.query;
  if (nocache) historyManager.clearCache?.();
  if (maxAgeMs) historyManager.cacheTimeout = Math.min(+maxAgeMs, 5000);
  const data = await historyManager.getHistory({ ...req.query });
  res.json({ success: true, data });
});
```

— 适用场景：多并发会话、需要更准确的“回包归属”、对时延更敏感。

---

### 风险与缓解
- 写入延迟：采用短周期轮询 + `nocache/clear` 兜底；
- 会话映射不准：启用会话线索/快照对比；
- Windows SQLite 锁：优先 `better-sqlite3` 只读 + 必要时临时拷贝再读；
- DOM 变更导致注入失败：已提供多套选择器 + 键盘回车兜底。

### 接口清单（相关）
- `GET /api/chats`（会话聚合）
- `GET /api/chat/:sessionId`（单会话详情）
- `GET /api/history`、`GET /api/history/search`、`GET /api/history/export`
- `GET /api/history/cache/clear`（清缓存）
- `GET /api/content`（当前 HTML 内容，轮询示例）

### 验收与测试要点
- 单聊往返：发送后 ≤ 5s 呈现最新 assistant 回复；
- 多并发：快速连续发送两条，确认不会串线；
- 异常：断网/SQLite 锁/无写入时给出提示且可重试；
- 跨平台：Windows 下可稳定读取历史。

### 下一步
- 先落地“方案 1”前端轮询与去重；
- 视体验决定是否接入“方案 2”的 `nocache` 与会话线索。


---

## 以实例 openPath 为核心（共享账号）方案（新增）

### 目标
- 在不启用 `userDataDir`（共享同一账号历史数据库）的前提下，统一用实例的 `openPath` 驱动：
  - 聊天发送定向（已具备）、
  - Git 根目录解析（已具备）、
  - 历史记录范围过滤（新增最小改造）。

### 原则
- 不改变 Cursor 账号与 SQLite 根路径，仅对读取结果集进行“基于 `openPath` 的服务器端过滤”。
- 前端全站透传 URL 参数 `?instance=` 以实现实例上下文的统一。

### 后端改造（最小）
- 新增接口
  - `GET /api/instances`：读取根目录或 `config/instances.json` 并返回数组（`id/cursorPath/userDataDir/openPath/args/pollMs`）。
- 历史接口扩展（保持兼容）
  - `GET /api/history?instance={id}&limit=...&mode=cv`
  - `GET /api/chats?instance={id}`
  - `GET /api/history/projects?instance={id}`
  - 支持 `nocache=1` 或 `maxAgeMs=2000` 以绕过/降低 30s 缓存时效。
- 过滤逻辑
  - 解析 `instanceId → openPath`（与 `routes/gitRoutes.js` 相同的查找策略，支持根目录与 `config/instances.json` 两位置）。
  - 若解析到 `openPath`：
    - 对 `getChats()/getHistory()` 结果进行路径过滤：仅保留“会话项目根路径与 `openPath` 相等或位于其子路径”的会话；
    - `projects` 汇总同理按项目根过滤。
  - 若未解析到或 `openPath` 为空：跳过过滤，行为与当前保持一致。
- 路径归一（保证 Windows 与 Cursor 风格可比较）
  - 统一分隔符：`\` → `/`；
  - 盘符规范化：`D:/...`、`d:\...` 标准化为 `D:\...`；
  - Cursor 风格与本地风格互通：`/d%3A/Repos/...` ↔ `D:\Repos\...`；
  - 移除多余前导斜杠与大小写归一；比较采用“相等或前缀（子路径）”。
- 缓存
  - 默认保留 30s 缓存；当传入 `nocache/maxAgeMs` 时，清理缓存或临时调低缓存时长，仅对本次请求生效。

### 前端改造
- 统一透传 `?instance=`：主页、历史页、Git 页均从 URL 读取并在发起请求时附带。
- 历史页请求：
  - `/api/history?instance=...`、`/api/history/projects?instance=...`
- “当前活动目录”视图：
  - 若存在 `instance`，直接使用该实例的 `openPath` 作为活动目录基准显示与过滤；
  - 否则回退至 `/api/health` 返回的 `workspace`。
- Git 与聊天发送：已支持实例（`public/git-manager.js`、WS `targetInstanceId`）；仅确保页面 URL 携带 `?instance=`。

### 兼容与回退
- 未传 `instance`：维持当前全量历史行为。
- `instance` 无效或 `openPath` 不存在：跳过过滤并在前端做轻提示（可选）。
- 不涉账号切换，确保历史数据仍来自同一套 SQLite。

### 风险与缓解
- 个别会话项目根推断失败：采用“相等或包含”的宽松匹配，并保留 `includeUnmapped` 作为兜底开关。
- 大结果集过滤的性能消耗：优先使用缓存，在缓存结果上进行过滤；前端使用 `limit` 限制条目数。

### 验收清单
- 切换不同实例：
  - Git 根指向对应 `openPath`，分支/状态/拉取正常；
  - 历史页仅展示该 `openPath` 范围内的项目与会话，项目聚合与详情一致；
  - 聊天发送定向到该实例（WS `targetInstanceId`）。
- 未带 `instance`：各页行为与现状一致。

### 实施顺序（建议）
1. 新增 `GET /api/instances`；
2. 为 `history/chats/projects` 增加 `?instance=` 与 `nocache/maxAgeMs` 支持，并接入统一路径过滤；
3. 历史页透传 `?instance=`，并用实例 `openPath` 渲染“当前活动目录”；
4. 联调 Git 与聊天（仅校验 URL 透传）。

### 可选增强（后续）
- 响应头加入“已按 openPath 过滤”的标记，前端展示上下文提示；
- 历史页提供“显示未映射/全量”的切换按钮，便于调试过滤效果。

### 结论
- 在共享账号前提下，以实例 `openPath` 统一 Git/聊天/历史可行、改造面小，便于快速上线与后续渐进增强。

