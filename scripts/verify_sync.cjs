/**
 * 天象同步验证（生产构建）
 *   1. 恒星时 → 旋转角：把时刻校正到织女一上中天那一刻，该星必须落在子午线顶端
 *   2. 时间校正：+1 时钟小时 ⇒ 旋转角变化 −15.04°（恒星时比太阳时快 1.0027 倍）
 *   3. 拖动星图 = 拨动时刻
 *   4. 关闭同步：旋转角不跳变、手动控件回归
 *   5. 观测者坐标层（地平遮罩 / 天顶 / 子午 / 太阳）随开关出现与消失
 *   6. 三维浑天仪同步后画面确实改变 + console 零报错
 */
const _ensureShotDir = (() => { const fs = require("node:fs"); fs.mkdirSync("_archive/screenshots", { recursive: true }); return true; })();
const { launch } = require("./_pw.cjs");

const BASE = process.env.BASE || "http://127.0.0.1:8771";
const LON = 114.307;

/* —— 测试基准：独立实现的恒星时（已与 Meeus 例题对照）—— */
const gmst = (ms) => {
  const jd = ms / 86400000 + 2440587.5;
  const T = (jd - 2451545) / 36525;
  let s = 67310.54841 + (876600 * 3600 + 8640184.812866) * T + 0.093104 * T * T - 6.2e-6 * T ** 3;
  s = ((s % 86400) + 86400) % 86400;
  return ((s * 360) / 86400 + 360) % 360;
};
const lst = (ms) => (((gmst(ms) + LON) % 360) + 360) % 360;

/** 求 LAST 等于目标赤经的时刻（牛顿迭代） */
function timeOfLast(targetDeg, seedMs) {
  const rate = 360.9856473 / 86400000; // 度 / 毫秒
  let t = seedMs;
  for (let i = 0; i < 6; i++) {
    let d = ((lst(t) - targetDeg + 540) % 360) - 180;
    t -= d / rate;
  }
  return t;
}

const toLocalInput = (ms) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const rotOf = (tr) => {
  const m = /rotate\(([-\d.]+)\)/.exec(tr || "");
  return m ? Number(m[1]) : NaN;
};
const deltaDeg = (a, b) => (((a - b + 540) % 360) - 180);

const errors = [];
const ok = (cond, tag, extra = "") =>
  console.log(`  ${cond ? "✓" : "✗"} ${tag}${extra ? "  " + extra : ""}`);

(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 160));
  });
  p.on("pageerror", (e) => errors.push("PAGEERROR " + e.message.slice(0, 160)));

  await p.goto(BASE + "/flat", { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(1500);

  const toggle = async (text) =>
    p.locator(`label.toggle:has-text('${text}')`).click();

  const VEGA = { i: 1320, ra: 279.23411, name: "织女一" };

  console.log("\n[1] 开启天象同步");
  await toggle("天象同步");
  await p.waitForTimeout(600);

  const readHms = () => p.locator(".readout div", { hasText: "地方恒星时" }).locator("b").textContent();
  const lastRead = await readHms();
  const rotNow = rotOf(await p.locator(".ring-outer").getAttribute("transform"));
  // 「18h 11m 09s」→ 度
  const hmsToDeg = (s) => {
    const m = /(\d+)h\s+(\d+)m\s+(\d+)s/.exec(s || "");
    return m ? (Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600) * 15 : NaN;
  };
  const readoutDeg = hmsToDeg(lastRead);
  const expectedRot = (((270 - readoutDeg) % 360) + 360) % 360;
  const rotErr = Math.abs(deltaDeg(rotNow, expectedRot));
  ok(Boolean(lastRead), "恒星时读数出现", lastRead);
  ok(
    rotErr < 0.6,
    "旋转角 = 270° − 恒星时",
    `旋转 ${rotNow.toFixed(3)}° / 理论 ${expectedRot.toFixed(3)}° / 偏差 ${rotErr.toFixed(3)}°`
  );

  console.log("\n[2] 时刻校正 → 织女一上中天应落在子午线顶端");
  // 星位默认已按北宋历元做岁差归算（织女一偏移 6.2°）；
  // 本节校验的是「授时 → 旋转角」这条链路，先切回星表原历元，把岁差变量摘出去。
  await p.click('.dock .chip:text-is("J2000")');
  await p.waitForTimeout(250);
  const tStar = timeOfLast(VEGA.ra, Date.now());
  await p.fill(".dtinput", toLocalInput(tStar));
  await p.waitForTimeout(700);

  const box = await p.evaluate((i) => {
    const c = document.querySelector(`circle[data-si="${i}"]`);
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const svg = document.querySelector("svg.skymap").getBoundingClientRect();
    return {
      x: r.x + r.width / 2,
      y: r.y + r.height / 2,
      cx: svg.x + svg.width / 2,
      cy: svg.y + svg.height / 2,
    };
  }, VEGA.i);

  const dx = Math.abs(box.x - box.cx);
  const dy = box.cy - box.y; // 上方为正
  ok(dx < 4, `${VEGA.name} 横向对齐子午线（|Δx| = ${dx.toFixed(2)}px < 4px）`);
  ok(dy > 40, `${VEGA.name} 位于图心正上方（Δy = ${dy.toFixed(1)}px）`);
  console.log(`     理论：该星此刻地平高度 = ${(90 - Math.abs(34.8 - 38.78)).toFixed(1)}°，应在天顶附近`);

  console.log("\n[3] +1 时钟小时 → 旋转角应变化 −15.04°（恒星时快于太阳时）");
  const beforeRot = rotOf(await p.locator(".ring-outer").getAttribute("transform"));
  await p.locator(".btnrow .chip", { hasText: "+1时" }).click();
  await p.waitForTimeout(500);
  const afterRot = rotOf(await p.locator(".ring-outer").getAttribute("transform"));
  const dRot = deltaDeg(afterRot, beforeRot);
  ok(Math.abs(dRot + 15.041) < 0.06, `Δ = ${dRot.toFixed(3)}° ≈ −15.041°`, `（若错用 15.000°/h 会偏 ${Math.abs(dRot + 15).toFixed(3)}°）`);

  console.log("\n[4] 拖动星图 = 拨动时刻");
  const beforeInput = await p.locator(".dtinput").inputValue();
  await p.mouse.move(720, 300);
  await p.mouse.down();
  await p.mouse.move(860, 420, { steps: 14 });
  await p.mouse.up();
  await p.waitForTimeout(400);
  const afterInput = await p.locator(".dtinput").inputValue();
  ok(beforeInput !== afterInput, "拖动后时刻已改变", `${beforeInput} → ${afterInput}`);

  console.log("\n[5] 观测者坐标层（地平/天顶/子午/太阳）");
  const sunCount = await p.locator("svg.skymap text", { hasText: "太阳" }).count();
  const zenithCount = await p.locator("svg.skymap text", { hasText: "天顶" }).count();
  const meridianCount = await p.locator("svg.skymap text", { hasText: "子午 · 上中天" }).count();
  ok(sunCount > 0 && zenithCount > 0 && meridianCount > 0, "太阳 / 天顶 / 子午 标记齐备",
    `太阳${sunCount} 天顶${zenithCount} 子午${meridianCount}`);

  console.log("\n[6] 关闭同步：角度不跳变、手动控件回归");
  const rotBeforeOff = rotOf(await p.locator(".ring-outer").getAttribute("transform"));
  await toggle("天象同步");
  await p.waitForTimeout(500);
  const rotAfterOff = rotOf(await p.locator(".ring-outer").getAttribute("transform"));
  ok(Math.abs(deltaDeg(rotAfterOff, rotBeforeOff)) < 0.01, "关闭瞬间视角不跳变",
    `${rotBeforeOff.toFixed(3)}° → ${rotAfterOff.toFixed(3)}°`);
  const sunGone = await p.locator("svg.skymap text", { hasText: "太阳" }).count();
  const sliders = await p.locator(".slider input[type=range]").count();
  ok(sunGone === 0, "太阳标记已移除");
  ok(sliders >= 4, "手动旋转控件回归", `${sliders} 个滑杆`);

  await p.screenshot({ path: "_archive/screenshots/s1_flat_off.png" });
  await toggle("天象同步");
  await p.waitForTimeout(900);
  await p.screenshot({ path: "_archive/screenshots/s2_flat_sync.png" });

  console.log("\n[7] 三维浑天仪");
  await p.goto(BASE + "/", { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(2500);
  const shotBefore = await p.screenshot();
  await toggle("天象同步");
  await p.waitForTimeout(1800);
  const shotAfter = await p.screenshot();
  ok(!shotBefore.equals(shotAfter), "开启同步后天球确实转动（画面变化）",
    `${(shotBefore.length / 1024).toFixed(0)}KB vs ${(shotAfter.length / 1024).toFixed(0)}KB`);
  const last3d = await p.locator(".readout div", { hasText: "地方恒星时" }).locator("b").textContent();
  ok(Boolean(last3d), "浑天仪读数同步", last3d);
  await p.screenshot({ path: "_archive/screenshots/s3_sphere_sync.png" });

  await b.close();
  console.log("\nconsole errors:", errors.length);
  errors.slice(0, 6).forEach((e) => console.log("  " + e));
})().catch((e) => {
  console.error("FATAL", e.message);
  process.exit(1);
});
