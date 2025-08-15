"use strict";

// 聊天管理器 - 备用版本（不依赖SQLite，纯内存）
class ChatManager {
  constructor() {
    this.currentContentHtml = "";
    this.lastActivity = Date.now();
    this.lastContentTimestamp = 0;
    this.clearTimestamp = 0;
    console.log("📱 使用备用聊天管理器 - SQLite不可用");
  }

  // 兼容旧接口：直接设置内容
  setContent(content) {
    try {
      const html = String(content || "");
      const changed = html !== this.currentContentHtml;
      this.currentContentHtml = html;
      this.lastContentTimestamp = Date.now();
      this.lastActivity = Date.now();
      if (changed) {
        console.log(`📝 内容已更新: ${html.substring(0, 100)}...`);
      }
    } catch (error) {
      console.log("⚠️ setContent 失败：", error.message);
    }
  }

  // 新接口：HTTP/WS 调用
  updateContent(html, timestamp) {
    try {
      const incomingHtml = String(html || "");
      const incomingTs = Number(timestamp || Date.now());

      // 清理时间戳保护：过滤旧内容
      if (this.clearTimestamp && incomingTs < this.clearTimestamp) {
        return { success: true, message: "内容早于清理时间点，已过滤", filtered: true };
      }

      if (incomingHtml === this.currentContentHtml) {
        this.lastActivity = Date.now();
        return { success: true, message: "内容未变化，跳过更新", filtered: false };
      }

      this.currentContentHtml = incomingHtml;
      this.lastContentTimestamp = incomingTs;
      this.lastActivity = Date.now();
      return { success: true };
    } catch (error) {
      console.log("❌ updateContent 出错：", error.message);
      return { success: false, message: error.message };
    }
  }

  // 获取内容
  getContent() {
    return {
      html: this.currentContentHtml,
      hasContent: this.currentContentHtml.length > 0,
      timestamp: this.lastContentTimestamp,
      clearTimestamp: this.clearTimestamp,
    };
  }

  // 最近活动
  getLastActivity() {
    return this.lastActivity;
  }

  // 清空内容并记录清理时间戳
  clearContent(timestamp) {
    this.currentContentHtml = "";
    this.clearTimestamp = Number(timestamp || Date.now());
    this.lastContentTimestamp = 0;
    this.lastActivity = Date.now();
    console.log("🗑️ 内容已清除，清理时间戳：", new Date(this.clearTimestamp).toLocaleString());
    return { timestamp: this.clearTimestamp };
  }

  // 仅同步清理时间戳
  syncClearTimestamp(timestamp) {
    this.clearTimestamp = Number(timestamp || Date.now());
    this.lastActivity = Date.now();
    console.log("🔄 同步清理时间戳：", new Date(this.clearTimestamp).toLocaleString());
    return { timestamp: this.clearTimestamp };
  }

  // 状态
  getStatus() {
    return {
      hasContent: this.currentContentHtml.length > 0,
      contentLength: this.currentContentHtml.length,
      lastActivity: this.lastActivity,
      lastContentTimestamp: this.lastContentTimestamp,
      clearTimestamp: this.clearTimestamp,
      mode: "fallback",
    };
  }
}

module.exports = ChatManager;


