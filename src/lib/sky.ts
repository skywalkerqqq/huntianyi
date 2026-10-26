/** 中国古星图数据结构（由 scripts/export_sky.mjs 生成，真实天文坐标） */

export interface SkyStar {
  hip: number | null;
  gaia: string | null;
  /** 赤经 J2000（度） */
  ra: number;
  /** 赤纬 J2000（度） */
  dec: number;
  /** 视星等（越小越亮） */
  mag: number;
  /** 去极度 = 90° - 赤纬，中国传统坐标（距北天极角距） */
  quji: number;
  /** 中国星名，如「织女一」 */
  zh: string | null;
  en: string | null;
}

export interface Asterism {
  id: string;
  /** 星官中文名，如「毕宿」「北斗」 */
  zh: string | null;
  en: string | null;
  pinyin: string | null;
  /** 所属二十八宿（按平均赤经归入宿天区） */
  mansion: string | null;
  /** 所属三垣：紫微垣 / 太微垣 / 天市垣 */
  enclosure: string | null;
  /** 所属分区：东方苍龙 / 北方玄武 / 西方白虎 / 南方朱雀 / 近南极天区 */
  quadrant: string | null;
  /** 该星官包含的星（stars 数组下标） */
  stars: number[];
  /** 连线（每条为星下标序列） */
  lines: number[][];
}

export interface Mansion {
  zh: string;
  en: string;
  pinyin: string;
  /** 距星 HIP 编号 */
  determinativeStar: number;
  ra: number | null;
  dec: number | null;
}

export interface ChineseSky {
  meta: {
    source: string;
    generatedAt: string;
    starCount: number;
    asterismCount: number;
    mansionCount: number;
    note: string;
  };
  mansions: Mansion[];
  stars: SkyStar[];
  asterisms: Asterism[];
}

/** 天球半径（场景单位） */
export const CELESTIAL_R = 5;

/**
 * 赤经赤纬 → 直角坐标。
 * 天轴（北天极）取 +Y，赤经绕 Y 轴增加。
 */
export function raDecToVec3(
  raDeg: number,
  decDeg: number,
  r: number = CELESTIAL_R
): [number, number, number] {
  const ra = (raDeg * Math.PI) / 180;
  const dec = (decDeg * Math.PI) / 180;
  return [
    r * Math.cos(dec) * Math.cos(ra),
    r * Math.sin(dec),
    -r * Math.cos(dec) * Math.sin(ra),
  ];
}

/** 黄赤交角（度） */
export const OBLIQUITY_DEG = 23.4393;
/** 黄白交角（度） */
export const MOON_INCLINATION_DEG = 5.145;
/** 观测地纬度：北宋开封 ≈ 34.8°N（苏颂水运仪象台所在），决定星图内规半径 */
export const LATITUDE_KAIFENG = 34.8;

/** 四象配色 */
export const QUADRANT_COLORS: Record<string, string> = {
  东方苍龙: "#4ea8ff",
  北方玄武: "#7cf3c6",
  西方白虎: "#ffd479",
  南方朱雀: "#ff8f9d",
  近南极天区: "#c9a7ff",
  紫微垣: "#ffe9a8",
  太微垣: "#a8ffe9",
  天市垣: "#ffc4a8",
};

/** 星官的分组键：三垣优先，否则二十八宿 */
export function groupKey(a: Asterism): string {
  return a.enclosure || a.mansion || "未归属";
}

/** 星等 → 粒子大小系数（越亮越大） */
export function magToScale(mag: number): number {
  const s = (6.5 - mag) / 5;
  return Math.max(0.35, Math.min(2.6, s));
}
