const _ensureShotDir = (() => { const fs = require("node:fs"); fs.mkdirSync("_archive/screenshots", { recursive: true }); return true; })();
const { launch } = require("./_pw.cjs");

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push("PAGEERROR: " + err.message));
  page.on("response", (res) => {
    if (res.status() >= 400) errors.push(`HTTP ${res.status()}: ${res.url()}`);
  });

  await page.goto("http://localhost:8771", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "_archive/screenshots/shot.png" });

  const canvasInfo = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    return c ? { w: c.width, h: c.height } : null;
  });

  // —— 交互 1：点击星 → 详情面板 ——
  let panelFound = false;
  const tries = [
    [640, 400], [600, 380], [680, 420], [560, 420],
    [700, 380], [620, 340], [660, 460], [700, 300], [580, 300],
  ];
  let starText = null;
  for (const [x, y] of tries) {
    await page.mouse.move(x, y);
    await page.waitForTimeout(250);
    const hasTip = await page.evaluate(() => !!document.querySelector(".tooltip"));
    await page.mouse.click(x, y);
    await page.waitForTimeout(350);
    const hasPanel = await page.evaluate(() => !!document.querySelector(".panel"));
    if (hasPanel) {
      panelFound = true;
      starText = await page.evaluate(() =>
        document.querySelector(".panel h2")?.textContent
      );
      console.log("PANEL_OK at", x, y, "->", starText);
      break;
    }
    if (hasTip) console.log("TIP_OK at", x, y);
  }
  if (!panelFound) console.log("PANEL_MISS: 未点到星");
  await page.screenshot({ path: "_archive/screenshots/shot_click.png" });

  // —— 交互 2：分组高亮 ——
  await page.evaluate(() => document.querySelector(".panel .close")?.click());
  await page.click('.chip:text-is("紫微垣")');
  await page.waitForTimeout(600);
  const chipActive = await page.evaluate(
    () => document.querySelector(".chip.active")?.textContent
  );
  console.log("CHIP_ACTIVE:", chipActive);
  await page.screenshot({ path: "_archive/screenshots/shot_group.png" });

  // 复位
  await page.click('.chip:text-is("全部")');

  console.log("CANVAS:", JSON.stringify(canvasInfo));
  console.log("CONSOLE_ERRORS:", errors.length ? JSON.stringify(errors, null, 2) : "none");

  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
