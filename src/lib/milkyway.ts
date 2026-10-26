/**
 * 银河 —— 按真实银道面生成，而不是手绘的装饰带。
 *
 * 银道坐标系的赤道系锚点（J2000，IAU 1958 定义）：
 *   银心 (l=0°, b=0°)      α=266.40510°  δ=−28.936175°
 *   银河北极 (b=+90°)      α=192.85948°  δ=+27.12825°
 *
 * 由这两点构造正交基，即可把 (l, b) 变换到赤道坐标 —— 于是银河会随岁差
 * 与天球一起正确转动，而不是固定贴在屏幕上。
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

const GC_RA = 266.4051;
const GC_DEC = -28.936175;
const GP_RA = 192.85948;
const GP_DEC = 27.12825;

/** 银道系三轴（赤道坐标下的单位向量）：x → 银心，z → 银北极 */
const AX_X = [
  Math.cos(GC_DEC * DEG) * Math.cos(GC_RA * DEG),
  Math.cos(GC_DEC * DEG) * Math.sin(GC_RA * DEG),
  Math.sin(GC_DEC * DEG),
];
const AX_Z = [
  Math.cos(GP_DEC * DEG) * Math.cos(GP_RA * DEG),
  Math.cos(GP_DEC * DEG) * Math.sin(GP_RA * DEG),
  Math.sin(GP_DEC * DEG),
];
const AX_Y = [
  AX_Z[1] * AX_X[2] - AX_Z[2] * AX_X[1],
  AX_Z[2] * AX_X[0] - AX_Z[0] * AX_X[2],
  AX_Z[0] * AX_X[1] - AX_Z[1] * AX_X[0],
];

/** 银道坐标 (l, b) → 赤道坐标 (ra, dec)，单位度 */
export function galacticToEquatorial(lDeg: number, bDeg: number): {
  ra: number;
  dec: number;
} {
  const l = lDeg * DEG;
  const b = bDeg * DEG;
  const cb = Math.cos(b);
  const sb = Math.sin(b);
  const cl = Math.cos(l);
  const sl = Math.sin(l);
  const v = [
    AX_X[0] * cb * cl + AX_Y[0] * cb * sl + AX_Z[0] * sb,
    AX_X[1] * cb * cl + AX_Y[1] * cb * sl + AX_Z[1] * sb,
    AX_X[2] * cb * cl + AX_Y[2] * cb * sl + AX_Z[2] * sb,
  ];
  const ra = Math.atan2(v[1], v[0]) * RAD;
  return { ra: ((ra % 360) + 360) % 360, dec: Math.asin(v[2]) * RAD };
}

export interface MilkyPoint {
  ra: number;
  dec: number;
  /** 银纬，用于着色与明暗 */
  b: number;
  /** 银经 */
  l: number;
  /** 明暗权重 0–1 */
  w: number;
}

/** 确定性伪随机（mulberry32）—— 服务端与客户端必须得到同一组点，否则 hydration 分歧 */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller，取标准正态 */
function gauss(rnd: () => number): number {
  const u = Math.max(1e-9, rnd());
  const v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * 生成银河星尘。
 *
 * 银纬按正态分布收拢在银道面附近（σ≈7°），银心方向（l≈0）更密更亮；
 * 银纬 |b| < 2.5° 处压暗，模拟银道面上的暗尘带（天鹅座大裂缝那类结构）。
 */
export function milkyWayPoints(count: number, seed = 20260101): MilkyPoint[] {
  const rnd = mulberry32(seed);
  const out: MilkyPoint[] = [];
  for (let i = 0; i < count; i++) {
    const l = rnd() * 360;
    const b = gauss(rnd) * 7;
    if (Math.abs(b) > 55) continue;

    // 银心加权：l 接近 0 时最亮，背向银心最暗
    const core = 0.45 + 0.55 * Math.cos((l * Math.PI) / 180);
    const band = Math.exp(-((b / 9) ** 2));
    let w = band * Math.max(0.12, core);
    // 暗尘带
    if (Math.abs(b) < 2.5) w *= 0.42;

    const { ra, dec } = galacticToEquatorial(l, b);
    out.push({ ra, dec, b, l, w });
  }
  return out;
}
