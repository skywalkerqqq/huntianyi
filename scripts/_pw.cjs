/**
 * Playwright 解析器 —— 让回归脚本不依赖某台机器的绝对路径。
 *
 * 查找顺序：
 *   1. 项目内依赖（npm i -D playwright）
 *   2. 环境变量 PLAYWRIGHT_MODULE 指定的路径
 *   3. 常见的全局安装位置（含 WorkBuddy 托管 Node 的 workspace）
 *
 * 浏览器一律用系统 Chrome（swiftshader 软渲染，便于无 GPU 环境跑 WebGL）。
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CANDIDATES = [
  "playwright",
  process.env.PLAYWRIGHT_MODULE,
  path.join(process.env.APPDATA || "", "npm", "node_modules", "playwright"),
  path.join(process.env.LOCALAPPDATA || "", "npm", "node_modules", "playwright"),
  path.join(os.homedir(), ".workbuddy/binaries/node/workspace/node_modules/playwright"),
  "/usr/lib/node_modules/playwright",
  "/usr/local/lib/node_modules/playwright",
].filter(Boolean);

function loadPlaywright() {
  for (const c of CANDIDATES) {
    try {
      const mod = require(c);
      if (mod && mod.chromium) return mod;
    } catch {
      /* 继续试下一个 */
    }
  }
  throw new Error(
    "找不到 playwright。请任选其一：\n" +
      "  npm i -D playwright\n" +
      "  PLAYWRIGHT_MODULE=/abs/path/to/playwright node scripts/verify_xxx.cjs"
  );
}

/** 系统 Chrome 的候选路径（Windows / macOS / Linux） */
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

function findChrome() {
  return CHROME_CANDIDATES.find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
}

/** 启动浏览器（复用统一参数） */
async function launch() {
  const { chromium } = loadPlaywright();
  const executablePath = findChrome();
  return chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: [
      "--use-gl=swiftshader",
      "--enable-unsafe-swiftshader",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
    ],
  });
}

module.exports = { loadPlaywright, findChrome, launch };
