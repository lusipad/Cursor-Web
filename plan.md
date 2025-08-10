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

不改后端结构，发送侧沿用现有 WS → 注入脚本逻辑；返回侧通过“短周期轮询历史”拿到最新助手回复。

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


