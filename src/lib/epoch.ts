import { J2000_JD, epochById, precessRaDec, type EpochId } from "./astro";
import type { ChineseSky, SkyStar } from "./sky";

/**
 * 按目标历元重算整张星表。
 *
 * `chineseSky.json` 里存的是**星表原历元（J2000）**下的真实位置，这是数据的
 * 唯一真值，不该为了某个朝代去改它。显示时再按所选历元做一次岁差改正：
 * 1386 颗星的三角运算在毫秒量级，足以在切换历元的瞬间完成。
 *
 * 星官连线与 `/flat` 的内外圈分层都引用 stars 的**下标**，位置重算不影响拓扑。
 */
export function applyEpoch(sky: ChineseSky, epochId: EpochId): ChineseSky {
  if (epochId === "j2000") return sky; // 原历元，无需改正

  const toJD = epochById(epochId).jd;

  const stars: SkyStar[] = sky.stars.map((s) => {
    const { ra, dec } = precessRaDec(s.ra, s.dec, toJD, J2000_JD);
    return { ...s, ra, dec, quji: 90 - dec };
  });

  // 二十八宿的距星同样随岁差移动 —— 宿度经线的位置要跟着走
  const mansions = sky.mansions.map((m) => {
    if (m.ra == null || m.dec == null) return m;
    const { ra, dec } = precessRaDec(m.ra, m.dec, toJD, J2000_JD);
    return { ...m, ra, dec };
  });

  return { ...sky, stars, mansions };
}

/**
 * 把任意 (ra, dec) 列表按历元做岁差改正 —— 银河星尘这类程序化生成的点
 * 不来自星表，但也必须跟着天球一起岁差，否则会和星官错位。
 */
export function precessList<T extends { ra: number; dec: number }>(
  list: T[],
  epochId: EpochId
): T[] {
  if (epochId === "j2000") return list;
  const toJD = epochById(epochId).jd;
  return list.map((p) => {
    const { ra, dec } = precessRaDec(p.ra, p.dec, toJD, J2000_JD);
    return { ...p, ra, dec };
  });
}

/** 与 J2000 相比的整体位移（度），用于面板上给出量级 —— 取全表均值 */
export function meanPrecessionShift(sky: ChineseSky, epochId: EpochId): number {
  if (epochId === "j2000") return 0;
  const toJD = epochById(epochId).jd;
  let sum = 0;
  for (const s of sky.stars) {
    const { ra, dec } = precessRaDec(s.ra, s.dec, toJD, J2000_JD);
    const a1 = (s.ra * Math.PI) / 180;
    const d1 = (s.dec * Math.PI) / 180;
    const a2 = (ra * Math.PI) / 180;
    const d2 = (dec * Math.PI) / 180;
    const c =
      Math.sin(d1) * Math.sin(d2) +
      Math.cos(d1) * Math.cos(d2) * Math.cos(a1 - a2);
    sum += (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
  }
  return sum / sky.stars.length;
}
