const _ensureShotDir = (() => { const fs = require("node:fs"); fs.mkdirSync("_archive/screenshots", { recursive: true }); return true; })();
const { launch } = require("./_pw.cjs");

const BASE = "http://127.0.0.1:8771";

const errors = [];
function attach(page, tag) {
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[${tag}] ${m.text().slice(0, 200)}`);
  });
  page.on("pageerror", (e) => errors.push(`[${tag}] PAGEERROR ${e.message.slice(0, 200)}`));
}

(async () => {
  const browser = await launch();

  /* ---------- 桌面：1440×900 ---------- */
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  attach(page, "desktop");

  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "_archive/screenshots/d1_sphere.png" });

  // 视图切换：点「盖天图」
  const switchItems = await page.locator(".switch-item").allTextContents();
  console.log("switch items:", JSON.stringify(switchItems));
  await page.locator(".switch-item", { hasText: "盖天图" }).click();
  await page.waitForURL("**/flat", { timeout: 15000 });
  await page.waitForTimeout(2200);
  const url1 = page.url();
  console.log("after click →", url1);
  await page.screenshot({ path: "_archive/screenshots/d2_flat.png" });

  // 再切回浑天仪
  await page.locator(".switch-item", { hasText: "浑天仪" }).click();
  await page.waitForURL((u) => new URL(u).pathname === "/", { timeout: 15000 });
  await page.waitForTimeout(2000);
  console.log("back to →", page.url());

  // 盖天图：点击一颗星 → 详情面板
  await page.goto(BASE + "/flat", { waitUntil: "networkidle" });
  await page.waitForTimeout(2200);
  const dots = await page.locator(".ring-inner circle").count();
  console.log("inner ring circles:", dots);
  await page.locator(".ring-inner circle").nth(3).click({ force: true });
  await page.waitForTimeout(700);
  const panelTitle = await page.locator(".panel h2").textContent().catch(() => null);
  console.log("panel title:", panelTitle);
  await page.screenshot({ path: "_archive/screenshots/d3_flat_panel.png" });

  // Dock 折叠
  await page.locator(".dock-head").click();
  await page.waitForTimeout(600);
  const collapsed = await page.locator(".dock").getAttribute("class");
  console.log("dock class after collapse:", collapsed);
  await page.locator(".dock-head").click();
  await page.waitForTimeout(600);

  await ctx.close();

  /* ---------- 移动端：390×844 ---------- */
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const m = await mctx.newPage();
  attach(m, "mobile");
  await m.goto(BASE + "/flat", { waitUntil: "networkidle", timeout: 60000 });
  await m.waitForTimeout(2400);
  await m.screenshot({ path: "_archive/screenshots/m1_flat.png" });
  await m.goto(BASE + "/", { waitUntil: "networkidle" });
  await m.waitForTimeout(2400);
  await m.screenshot({ path: "_archive/screenshots/m2_sphere.png" });
  await mctx.close();

  await browser.close();

  console.log("\n=== console errors:", errors.length, "===");
  errors.slice(0, 10).forEach((e) => console.log("  " + e));
})().catch((e) => {
  console.error("FATAL", e.message);
  process.exit(1);
});
