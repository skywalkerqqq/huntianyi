/**
 * 天文授时 —— 恒星时与太阳视位置。
 *
 * 全部为纯函数，系数取自 IAU 1982 恒星时决议与 Meeus《Astronomical Algorithms》：
 *   - 格林尼治平恒星时 GMST（Meeus 12.4），精度远高于本项目所需（< 0.1″/世纪量级的摄动在此忽略）
 *   - 太阳视位置低精度算法（Meeus 25 简化），误差 < 0.01°，足以标注太阳所在宿
 *
 * 注意：本项目一切时间为「本地时刻」→ 内部统一用 Unix 毫秒（UTC 时刻），
 *      再换算儒略日，避免时区二次污染。
 */

/** 观测地：北宋开封（苏颂水运仪象台所在） */
export const SITE = {
  name: "开封",
  lat: 34.8,
  lon: 114.307,
} as const;

/** 恒星日（毫秒）86164.0905 s —— 星空绕极轴一周的真实周期 */
export const SIDEREAL_DAY_MS = 86164090.5;

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export const norm360 = (d: number) => ((d % 360) + 360) % 360;

/** Unix 毫秒 → 儒略日 */
export function julianDay(ms: number): number {
  return ms / 86400000 + 2440587.5;
}

/**
 * 格林尼治平恒星时（度）。
 * 基准校验：J2000.0（2000-01-01 12:00 TT ≈ UTC）GMST = 18h41m50.55s = 280.4606184°
 */
export function gmstDeg(ms: number): number {
  const T = (julianDay(ms) - 2451545) / 36525;
  let s =
    67310.54841 +
    (876600 * 3600 + 8640184.812866) * T +
    0.093104 * T * T -
    6.2e-6 * T * T * T;
  s = ((s % 86400) + 86400) % 86400;
  return norm360(s * (360 / 86400));
}

/** 地方平恒星时（度）。东经为正 —— 本地子午线此刻所对的赤经 */
export function lstDeg(ms: number, lonDeg: number = SITE.lon): number {
  return norm360(gmstDeg(ms) + lonDeg);
}

/** 太阳视位置：赤经赤纬（度） */
export function sunRaDec(ms: number): { ra: number; dec: number; lambda: number } {
  const n = julianDay(ms) - 2451545;
  const L = norm360(280.46 + 0.9856474 * n); // 平黄经
  const g = norm360(357.528 + 0.9856003 * n); // 平近点角
  const lam = norm360(L + 1.915 * Math.sin(g * DEG) + 0.02 * Math.sin(2 * g * DEG));
  const eps = 23.439 - 0.0000004 * n;
  const ra = norm360(Math.atan2(Math.cos(eps * DEG) * Math.sin(lam * DEG), Math.cos(lam * DEG)) * RAD);
  const dec = Math.asin(Math.sin(eps * DEG) * Math.sin(lam * DEG)) * RAD;
  return { ra, dec, lambda: lam };
}

/**
 * 极坐标星图（北极居中、去极度定半径）所需的图画旋转角。
 * 使此刻位于上中天的天体（α = LAST）落在竖直子午线上方。
 * —— 平面盖图与三维浑天仪共用同一角度（已验算一致）。
 */
export const rotationFromLast = (lastDeg: number) => norm360(270 - lastDeg);

/** 角度 → 时分秒（恒星时读数） */
export function degToHms(deg: number): string {
  const h = norm360(deg) / 15;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const ss = Math.floor(((h - hh) * 60 - mm) * 60);
  return `${String(hh).padStart(2, "0")}h ${String(mm).padStart(2, "0")}m ${String(ss).padStart(2, "0")}s`;
}

/* ---------- <input type="datetime-local"> 互转（本地时区） ---------- */

export function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fromLocalInput(v: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
  if (!m) return NaN;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0).getTime();
}

/** 毫秒 → 「YYYY年M月D日 HH:MM」中文读数 */
export function localLabel(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}
