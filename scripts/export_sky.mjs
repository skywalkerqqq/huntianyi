import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLiteStarCatalog } from "star-catalog-lite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stell = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data", "stellarium_chinese.json"), "utf8")
);

const catalog = await loadLiteStarCatalog();

// HIP / Gaia DR3 -> 真实天文数据（Stellarium 连线里少数暗星用 Gaia ID 指代）
const byHip = new Map();
const byGaia = new Map();
for (const s of catalog) {
  if (s.hipId) byHip.set(s.hipId, s);
  if (s.gaiaDr3SourceId) byGaia.set(s.gaiaDr3SourceId.toString(), s);
}
console.log("catalog starCount:", catalog.starCount, "| with HIP:", byHip.size, "| with Gaia:", byGaia.size);

function resolveRef(ref) {
  if (typeof ref === "number" && ref > 1e15) return byGaia.get(String(ref)) || null;
  return byHip.get(ref) || null;
}

// 中文星名 & 星官分区：来自 Stellarium star_names.zh_CN.fab
// 格式：###分区 / #星官 / HIP|_("星名")
const fabPath = path.join(__dirname, "data", "star_names_zh.fab");
const starNameByHip = new Map();
const partitionByAsterism = new Map();
{
  let partition = null;
  let asterism = null;
  for (const raw of fs.readFileSync(fabPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("###")) {
      partition = line.slice(3).trim();
      continue;
    }
    if (line.startsWith("#")) {
      asterism = line.slice(1).trim();
      if (partition && asterism && !partitionByAsterism.has(asterism)) {
        partitionByAsterism.set(asterism, partition);
      }
      continue;
    }
    const m = line.match(/^(\d+)\|_\("(.+?)"\)/);
    if (m) {
      const hip = Number(m[1]);
      if (!starNameByHip.has(hip)) starNameByHip.set(hip, m[2]);
    }
  }
}
console.log("fab star names:", starNameByHip.size, "| fab asterism partitions:", partitionByAsterism.size);

function zhStarName(hip) {
  return starNameByHip.get(hip) || null;
}
function enStarName(hip) {
  const v = stell.common_names["HIP " + hip];
  return v ? v.english || null : null;
}

// 二十八宿：距星(HIP) + 名称
const mansionsRaw = stell.lunar_system.names.map((n, i) => ({
  index: i,
  zh: n.native,
  en: n.english,
  pinyin: n.pronounce,
  determinative: stell.lunar_system.defining_stars[i],
}));

// 距星赤经（度）——用于按赤经把星官归入宿天区
for (const m of mansionsRaw) {
  const s = byHip.get(m.determinative);
  m.ra = s ? s.rightAscensionDeg : null;
  m.dec = s ? s.declinationDeg : null;
}
const mansionsWithRa = mansionsRaw.filter((m) => m.ra != null);
console.log("mansions:", mansionsRaw.length, "with RA:", mansionsWithRa.length);

// 以角宿为起点，按赤经递增排成 28 个区间（中国传统"入宿度"的近似分区）
const jiaoIdx = mansionsRaw.findIndex((m) => m.zh === "角");
const ordered = [];
for (let k = 0; k < mansionsWithRa.length; k++) {
  ordered.push(mansionsRaw[(jiaoIdx + k) % mansionsRaw.length]);
}
const boundaries = ordered.map((m) => ({ zh: m.zh, start: m.ra }));

function mansionOfRa(ra) {
  for (let i = 0; i < boundaries.length; i++) {
    const cur = boundaries[i].start;
    const next = boundaries[(i + 1) % boundaries.length].start;
    const span = (next - cur + 360) % 360;
    const off = (ra - cur + 360) % 360;
    if (off < span) return boundaries[i].zh;
  }
  return null;
}

// 三垣（Stellarium 以"紫微左垣/右垣"及"(紫微垣)"等标注形式存在，需模糊识别）
function regionOf(zh) {
  if (!zh) return null;
  if (/紫微/.test(zh)) return "紫微垣";
  if (/太微/.test(zh)) return "太微垣";
  if (/天市/.test(zh)) return "天市垣";
  return null;
}

// 构建星官
const starsOut = [];
const seenStar = new Map(); // hip -> starIndex
const asterisms = [];
let missing = 0;
let missingHips = [];

for (const c of stell.constellations) {
  const zh = c.common_name?.native || null;
  const en = c.common_name?.english || null;
  const pinyin = c.common_name?.pronounce || null;

  const hipsOrdered = [];
  const linesIdx = [];
  for (const seg of c.lines || []) {
    const line = [];
    for (const ref of seg) {
      const s = resolveRef(ref);
      if (!s) {
        missing++;
        if (missingHips.length < 10) missingHips.push(ref);
        line.push(-1);
        continue;
      }
      if (!seenStar.has(ref)) {
        const idx = starsOut.length;
        seenStar.set(ref, idx);
        starsOut.push({
          hip: s.hipId || null,
          gaia: s.gaiaDr3SourceId ? s.gaiaDr3SourceId.toString() : null,
          ra: +s.rightAscensionDeg.toFixed(5),
          dec: +s.declinationDeg.toFixed(5),
          mag: +s.magnitude.toFixed(3),
          // 去极度 = 90° - 赤纬（距北天极的角距，中国传统坐标）
          quji: +(90 - s.declinationDeg).toFixed(3),
          zh: s.hipId ? zhStarName(s.hipId) : null,
          en: (s.hipId ? enStarName(s.hipId) : null) || s.displayName || null,
        });
      }
      const idx = seenStar.get(ref);
      line.push(idx);
      if (!hipsOrdered.includes(idx)) hipsOrdered.push(idx);
    }
    linesIdx.push(line);
  }

  // 归属：三垣（星官名或 fab 分区）> 二十八宿（按平均赤经归入宿天区）
  const fabPart = partitionByAsterism.get(zh) || null;
  const enclosure = regionOf(zh) || (fabPart && /垣$/.test(fabPart) ? fabPart : null);
  const quadrant =
    fabPart && /苍龙|玄武|白虎|朱雀/.test(fabPart) ? fabPart : fabPart;
  let mansion = null;
  if (!enclosure && hipsOrdered.length) {
    // 用平均方向向量求平均赤经（避免跨 0/360 的算术平均错误）
    let sx = 0,
      sy = 0;
    for (const i of hipsOrdered) {
      const s = starsOut[i];
      sx += Math.cos((s.ra * Math.PI) / 180);
      sy += Math.sin((s.ra * Math.PI) / 180);
    }
    const meanRa = ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360;
    mansion = mansionOfRa(meanRa);
  }

  asterisms.push({
    id: c.id,
    zh,
    en,
    pinyin,
    mansion,
    enclosure,
    quadrant,
    stars: hipsOrdered,
    lines: linesIdx,
  });
}

console.log("asterisms:", asterisms.length);
console.log("stars used:", starsOut.length);
console.log("missing HIP refs:", missing, missingHips.length ? "e.g. " + missingHips.join(",") : "");
const byMansion = {};
for (const a of asterisms) {
  const k = a.enclosure || a.mansion || "(未归属)";
  byMansion[k] = (byMansion[k] || 0) + 1;
}
console.log("grouped:", JSON.stringify(byMansion));
const qCount = {};
for (const a of asterisms) {
  const k = a.quadrant || "(无)";
  qCount[k] = (qCount[k] || 0) + 1;
}
console.log("quadrants:", JSON.stringify(qCount));
const namedStars = starsOut.filter((s) => s.zh).length;
console.log("stars with 中文名:", namedStars, "/", starsOut.length);

// 真实性校验：用权威 J2000 坐标比对（误差应 < 0.01°）
const CHECKS = [
  { hip: 91262, zh: "织女/天孙", ra: 279.2347, dec: 38.7837, mag: 0.03 },
  { hip: 32349, zh: "天狼", ra: 101.287, dec: -16.716, mag: -1.46 },
  { hip: 80763, zh: "心宿二", ra: 247.3519, dec: -26.432, mag: 1.06 },
  { hip: 65474, zh: "角宿一", ra: 201.2983, dec: -11.1613, mag: 0.98 },
  { hip: 54061, zh: "北斗天枢", ra: 165.932, dec: 61.751, mag: 1.79 },
];
console.log("--- 坐标校验 (导出值 vs 权威值) ---");
let checkFail = 0;
for (const c of CHECKS) {
  const s = starsOut.find((x) => x.hip === c.hip);
  if (!s) {
    console.log(`  ${c.zh} HIP${c.hip}: 不在数据集内`);
    continue;
  }
  const dra = Math.abs(s.ra - c.ra);
  const ddec = Math.abs(s.dec - c.dec);
  const ok = dra < 0.01 && ddec < 0.01;
  if (!ok) checkFail++;
  console.log(
    `  ${ok ? "OK  " : "FAIL"} ${c.zh}: RA ${s.ra} (期望 ${c.ra}, Δ${dra.toFixed(4)}) | Dec ${s.dec} (期望 ${c.dec}, Δ${ddec.toFixed(4)}) | mag ${s.mag} (期望 ${c.mag}) | 中文名 ${s.zh || "-"}`
  );
}
console.log(checkFail ? `  !! ${checkFail} 项校验未通过` : "  全部通过");

const out = {
  meta: {
    source: "Stellarium chinese skyculture (asterisms, 二十八宿) + star-catalog-lite TSC1 (Gaia DR3/Hipparcos/BSC5 astrometry)",
    generatedAt: new Date().toISOString(),
    starCount: starsOut.length,
    asterismCount: asterisms.length,
    mansionCount: mansionsRaw.length,
    note: "坐标为 J2000 平赤道坐标；去极度 = 90° - 赤纬（距北天极角距）。星官归属：三垣取自 star_names.zh_CN.fab 的分区标注，其余按平均赤经归入二十八宿天区；四象（东方苍龙/北方玄武/西方白虎/南方朱雀）取自 fab 分区。",
  },
  mansions: mansionsRaw.map((m) => ({
    zh: m.zh,
    en: m.en,
    pinyin: m.pinyin,
    determinativeStar: m.determinative,
    ra: m.ra,
    dec: m.dec,
  })),
  stars: starsOut,
  asterisms,
};

const outPath = path.join(__dirname, "..", "src", "data", "chineseSky.json");
fs.writeFileSync(outPath, JSON.stringify(out));
console.log("written:", outPath, (fs.statSync(outPath).size / 1024).toFixed(1) + " KB");
