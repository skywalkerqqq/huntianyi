const _ensureShotDir = (() => { const fs = require("node:fs"); fs.mkdirSync("_archive/screenshots", { recursive: true }); return true; })();
const { launch } = require("./_pw.cjs");

const BASE = process.env.BASE || "http://127.0.0.1:8771";
const errors = [];

(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 180));
  });
  p.on("pageerror", (e) => errors.push("PAGEERROR " + e.message.slice(0, 180)));

  await p.goto(BASE + "/flat", { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(1800);

  const vb = () => p.locator("svg.skymap").getAttribute("viewBox");
  console.log("vb init      :", await vb());

  /* --- 滚轮缩放 --- */
  await p.mouse.move(760, 470);
  for (let i = 0; i < 5; i++) await p.mouse.wheel(0, -240);
  await p.waitForTimeout(400);
  const afterWheel = await vb();
  const pct1 = await p.locator(".zval").textContent();
  console.log("vb after wheel:", afterWheel, "| zoom:", pct1);

  /* --- 按钮放大 --- */
  await p.locator(".zbtn").first().click();
  await p.waitForTimeout(350);
  console.log("zoom after [+]:", await p.locator(".zval").textContent());

  /* --- 缩小 --- */
  await p.locator(".zbtn").nth(1).click();
  await p.locator(".zbtn").nth(1).click();
  await p.waitForTimeout(350);
  console.log("zoom after [-]:", await p.locator(".zval").textContent());

  /* --- Alt 拖动平移 --- */
  const before = await vb();
  await p.keyboard.down("Alt");
  await p.mouse.move(700, 450);
  await p.mouse.down();
  await p.mouse.move(820, 520, { steps: 10 });
  await p.mouse.up();
  await p.keyboard.up("Alt");
  await p.waitForTimeout(300);
  console.log("pan changed  :", before !== (await vb()), "| vb:", await vb());

  /* --- 双击复位（在图心执行） --- */
  await p.locator("svg.skymap").dblclick({ position: { x: 556, y: 369 } });
  await p.waitForTimeout(400);
  console.log("vb after dbl :", await vb(), "| zoom:", await p.locator(".zval").textContent());

  /* --- 放大后旋转仍能拖（放坐标系已适配） --- */
  for (let i = 0; i < 4; i++) await p.mouse.wheel(0, -240);
  const angBefore = await p.locator(".ring-outer").getAttribute("transform");
  await p.mouse.move(760, 300);
  await p.mouse.down();
  await p.mouse.move(860, 420, { steps: 12 });
  await p.mouse.up();
  await p.waitForTimeout(300);
  console.log("rotate while zoomed:", angBefore, "→", await p.locator(".ring-outer").getAttribute("transform"));

  /* --- 放大后点击星点仍能出详情（事件委托是否生效） --- */
  await p.locator(".zbtn.zreset").click();
  await p.waitForTimeout(400);
  await p.locator(".ring-inner circle").nth(5).click({ force: true });
  await p.waitForTimeout(500);
  console.log("panel after delegated click:", await p.locator(".panel h2").textContent().catch(() => "NONE"));

  await p.screenshot({ path: "_archive/screenshots/z1_flat.png" });
  // 放大状态截图
  await p.locator(".zbtn").first().click();
  await p.locator(".zbtn").first().click();
  await p.locator(".zbtn").first().click();
  await p.waitForTimeout(500);
  await p.screenshot({ path: "_archive/screenshots/z2_zoom.png" });

  /* --- 切换耗时（来回各测一次） --- */
  for (const [from, name] of [[".switch-item:has-text('浑天仪')", "→ 浑天仪"], [".switch-item:has-text('盖天图')", "→ 盖天图"]]) {
    const t0 = Date.now();
    await p.locator(from).click();
    await p.waitForURL((u) => new URL(u).pathname !== "/flat" === (name.includes("浑天仪")), { timeout: 20000 });
    await p.waitForSelector(".dock", { state: "visible", timeout: 20000 });
    const t1 = Date.now();
    console.log(`switch ${name}: ${t1 - t0} ms`);
    await p.waitForTimeout(1200);
  }

  await b.close();
  console.log("\nconsole errors:", errors.length);
  errors.slice(0, 6).forEach((e) => console.log("  " + e));
})().catch((e) => {
  console.error("FATAL", e.message);
  process.exit(1);
});
