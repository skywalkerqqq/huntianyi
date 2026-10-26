/**
 * 日月五星 —— 用于在星图上标位，不是精密历表。
 *
 * 行星：JPL/Standish《Keplerian Elements for Approximate Positions of the
 * Major Planets》1800–2050 历元根数 + 开普勒方程求解，黄经误差约 10′。
 * 月球：Meeus《Astronomical Algorithms》第 47 章简化式（取 7 个主要周期项），
 * 黄经误差约 0.3°。
 *
 * 两者的误差都远小于星图上一个星官的张角，标位足够；若要精确到分，需换 VSOP87 全表。
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const OBLIQUITY = 23.4392911;

export type BodyId = "moon" | "mercury" | "venus" | "mars" | "jupiter" | "saturn";

export interface Body {
  id: BodyId;
  zh: string;
  /** 赤经（度） */
  ra: number;
  /** 赤纬（度） */
  dec: number;
  /** 黄经（度），用于判断所在宿 */
  lambda: number;
  /** 黄纬（度） */
  beta: number;
  /** 视星等（近似） */
  mag: number;
  /** 图上着色 */
  color: string;
}

/** 轨道根数：[常数项, 每儒略世纪变率] —— a(AU), e, I(°), L(°), ϖ(°), Ω(°) */
type El = [number, number];

const PLANETS: Record<
  Exclude<BodyId, "moon">,
  { zh: string; color: string; mag: number; el: [El, El, El, El, El, El] }
> = {
  mercury: {
    zh: "水星",
    color: "#9fb4c9",
    mag: -0.4,
    el: [
      [0.38709927, 0.00000037],
      [0.20563593, 0.00001906],
      [7.00497902, -0.00594749],
      [252.2503235, 149472.67411175],
      [77.45779628, 0.16047689],
      [48.33076593, -0.12534081],
    ],
  },
  venus: {
    zh: "金星",
    color: "#ffe6b0",
    mag: -4.2,
    el: [
      [0.72333566, 0.0000039],
      [0.00677672, -0.00004107],
      [3.39467605, -0.0007889],
      [181.9790995, 58517.81538729],
      [131.60246718, 0.00268329],
      [76.67984255, -0.27769418],
    ],
  },
  mars: {
    zh: "火星",
    color: "#ff8f6b",
    mag: -1.5,
    el: [
      [1.52371034, 0.00001847],
      [0.0933941, 0.00007882],
      [1.84969142, -0.00813131],
      [-4.55343205, 19140.30268499],
      [-23.94362959, 0.44441088],
      [49.55953891, -0.29257343],
    ],
  },
  jupiter: {
    zh: "木星",
    color: "#ffd9a0",
    mag: -2.5,
    el: [
      [5.202887, -0.00011607],
      [0.04838624, -0.00013253],
      [1.30439695, -0.00183714],
      [34.39644051, 3034.74612775],
      [14.72847983, 0.21252668],
      [100.47390909, 0.20469106],
    ],
  },
  saturn: {
    zh: "土星",
    color: "#e8d18a",
    mag: -0.4,
    el: [
      [9.53667594, -0.00125],
      [0.05386179, -0.00050991],
      [2.48599187, 0.00193609],
      [49.95424423, 1222.49362201],
      [92.59887831, -0.41897216],
      [113.66242448, -0.28867794],
    ],
  },
};

/** 地球（地月质心）—— 算行星地心位置必需 */
const EARTH: [El, El, El, El, El, El] = [
  [1.00000261, 0.00000562],
  [0.01671123, -0.00004392],
  [-0.00001531, -0.01294668],
  [100.46457166, 35999.37244981],
  [102.93768193, 0.32327364],
  [0.0, 0.0],
];

/** 日心黄道直角坐标（AU） */
function heliocentric(el: [El, El, El, El, El, El], T: number): [number, number, number] {
  const a = el[0][0] + el[0][1] * T;
  const e = el[1][0] + el[1][1] * T;
  const I = (el[2][0] + el[2][1] * T) * DEG;
  const L = el[3][0] + el[3][1] * T;
  const wBar = el[4][0] + el[4][1] * T;
  const O = (el[5][0] + el[5][1] * T) * DEG;

  const w = (wBar - el[5][0] - el[5][1] * T) * DEG; // 近日点幅角 ω = ϖ − Ω
  // 平近点角，归到 ±180°
  let M = ((L - wBar) % 360 + 540) % 360 - 180;
  M *= DEG;

  // 开普勒方程 E − e·sinE = M，牛顿迭代
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 8; k++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }

  // 轨道平面
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);

  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const cO = Math.cos(O);
  const sO = Math.sin(O);
  const cI = Math.cos(I);
  const sI = Math.sin(I);

  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    sw * sI * xp + cw * sI * yp,
  ];
}

/** 黄道 → 赤道（度） */
export function eclipticToEquatorial(
  lambdaDeg: number,
  betaDeg: number
): { ra: number; dec: number } {
  const l = lambdaDeg * DEG;
  const b = betaDeg * DEG;
  const eps = OBLIQUITY * DEG;
  const ra =
    Math.atan2(
      Math.sin(l) * Math.cos(eps) - Math.tan(b) * Math.sin(eps),
      Math.cos(l)
    ) * RAD;
  const dec =
    Math.asin(
      Math.sin(b) * Math.cos(eps) + Math.cos(b) * Math.sin(eps) * Math.sin(l)
    ) * RAD;
  return { ra: ((ra % 360) + 360) % 360, dec };
}

/** 月球位置（Meeus 47 简化式） */
function moonPosition(jd: number): { lambda: number; beta: number } {
  const T = (jd - 2451545) / 36525;
  const Lp = 218.3164477 + 481267.88123421 * T;
  const D = 297.8501921 + 445267.1114034 * T;
  const M = 357.5291092 + 35999.0502909 * T;
  const Mp = 134.9633964 + 477198.8675055 * T;
  const F = 93.272095 + 483202.0175233 * T;

  const s = (x: number) => Math.sin(x * DEG);
  const lambda =
    Lp +
    6.289 * s(Mp) +
    1.274 * s(2 * D - Mp) +
    0.658 * s(2 * D) +
    0.214 * s(2 * Mp) -
    0.186 * s(M) -
    0.114 * s(2 * F);
  const beta = 5.128 * s(F);
  return { lambda: ((lambda % 360) + 360) % 360, beta };
}

/** 某时刻的月球（单独导出，便于测试） */
export function moonRaDec(jd: number): {
  ra: number;
  dec: number;
  lambda: number;
  beta: number;
} {
  const { lambda, beta } = moonPosition(jd);
  const { ra, dec } = eclipticToEquatorial(lambda, beta);
  return { ra, dec, lambda, beta };
}

/**
 * 某时刻的五星位置（地心赤道坐标）。
 * @param jd 儒略日
 */
export function planetsRaDec(jd: number): {
  id: Exclude<BodyId, "moon">;
  ra: number;
  dec: number;
  lambda: number;
  beta: number;
}[] {
  const T = (jd - 2451545) / 36525;
  const earth = heliocentric(EARTH, T);
  const out: {
    id: Exclude<BodyId, "moon">;
    ra: number;
    dec: number;
    lambda: number;
    beta: number;
  }[] = [];

  for (const key of Object.keys(PLANETS) as Exclude<BodyId, "moon">[]) {
    const p = heliocentric(PLANETS[key].el, T);
    const x = p[0] - earth[0];
    const y = p[1] - earth[1];
    const z = p[2] - earth[2];
    const r = Math.hypot(x, y, z);
    const lambda = ((Math.atan2(y, x) * RAD) % 360 + 360) % 360;
    const beta = Math.asin(z / r) * RAD;
    const { ra, dec } = eclipticToEquatorial(lambda, beta);
    out.push({ id: key, ra, dec, lambda, beta });
  }
  return out;
}

/**
 * 日月五星合集，直接可用作图层的输入。
 * @param ms Unix 毫秒
 */
export function bodiesAt(ms: number): Body[] {
  const jd = ms / 86400000 + 2440587.5;
  const list: Body[] = [];

  const m = moonRaDec(jd);
  list.push({
    id: "moon",
    zh: "月",
    ra: m.ra,
    dec: m.dec,
    lambda: m.lambda,
    beta: m.beta,
    mag: -12.7,
    color: "#e9eef7",
  });

  for (const p of planetsRaDec(jd)) {
    const meta = PLANETS[p.id];
    list.push({
      id: p.id,
      zh: meta.zh,
      ra: p.ra,
      dec: p.dec,
      lambda: p.lambda,
      beta: p.beta,
      mag: meta.mag,
      color: meta.color,
    });
  }
  return list;
}

/** 地球日心黄道坐标（AU）—— 导出以便用「地球反推太阳」做系数自检 */
export function earthHeliocentric(jd: number): [number, number, number] {
  return heliocentric(EARTH, (jd - 2451545) / 36525);
}
