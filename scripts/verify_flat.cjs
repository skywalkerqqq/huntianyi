const _ensureShotDir = (() => { const fs = require("node:fs"); fs.mkdirSync("_archive/screenshots", { recursive: true }); return true; })();
const { launch } = require("./_pw.cjs");

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 220));
  });
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message.slice(0, 220)));
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`);
  });

  await page.goto("http://localhost:8771/flat", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "_archive/screenshots/shot_flat.png" });

  const info = await page.evaluate(() => {
    const outer = document.querySelector("g.ring-outer");
    const inner = document.querySelector("g.ring-inner");
    return {
      stars: document.querySelectorAll('circle[style*="pointer"]').length,
      innerStars: inner ? inner.querySelectorAll("circle").length : 0,
      outerStars: outer ? outer.querySelectorAll("circle").length : 0,
      polylines: document.querySelectorAll("polyline").length,
      outerT: outer?.getAttribute("transform"),
      innerT: inner?.getAttribute("transform"),
    };
  });
  console.log("LAYERS:", JSON.stringify(info));

  // SVG 屏幕映射
  const rect = await page.evaluate(() => {
    const r = document.querySelector("svg.skymap").getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const scale = Math.min(rect.width, rect.height) / 1160;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const pt = (sx, sy) => [cx + sx * scale, cy + sy * scale];

  // —— 测试 1：拖动外圈（半径 300 > 内规 100）→ 外圈转，联动时内圈同步 ——
  const [ox, oy] = pt(300, 0);
  await page.mouse.move(ox, oy);
  await page.mouse.down();
  await page.mouse.move(...pt(300, 120), { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  let t = await page.evaluate(() => ({
    o: document.querySelector("g.ring-outer").getAttribute("transform"),
    i: document.querySelector("g.ring-inner").getAttribute("transform"),
  }));
  console.log("DRAG_OUTER:", JSON.stringify(t));

  await page.click('.chip:text-is("归零")');
  await page.waitForTimeout(200);

  // —— 测试 2：拖动内圈（半径 60 < 内规）→ 内圈转 ——
  const [ix, iy] = pt(0, 60);
  await page.mouse.move(ix, iy);
  await page.mouse.down();
  await page.mouse.move(...pt(60, 60), { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  t = await page.evaluate(() => ({
    o: document.querySelector("g.ring-outer").getAttribute("transform"),
    i: document.querySelector("g.ring-inner").getAttribute("transform"),
  }));
  console.log("DRAG_INNER:", JSON.stringify(t));
  await page.screenshot({ path: "_archive/screenshots/shot_flat_rot.png" });

  // —— 测试 2.5：取消联动 → 拖外圈，内圈应保持不变 ——
  await page.click('.chip:text-is("归零")');
  await page.evaluate(() => {
    const boxes = [...document.querySelectorAll(".console input")];
    const lk = boxes.find((b) => b.parentElement?.textContent?.includes("内外圈联动"));
    if (lk) lk.click();
  });
  await page.waitForTimeout(150);
  const [ox2, oy2] = pt(300, 0);
  await page.mouse.move(ox2, oy2);
  await page.mouse.down();
  await page.mouse.move(...pt(300, 140), { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const t2 = await page.evaluate(() => ({
    o: document.querySelector("g.ring-outer").getAttribute("transform"),
    i: document.querySelector("g.ring-inner").getAttribute("transform"),
  }));
  console.log("UNLINKED_DRAG_OUTER:", JSON.stringify(t2));
  await page.screenshot({ path: "_archive/screenshots/shot_flat_unlinked.png" });
  // 恢复联动
  await page.evaluate(() => {
    const boxes = [...document.querySelectorAll(".console input")];
    const lk = boxes.find((b) => b.parentElement?.textContent?.includes("内外圈联动"));
    if (lk) lk.click();
  });

  // —— 测试 3：自动旋转 ——
  await page.click('.chip:text-is("归零")');
  await page.evaluate(() => {
    const boxes = [...document.querySelectorAll(".console input")];
    const spin = boxes.find((b) => b.parentElement?.textContent?.includes("自动旋转"));
    if (spin) spin.click();
  });
  await page.waitForTimeout(1200);
  const spun = await page.evaluate(() =>
    document.querySelector("g.ring-outer").getAttribute("transform")
  );
  console.log("AUTO_SPIN:", spun);
  // 关掉
  await page.evaluate(() => {
    const boxes = [...document.querySelectorAll(".console input")];
    const spin = boxes.find((b) => b.parentElement?.textContent?.includes("自动旋转"));
    if (spin) spin.click();
  });

  // —— 测试 4：点击星 ——
  await page.click('.chip:text-is("归零")');
  const stars = page.locator('circle[style*="pointer"]');
  let name = null;
  for (const idx of [400, 700, 200]) {
    try {
      await stars.nth(idx).click({ timeout: 3000 });
      await page.waitForTimeout(250);
      name = await page.evaluate(() => document.querySelector(".panel h2")?.textContent);
      if (name) { console.log("PANEL_OK ->", name); break; }
    } catch (e) {}
  }
  if (!name) console.log("PANEL_MISS");
  await page.screenshot({ path: "_archive/screenshots/shot_flat_click.png" });

  await page.evaluate(() => document.querySelector(".panel .close")?.click());
  await page.click('.chip:text-is("紫微垣")');
  await page.waitForTimeout(400);
  await page.screenshot({ path: "_archive/screenshots/shot_flat_group.png" });

  console.log("CONSOLE_ERRORS:", errors.length ? JSON.stringify(errors, null, 2) : "none");
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
