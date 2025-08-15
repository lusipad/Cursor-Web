/*
 * 自动注入 Cursor 浏览器脚本
 * 思路：
 * 1) 启动 Cursor 时开启远程调试端口 (--remote-debugging-port)
 * 2) 通过 Chrome DevTools Protocol (CDP) 连接到 Cursor
 * 3) 对所有页面执行：
 *    - Page.addScriptToEvaluateOnNewDocument：未来新文档都会自动注入
 *    - Runtime.evaluate：对现有已打开文档立刻执行
 *
 * Windows 下默认尝试常见 Cursor 安装路径；也可通过环境变量 CURSOR_PATH 指定 Cursor.exe 的绝对路径。
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const CDP = require('chrome-remote-interface');

const DEBUG_PORT = Number(process.env.CDP_PORT || 9222);
const EXIT_AFTER_READY = String(process.env.EXIT_AFTER_READY || '').trim() === '1';
const DETACH = String(process.env.DETACH || '1').trim() === '1';
const USER_DATA_DIR = process.env.USER_DATA_DIR || '';
const OPEN_PATH = process.env.OPEN_PATH || '';
const SHOULD_SPAWN = String(process.env.SHOULD_SPAWN || '1').trim() === '1';

function parseArgsEnv(raw) {
  try {
    const s = (raw == null) ? '' : String(raw);
    const trimmed = s.trim();
    if (!trimmed) return [];
    // JSON 数组优先（可避免空格路径被拆分）
    if (trimmed.startsWith('[')) {
      try {
        const arr = JSON.parse(trimmed);
        if (Array.isArray(arr)) return arr.map((x) => String(x));
      } catch {}
    }
    // 简易引号感知分割（空格分割，支持 '...'/"..." 包裹）
    const tokens = [];
    let buf = '';
    let quote = null;
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (quote) {
        if ((quote === '"' && ch === '"') || (quote === '\'' && ch === '\'')) {
          quote = null;
        } else {
          buf += ch;
        }
      } else {
        if (ch === '"' || ch === '\'') {
          quote = ch;
        } else if (ch === ' ') {
          if (buf) { tokens.push(buf); buf = ''; }
        } else {
          buf += ch;
        }
      }
    }
    if (buf) tokens.push(buf);
    return tokens.filter(Boolean);
  } catch {
    return [];
  }
}

function fileExists(p) {
  try { return !!(p && fs.existsSync(p)); } catch { return false; }
}

function resolveCursorPath() {
  const envPath = process.env.CURSOR_PATH;
  if (fileExists(envPath)) return envPath;

  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const candidates = [
    path.join(localAppData, 'Programs', 'Cursor', 'Cursor.exe'),
    path.join(localAppData, 'Cursor', 'Cursor.exe'),
  ];

  for (const p of candidates) {
    if (fileExists(p)) return p;
  }

  return null;
}

function waitForCDP(port, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function tryOnce() {
      const req = http.get({ host: '127.0.0.1', port, path: '/json/version', timeout: 2000 }, (res) => {
        if (res.statusCode === 200) {
          res.resume();
          resolve();
        } else {
          res.resume();
          if (Date.now() - start > timeoutMs) return reject(new Error('CDP 等待超时'));
          setTimeout(tryOnce, 500);
        }
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) return reject(new Error('CDP 等待超时'));
        setTimeout(tryOnce, 500);
      });
      req.on('timeout', () => {
        req.destroy();
        if (Date.now() - start > timeoutMs) return reject(new Error('CDP 等待超时'));
        setTimeout(tryOnce, 500);
      });
    })();
  });
}

function buildInjectionSource() {
  // 支持打包环境：在打包后使用可执行文件目录下的public文件夹
  const scriptPath = process.pkg 
    ? path.join(path.dirname(process.execPath), 'public', 'cursor-browser.js')
    : path.join(__dirname, '..', '..', 'public', 'cursor-browser.js');
  if (!fileExists(scriptPath)) {
    throw new Error(`未找到脚本：${scriptPath}`);
  }
  const raw = fs.readFileSync(scriptPath, 'utf8');
  // 允许通过环境变量注入实例ID
  const instanceId = process.env.INSTANCE_ID ? String(process.env.INSTANCE_ID) : '';
  const header = instanceId
    ? `try{ window.__cursorInstanceId = ${JSON.stringify(instanceId)} }catch(e){}`
    : '';
  // 包一层 IIFE，避免与页面变量冲突；并在异常时打印错误
  return `;(() => { try {\n${header}\n${raw}\n} catch (e) { console.error('cursor-browser.js injection error', e); } })();`;
}

async function injectIntoTarget(target, source, port) {
  let client;
  try {
    client = await CDP({ host: '127.0.0.1', port, target });
    const { Page, Runtime } = client;
    await Promise.all([Page.enable(), Runtime.enable()]);
    // 持久注入（对未来新文档生效）
    await Page.addScriptToEvaluateOnNewDocument({ source });
    // 立即对当前文档执行
    await Runtime.evaluate({ expression: source, includeCommandLineAPI: true, replMode: true });
  } catch (err) {
    console.error(`向目标注入失败 (${target && (target.id || target.webSocketDebuggerUrl || target.url || target.targetId) || 'unknown'}):`, err.message);
  } finally {
    if (client) {
      try { await client.close(); } catch {}
    }
  }
}

function targetLooksRelevant(t) {
  if (!t) return false;
  // 典型 Electron/VS Code/Cursor 目标类型
  if (t.type === 'page' || t.type === 'webview' || t.type === 'other') {
    const url = String(t.url || '');
    // workbench / webview 常见 URL 形式
    return (
      url.startsWith('vscode-file://') ||
      url.startsWith('vscode-webview://') ||
      url.includes('workbench') ||
      url.startsWith('file://') ||
      url.startsWith('devtools://') // 过滤 devtools? 这里先保留，后续再过滤
    );
  }
  return false;
}

async function main() {
  const cursorExe = resolveCursorPath();
  if (!cursorExe) {
    console.error('未能找到 Cursor 可执行文件。请设置环境变量 CURSOR_PATH 指向 Cursor.exe。\n示例：$env:CURSOR_PATH="C:\\\u005c\u005cUsers\\你\\AppData\\Local\\Programs\\Cursor\\Cursor.exe"');
    process.exit(2);
  }

  console.log('✅ 将启动 Cursor 并开启远程调试端口:', DEBUG_PORT);
  console.log('🟡 Cursor 路径:', cursorExe);

  // 启动 Cursor（默认使用系统账号目录）
  const extraArgsEnv = parseArgsEnv(process.env.CURSOR_ARGS);
  const launchArgs = [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--new-window',
    ...extraArgsEnv
  ];
  // 仅当明确提供 USER_DATA_DIR 时，才指定独立用户目录
  if (USER_DATA_DIR) {
    launchArgs.push(`--user-data-dir=${USER_DATA_DIR}`);
  } else {
    console.log('👤 使用系统默认 Cursor 账号目录（未指定 user-data-dir）');
  }

  // 打开指定路径/工作区（在所有开关参数后面追加，不与开关拼接，支持含空格路径）
  if (OPEN_PATH) {
    launchArgs.push(OPEN_PATH);
    console.log('📂 启动时打开路径：', OPEN_PATH);
  }

  let child = null;
  if (SHOULD_SPAWN) {
    child = spawn(cursorExe, launchArgs, {
      detached: DETACH,
      stdio: DETACH ? 'ignore' : 'inherit',
    });
    if (DETACH) child.unref();

    // 退出时尽量清理子进程（当未 detach 时）
    const tryKill = () => {
      try { if (child && !DETACH) child.kill(); } catch {}
    };
    process.on('exit', tryKill);
    process.on('SIGINT', () => { tryKill(); process.exit(0); });
    process.on('SIGTERM', () => { tryKill(); process.exit(0); });
  }

  // 等待 CDP 可用
  await waitForCDP(DEBUG_PORT);
  console.log('✅ 远程调试端口已就绪');

  // 读取注入脚本
  const source = buildInjectionSource();

  // 列出所有目标并注入（立即）
  const injected = new Set();
  async function listAndInjectOnce() {
    try {
      const targetsNow = await CDP.List({ host: '127.0.0.1', port: DEBUG_PORT });
      const rel = targetsNow.filter(targetLooksRelevant);
      if (rel.length === 0) {
        console.warn('⚠️ 暂无可注入目标（等待页面加载中）');
      }
      for (const t of rel) {
        const key = t.id || t.targetId || t.webSocketDebuggerUrl || t.url;
        if (key && injected.has(key)) continue;
        console.log('🚀 注入目标:', `${t.type} ${t.title || ''}`.trim(), '\n   URL:', t.url);
        await injectIntoTarget(t, source, DEBUG_PORT);
        if (key) injected.add(key);
      }
      return rel.length;
    } catch (e) {
      console.warn('列表/注入失败:', e.message);
      return 0;
    }
  }

  await listAndInjectOnce();

  // 在有限时间内轮询新目标，以适配某些环境禁用 Target 监听的情况
  const pollMs = Number(process.env.CDP_POLL_MS || 30000);
  const pollInterval = 1000;
  const start = Date.now();
  while (Date.now() - start < pollMs) {
    const count = await listAndInjectOnce();
    if (count > 0 && EXIT_AFTER_READY) {
      console.log('✅ 注入完成（测试模式提前退出）');
      return;
    }
    await new Promise(r => setTimeout(r, pollInterval));
  }

  if (EXIT_AFTER_READY) {
    console.log('✅ 注入流程已完成（按测试模式提前退出）。');
    return; // 测试模式：不常驻监听
  }

  // 监听新目标并尝试注入（后台驻留）— 某些环境会失败，失败则仅靠轮询
  try {
    const client = await CDP({ host: '127.0.0.1', port: DEBUG_PORT });
    const { Target } = client;
    await Target.setDiscoverTargets({ discover: true });
    Target.targetCreated(async ({ targetInfo }) => {
      try {
        if (targetLooksRelevant(targetInfo)) {
          console.log('🆕 发现新页面，尝试注入:', targetInfo.url);
          await injectIntoTarget(targetInfo, source, DEBUG_PORT);
        }
      } catch (e) {
        console.warn('新目标注入失败:', e.message);
      }
    });

    console.log('✨ 自动注入已就绪。你可以开始在 Cursor 使用聊天，脚本会在页面加载时自动注入。按 Ctrl+C 结束。');
  } catch (e) {
    console.warn('⚠️ 后台监听新目标失败：', e.message);
  }
}

main().catch((err) => {
  console.error('运行失败：', err);
  process.exit(1);
});



