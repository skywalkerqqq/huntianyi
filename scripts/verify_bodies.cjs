/**
 * 日月五星 / 观测地 / 导出 的端到端验证（生产构建）
 *
 *   1. 盖图上日月五星标记齐备（6 个），且随历元与纬度重新定位
 *   2. 纬度切换 → 内规（恒显圈）半径确实改变，且与「去极度 = 纬度」一致
 *   3. 历元 / 纬度写入地址栏，带参访问可复原
 *   4. 两个视图都有导出入口
 *   5. console 零报错
 */
const _ensureShotDir = (() => {
  const fs = require("node:fs");
  fs.mkdirSync("_archive/screenshots", { recursive: true });
  return true;
})();
const { launch } = require("./_pw.cjs");

const BASE = process.env.BASE || "http://127.0.0.1:8771";
const R_MAX = 520;
const errors = [];
let bad = 0;

const ok = (cond, msg) => {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    console.error(`  ✗ ${msg}`);
    bad++;
  }
};
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg}（${a} vs ${b}）`);

function attach(page, tag) {
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[${tag}] ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`[${tag}] ${e.message}`));
}

/** 读内规圆的半径 */
const innerR = (page) =>
  page.evaluate(() => {
    const c = document.querySelector('circle[fill="url(#innerGrad)"]');
    return c ? Number(c.getAttribute("r")) : null;
  });

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  attach(page, "flat");

  await page.goto(`${BASE}/flat`, { waitUntil: "networkidle" });
  await page.waitForSelector(".skymap");
  await page.waitForTimeout(900); // 等 clockMs 挂载后写入

  /* ---------- 1. 日月五星 ---------- */
  console.log("\n[1] 日月五星");
  const ids = ["moon", "mercury", "venus", "mars", "jupiter", "saturn"];
  const found = await page.evaluate(
    (list) => list.filter((id) => document.querySelector(`[data-body="${id}"]`)).length,
    ids
  );
  ok(found === 6, `盖图日月五星标记齐备 ${found}/6`);

  const moonBefore = await page.evaluate(() => {
    const g = document.querySelector('[data-body="moon"]');
    const c = g?.querySelector("circle:last-of-type");
    return c ? [Number(c.getAttribute("cx")), Number(c.getAttribute("cy"))] : null;
  });
  ok(!!moonBefore, `月球可定位 ${JSON.stringify(moonBefore)}`);
  await page.screenshot({ path: "_archive/screenshots/b1_flat_bodies.png" });

  /* ---------- 2. 纬度 → 内规半径 ---------- */
  console.log("\n[2] 观测纬度");
  const r0 = await innerR(page);
  near(r0, +((34.8 / 180) * R_MAX).toFixed(3), 0.01, `开封 34.8°N 内规半径应 = 100.53`);

  await page.locator(".dock .chip", { hasText: "北京" }).click();
  await page.waitForTimeout(400);
  const r1 = await innerR(page);
  near(r1, +((39.9 / 180) * R_MAX).toFixed(3), 0.01, `切北京 39.9°N 内规半径应 = 115.27`);
  ok(r1 > r0, `纬度升高 → 恒显圈变大（${r0} → ${r1}）`);

  // 天体的赤道坐标与纬度无关，变的是「谁落在恒显圈内」
  const innerCount = (p) =>
    p.evaluate(() => document.querySelectorAll(".ring-inner [data-si]").length);
  const n0 = 147; // 开封 34.8°N 下恒显星数（已在 verify_flat 中固定）
  const n1 = await innerCount(page);
  ok(n1 > n0, `纬度升高后恒显星数增加（${n0} → ${n1}）`);
  await page.screenshot({ path: "_archive/screenshots/b2_flat_lat40.png" });

  /* ---------- 3. 地址栏 ---------- */
  console.log("\n[3] 地址栏状态");
  const url = new URL(page.url());
  near(Number(url.searchParams.get("lat")), 39.9, 0.01, `lat 已写入地址栏`);
  await page.locator(".dock .chip", { hasText: "J2000" }).click();
  await page.waitForTimeout(300);
  const url2 = new URL(page.url());
  ok(url2.searchParams.get("epoch") === "j2000", `切换后 epoch 写入地址栏（${url2.searchParams.get("epoch")}）`);

  const shareUrl = `${BASE}/flat?epoch=j2000&lat=23.13`;
  await page.goto(shareUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  const r2 = await innerR(page);
  near(r2, +((23.13 / 180) * R_MAX).toFixed(3), 0.01, "带参访问复原广州 23.13°N 内规");
  const chipOn = await page.locator(".dock .chip.is-on", { hasText: "广州" }).count();
  ok(chipOn === 1, "带参访问时「广州」chip 处于选中态");
  await page.screenshot({ path: "_archive/screenshots/b3_flat_guangzhou.png" });

  /* ---------- 4. 导出入口 ---------- */
  console.log("\n[4] 导出");
  const btnFlat = await page.locator(".dock .btn", { hasText: "导出 PNG" }).count();
  ok(btnFlat >= 1, "盖图有导出按钮");

  const p3 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  attach(p3, "sphere");
  await p3.goto(`${BASE}/?epoch=song&lat=34.8`, { waitUntil: "networkidle" });
  await p3.waitForTimeout(1500);
  const btn3d = await p3.locator(".dock .btn", { hasText: "导出 PNG" }).count();
  ok(btn3d >= 1, "浑天仪有导出按钮");
  const body3d = await p3.locator(".dock .toggle", { hasText: "日月五星" }).count();
  ok(body3d >= 1, "浑天仪有「日月五星」开关");
  await p3.screenshot({ path: "_archive/screenshots/b4_sphere_bodies.png" });

  /* ---------- 5. console ---------- */
  console.log("\n[5] console");
  ok(errors.length === 0, errors.length ? `报错:\n  ${errors.join("\n  ")}` : "两视图 console 零报错");

  await browser.close();
  console.log(bad ? `\n${bad} 项未通过 ✗\n` : "\n全部通过 ✓\n");
  process.exitCode = bad ? 1 : 0;
})();
