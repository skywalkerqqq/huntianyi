/**
 * 历元（岁差）验证 —— 生产构建下跑
 *
 *   1. 默认历元为「北宋 1052」，hint 给出全表平均位移 10.70°
 *   2. 切到 J2000 / 当代，hint 文案随之变化，不存在「切了没反应」
 *   3. 盖图上同一颗星（勾陈一）的屏幕坐标确实随历元移动，且位移方向/量级正确
 *   4. 详情面板的去极度随历元变化，并标注当前历元
 *   5. 两个视图 console 零报错
 */
const _ensureShotDir = (() => {
  const fs = require("node:fs");
  fs.mkdirSync("_archive/screenshots", { recursive: true });
  return true;
})();
const { launch } = require("./_pw.cjs");
const fs = require("node:fs");

const BASE = process.env.BASE || "http://127.0.0.1:8771";
const sky = JSON.parse(fs.readFileSync("src/data/chineseSky.json", "utf8"));
const errors = [];

const STAR = "勾陈一";
const starIdx = sky.stars.findIndex((s) => s.zh === STAR);
const starJ2000 = sky.stars[starIdx];
console.log(`目标星：${STAR} (idx ${starIdx})`);
console.log(`  J2000 去极度 ${(90 - starJ2000.dec).toFixed(3)}°`);

const assert = (cond, msg) => {
  if (!cond) {
    console.error(`  ✗ ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`  ✓ ${msg}`);
  }
};

function attach(page, tag) {
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[${tag}] ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`[${tag}] ${e.message}`));
}

/** 读出盖图上某颗星的屏幕坐标 */
async function starXY(page, idx) {
  return page.evaluate((i) => {
    const el = document.querySelector(`[data-si="${i}"]`);
    if (!el) return null;
    const m = el.getAttribute("transform")?.match(/translate\(([-\d.]+)[ ,]([-\d.]+)\)/);
    if (m) return { x: +m[1], y: +m[2] };
    return { x: +el.getAttribute("cx"), y: +el.getAttribute("cy") };
  }, idx);
}

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  attach(page, "flat");

  /* ---------- 盖天图：几何是否真的随历元变 ---------- */
  await page.goto(`${BASE}/flat`, { waitUntil: "networkidle" });
  await page.waitForSelector(".skymap");

  console.log("\n[1] 盖天图历元切换");
  const chips = await page.locator(".dock .chips .chip").allTextContents();
  assert(
    chips.some((c) => c.includes("北宋")),
    `历元选择器存在（${chips.slice(0, 3).join(" / ")}）`
  );

  const hint0 = await page.locator(".dock .hint").first().textContent();
  assert(hint0.includes("10.70"), `默认历元为北宋，hint 含平均位移 10.70° —— "${hint0.trim()}"`);

  const p1052 = await starXY(page, starIdx);
  assert(p1052 != null, `${STAR} 可定位 ${JSON.stringify(p1052)}`);

  await page.locator(".dock .chip", { hasText: "J2000" }).click();
  await page.waitForTimeout(350);
  const hint1 = await page.locator(".dock .hint").first().textContent();
  const pJ2000 = await starXY(page, starIdx);
  assert(hint1.includes("星表原历元"), `切到 J2000 后文案变化 —— "${hint1.trim()}"`);
  assert(
    pJ2000 && (Math.abs(pJ2000.x - p1052.x) > 0.5 || Math.abs(pJ2000.y - p1052.y) > 0.5),
    `${STAR} 屏幕坐标随历元移动：(${p1052.x.toFixed(1)},${p1052.y.toFixed(1)}) → (${pJ2000.x?.toFixed(1)},${pJ2000.y?.toFixed(1)})`
  );
  await page.screenshot({ path: "_archive/screenshots/e1_flat_j2000.png" });

  /* ---------- 详情面板：去极度随历元变 ---------- */
  console.log("\n[2] 详情面板的坐标与历元");
  // 极区的星点在圆心附近，易被内圈底图挡住 —— 直接向目标元素派发事件
  await page.evaluate((i) => {
    const el = document.querySelector(`[data-si="${i}"]`);
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 720, clientY: 450 }));
  }, starIdx);
  await page.waitForSelector(".panel", { timeout: 5000 });
  let meta = await page.locator(".panel .meta").textContent();
  const qujiJ2000 = parseFloat(meta.match(/去极度([\d.]+)°/)?.[1] ?? "NaN");
  assert(
    Math.abs(qujiJ2000 - (90 - starJ2000.dec)) < 0.01,
    `J2000 面板去极度 ${qujiJ2000}° 与星表一致`
  );
  assert(meta.includes("J2000"), "面板标注当前历元 J2000");

  await page.locator(".dock .chip", { hasText: "北宋" }).click();
  await page.waitForTimeout(350);
  meta = await page.locator(".panel .meta").textContent();
  const qujiSong = parseFloat(meta.match(/去极度([\d.]+)°/)?.[1] ?? "NaN");
  assert(
    Math.abs(qujiSong - 5.916) < 0.01,
    `${STAR} 1052 年去极度 ${qujiSong}°（应为 5.916°，即宋朝的北极星离极 5.9°）`
  );
  assert(meta.includes("北宋"), "面板历元标注同步为北宋");
  await page.screenshot({ path: "_archive/screenshots/e2_flat_song.png" });

  /* ---------- 三维视图 ---------- */
  console.log("\n[3] 浑天仪视图");
  const p3 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  attach(p3, "sphere");
  await p3.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await p3.waitForTimeout(1200);

  const hint3 = await p3.locator(".dock .hint").first().textContent();
  assert(hint3.includes("10.70"), `三维版默认北宋历元 —— "${hint3.trim()}"`);
  await p3.screenshot({ path: "_archive/screenshots/e3_sphere_song.png" });

  const shotA = await p3.screenshot();
  await p3.locator(".dock .chip", { hasText: "J2000" }).click();
  await p3.waitForTimeout(600);
  const shotB = await p3.screenshot();
  assert(!shotA.equals(shotB), "切换历元后三维画面确实改变");

  const hint3b = await p3.locator(".dock .hint").first().textContent();
  assert(hint3b.includes("星表原历元"), "三维版 hint 同步更新");
  await p3.screenshot({ path: "_archive/screenshots/e4_sphere_j2000.png" });

  /* ---------- console ---------- */
  console.log("\n[4] console");
  assert(errors.length === 0, errors.length ? `发现 ${errors.length} 条报错:\n  ${errors.join("\n  ")}` : "两个视图 console 零报错");

  await browser.close();
  console.log(process.exitCode ? "\n有断言未通过 ✗\n" : "\n历元验证全部通过 ✓\n");
})();
