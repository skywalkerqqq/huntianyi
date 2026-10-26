/**
 * 授时精度校验：用已知天文历表断言 astro.ts 的恒星时与太阳位置。
 * 运行：node scripts/test_astro.mjs（先由 scripts/prep_astro.sh 编译 TS → JS）
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  gmstDeg,
  lstDeg,
  sunRaDec,
  SITE,
  SIDEREAL_DAY_MS,
  rotationFromLast,
  degToHms,
  toLocalInput,
  fromLocalInput,
  precessRaDec,
  yearToJD,
  J2000_JD,
} from "./_astro_out/astro.js";

const utc = (s) => Date.parse(s);
const near = (a, b, tol, tag) => {
  const d = Math.abs(((a - b + 540) % 360) - 180);
  assert.ok(d <= tol, `${tag}: got ${a.toFixed(6)}°, expect ${b.toFixed(6)}°, Δ=${d.toFixed(6)}° > ${tol}°`);
  console.log(`  ✓ ${tag.padEnd(34)} ${a.toFixed(6)}°  (Δ ${d.toExponential(2)}°)`);
};

console.log("\n[1] GMST 基准点");
// J2000.0：2000-01-01 12:00 UT → GMST = 18h41m50.5484s = 280.4606184°
near(gmstDeg(utc("2000-01-01T12:00:00Z")), 280.4606184, 0.001, "GMST @ J2000.0");
// Meeus 例 12.a：1987-04-10 00:00 UT → 13h10m46.3668s = 197.6931948°
near(gmstDeg(utc("1987-04-10T00:00:00Z")), 197.6931948, 0.001, "GMST @ Meeus 12.a");

console.log("\n[2] 恒星日周期性");
const t0 = utc("2026-10-05T09:30:00Z");
near(lstDeg(t0 + SIDEREAL_DAY_MS, 0) - lstDeg(t0, 0) + 360, 0, 1e-6, "一个恒星日后 LAST 归零");

console.log("\n[3] 太阳视位置（二分二至）");
const cases = [
  ["2026-03-20T14:46:00Z", 0, 0.6, "春分 α≈0h"],
  ["2026-06-21T10:24:00Z", 90, 0.6, "夏至 α≈6h"],
  ["2026-09-23T06:05:00Z", 180, 0.6, "秋分 α≈12h"],
  ["2026-12-21T20:50:00Z", 270, 0.6, "冬至 α≈18h"],
];
for (const [iso, expect, tol, tag] of cases) {
  const s = sunRaDec(utc(iso));
  near(s.ra, expect, tol, tag);
}

console.log("\n[4] 夏至太阳赤纬 = 黄赤交角");
const sum = sunRaDec(utc("2026-06-21T10:24:00Z"));
assert.ok(Math.abs(sum.dec - 23.44) < 0.1, `夏至赤纬应≈23.44°, 实为 ${sum.dec}`);
console.log(`  ✓ 夏至 δ = ${sum.dec.toFixed(4)}°`);

console.log("\n[5] 本地读数（开封 " + SITE.lat + "°N " + SITE.lon + "°E）");
const now = Date.now();
const last = lstDeg(now);
console.log("  时刻        :", toLocalInput(now));
console.log("  地方恒星时  :", degToHms(last));
console.log("  上中天赤经  :", degToHms(last), "(= 恒星时)");
console.log("  星图旋转角  :", rotationFromLast(last).toFixed(4), "°");
console.log("  太阳 α/δ    :", sunRaDec(now).ra.toFixed(3), "/", sunRaDec(now).dec.toFixed(3));

console.log("\n[6] datetime-local 往返");
const ms = fromLocalInput("2026-10-05 22:30".replace(" ", "T"));
assert.ok(!Number.isNaN(ms), "fromLocalInput 解析失败");
assert.equal(toLocalInput(ms), "2026-10-05T22:30", "往返不一致");
console.log("  ✓ 往返一致:", toLocalInput(ms));

/* ==========================================================================
   岁差 —— 本项目「古代星空复现」的核心，数值必须锁死
   ========================================================================== */
console.log("\n[7] 儒略日与历元");
// 1052-01-01 按儒略历（1582 年前天文学惯例）= JD 2105300.5
assert.ok(
  Math.abs(yearToJD(1052) - 2105300.5) < 1e-9,
  `1052-01-01 儒略日应为 2105300.5，实为 ${yearToJD(1052)}`
);
console.log("  ✓ 1052-01-01（儒略历） JD =", yearToJD(1052));
assert.ok(Math.abs(yearToJD(1582, 10, 15) - 2299160.5) < 1e-9, "格里高利历首日 JD");
console.log("  ✓ 1582-10-15（格里高利历） JD =", yearToJD(1582, 10, 15));

console.log("\n[8] 岁差：J2000 → 北宋 1052");
const sky = JSON.parse(
  fs.readFileSync(new URL("../src/data/chineseSky.json", import.meta.url), "utf8")
);
const jd1052 = yearToJD(1052);
const named = new Map(sky.stars.filter((s) => s.zh).map((s) => [s.zh, s]));

// 勾陈一（今北极星）：J2000 去极度 0.736°，1052 年应为 5.916°
{
  const s = named.get("勾陈一");
  assert.ok(s, "找不到勾陈一");
  const p = precessRaDec(s.ra, s.dec, jd1052);
  const quji = 90 - p.dec;
  assert.ok(
    Math.abs(quji - 5.916) < 0.01,
    `勾陈一 1052 年去极度应为 5.916°，实为 ${quji.toFixed(3)}°`
  );
  console.log(
    `  ✓ 勾陈一去极度 ${(90 - s.dec).toFixed(3)}° → ${quji.toFixed(3)}°（宋人「离极三度有余」的另一侧）`
  );
}

// 角宿一（Spica）：13.21°
{
  const s = named.get("角宿一");
  const p = precessRaDec(s.ra, s.dec, jd1052);
  const sep = angularSep(s.ra, s.dec, p.ra, p.dec);
  assert.ok(Math.abs(sep - 13.21) < 0.02, `角宿一位移应为 13.21°，实为 ${sep.toFixed(3)}°`);
  console.log(`  ✓ 角宿一岁差位移 ${sep.toFixed(2)}°`);
}

// 全表均值：10.70°
{
  let sum = 0;
  for (const s of sky.stars) {
    const p = precessRaDec(s.ra, s.dec, jd1052);
    sum += angularSep(s.ra, s.dec, p.ra, p.dec);
  }
  const mean = sum / sky.stars.length;
  assert.ok(
    Math.abs(mean - 10.7) < 0.05,
    `全表平均位移应为 10.70°，实为 ${mean.toFixed(3)}°`
  );
  console.log(`  ✓ 全部 ${sky.stars.length} 星平均位移 ${mean.toFixed(2)}°`);
}

console.log("\n[9] 岁差往返可逆");
{
  const s = named.get("参宿四");
  const f = precessRaDec(s.ra, s.dec, jd1052, J2000_JD);
  const b = precessRaDec(f.ra, f.dec, J2000_JD, jd1052);
  const d = angularSep(s.ra, s.dec, b.ra, b.dec);
  assert.ok(d < 1e-6, `往返误差 ${d}° 过大`);
  console.log(`  ✓ J2000 → 1052 → J2000 往返误差 ${d.toExponential(2)}°`);
}

console.log("\n全部断言通过 ✓\n");

/** 球面角距（度） */
function angularSep(ra1, de1, ra2, de2) {
  const D = Math.PI / 180;
  const c =
    Math.sin(de1 * D) * Math.sin(de2 * D) +
    Math.cos(de1 * D) * Math.cos(de2 * D) * Math.cos((ra1 - ra2) * D);
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}
