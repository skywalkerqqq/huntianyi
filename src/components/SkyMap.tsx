"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  LATITUDE_KAIFENG,
  QUADRANT_COLORS,
  type Asterism,
  type ChineseSky,
  type SkyStar,
  groupKey,
} from "@/lib/sky";
import { Chip, Dock, DockSection, Slider, Toggle } from "@/components/ui";
import { SkyClockPanel, useSkyClock } from "@/components/TimeSync";
import { DEFAULT_EPOCH, EPOCHS, SIDEREAL_DAY_MS, type EpochId } from "@/lib/astro";
import { applyEpoch, meanPrecessionShift, precessList } from "@/lib/epoch";
import { milkyWayPoints } from "@/lib/milkyway";

/** 盖图上的银河星尘（固定 seed，服务端与客户端必须一致） */
const MILKY_SVG = milkyWayPoints(2200, 20260101);

/** 画布半径：去极度 180°（南天极）对应 R_MAX */
const R_MAX = 520;
const R_NAME = 468; // 二十八宿名标注圈
const OBLIQUITY = 23.4393;
/** 内规 = 恒显圈：去极度 ≤ 观测纬度（开封 34.8°）的星永不落下 */
const INNER_QJ = LATITUDE_KAIFENG;

const VIEW = 1160;
const BASE_VB = { x: -VIEW / 2, y: -VIEW / 2, w: VIEW };
const MIN_W = VIEW / 12; // 最大 12×
const MAX_W = VIEW * 2.0; // 最小 0.5×

/**
 * 极坐标投影：北极居中，去极度定半径，赤经定角度（仰观内视，赤经顺时针递增）。
 * 固定 3 位小数 —— 避免 SSR 序列化浮点精度差异导致 hydration mismatch。
 */
function toXY(raDeg: number, decDeg: number): [number, number] {
  const quji = 90 - decDeg;
  const r = (quji / 180) * R_MAX;
  const t = (raDeg * Math.PI) / 180;
  return [+(r * Math.cos(t)).toFixed(3), +(r * Math.sin(t)).toFixed(3)];
}

const qujiToR = (quji: number) => +((quji / 180) * R_MAX).toFixed(3);
const R_INNER = qujiToR(INNER_QJ);
const R_EQ = qujiToR(90);
const R_OUTER = qujiToR(180 - INNER_QJ);

/** 星等 → 点半径 */
function magToR(mag: number): number {
  return +Math.max(1.1, Math.min(6.2, (6.6 - mag) * 0.58)).toFixed(2);
}

/** 黄道：按黄经采样投影（盖图上的偏心闭曲线） */
function eclipticPath(): string {
  const pts: string[] = [];
  const eps = (OBLIQUITY * Math.PI) / 180;
  for (let lam = 0; lam <= 360; lam += 2) {
    const l = (lam * Math.PI) / 180;
    const dec = Math.asin(Math.sin(eps) * Math.sin(l));
    let ra = Math.atan2(Math.cos(eps) * Math.sin(l), Math.cos(l));
    ra = ((ra * 180) / Math.PI + 360) % 360;
    const [x, y] = toXY(ra, (dec * 180) / Math.PI);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return "M" + pts.join("L") + "Z";
}

const norm180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/* ==========================================================================
   纯渲染图层 —— memo 化。
   1386 颗星 / 420 段连线若每次 hover 都重建，交互会明显掉帧；
   这里用事件委托（data-si）+ memo，hover 时只更新 tooltip 本身。
   ========================================================================== */

const StarLayer = memo(function StarLayer({
  list,
  hiSet,
  dimming,
}: {
  list: { s: SkyStar; i: number }[];
  hiSet: Set<number>;
  dimming: boolean;
}) {
  return (
    <>
      {list.map(({ s, i }) => {
        const [x, y] = toXY(s.ra, s.dec);
        const isHi = dimming && hiSet.has(i);
        const on = !dimming || hiSet.has(i);
        return (
          <circle
            key={i}
            data-si={i}
            cx={x}
            cy={y}
            r={magToR(s.mag) * (isHi ? 1.5 : 1)}
            fill={isHi ? "#ffe9a8" : "#f0eee6"}
            opacity={on ? (isHi ? 1 : 0.9) : 0.18}
            stroke={isHi ? "#ffcf6a" : "none"}
            strokeWidth={isHi ? 1.2 : 0}
          />
        );
      })}
    </>
  );
});

const LineLayer = memo(function LineLayer({
  list,
  activeGroup,
  sky,
}: {
  list: { a: Asterism; seg: number[] }[];
  activeGroup: string | null;
  sky: ChineseSky;
}) {
  return (
    <>
      {list.map(({ a, seg }, k) => {
        const color =
          QUADRANT_COLORS[a.enclosure || a.quadrant || ""] || "#b9c6de";
        const pts = seg
          .map((si) => sky.stars[si])
          .filter(Boolean)
          .map((s) => toXY(s.ra, s.dec).join(","))
          .join(" ");
        if (!pts) return null;
        return (
          <polyline
            key={k}
            points={pts}
            fill="none"
            stroke={color}
            strokeWidth={1.3}
            strokeLinejoin="round"
            opacity={!activeGroup || groupKey(a) === activeGroup ? 0.75 : 0.14}
          />
        );
      })}
    </>
  );
});

/* ==========================================================================
   觀測者座標 —— 固定於圖紙（不隨天球旋轉）
   ========================================================================== */

/** 天顶去极度 = 90° − 观测纬度 */
const ZENITH_QJ = 90 - LATITUDE_KAIFENG;
const R_ZENITH = qujiToR(ZENITH_QJ);

/**
 * 此刻地平线在极坐标星图上的投影。
 * 地平条件：天体与天顶球面距 = 90° ⟹ cot p = −cot φ · cos(ψ − ψ天顶)
 * 图解极端：ψ = 天顶方向时 p = 180 − φ（南天极侧边界），反向时 p = φ（恒显圈），
 * 与既有的外规 / 内规半径完全吻合，可作为自洽校验。
 */
const HORIZON_PATH = (() => {
  const cot = 1 / Math.tan((LATITUDE_KAIFENG * Math.PI) / 180);
  const pts: string[] = [];
  for (let d = 0; d <= 360; d += 0.5) {
    const p =
      Math.atan2(1, -cot * Math.cos((d * Math.PI) / 180)) * (180 / Math.PI);
    const r = (p / 180) * R_MAX;
    const psi = ((270 + d) * Math.PI) / 180;
    pts.push(
      `${(r * Math.cos(psi)).toFixed(2)},${(r * Math.sin(psi)).toFixed(2)}`
    );
  }
  return "M" + pts.join("L") + "Z";
})();

/** 地平以下遮罩 = 外圆之内、地平曲线之外（even-odd 填充） */
const OUTER_CIRCLE_PATH = `M 0,${-R_MAX} A ${R_MAX},${R_MAX} 0 1,0 0,${R_MAX} A ${R_MAX},${R_MAX} 0 1,0 0,${-R_MAX} Z`;
const BELOW_HORIZON_PATH = `${HORIZON_PATH} ${OUTER_CIRCLE_PATH}`;

/** 太阳此刻所在（置于旋转层内，随恒星时转动） */
const SunMarker = memo(function SunMarker({
  sun,
  zoom,
}: {
  sun: { ra: number; dec: number };
  zoom: number;
}) {
  const [x, y] = toXY(sun.ra, sun.dec);
  return (
    <g style={{ pointerEvents: "none" }}>
      <circle cx={x} cy={y} r={19} fill="#ff9d3c" opacity={0.14} />
      <circle cx={x} cy={y} r={10.5} fill="#ffb545" opacity={0.3} />
      <circle
        cx={x}
        cy={y}
        r={5}
        fill="#ffe9a8"
        stroke="#ff9d3c"
        strokeWidth={1}
      />
      <text
        x={+(x + 13 / zoom).toFixed(3)}
        y={+(y + 4 / zoom).toFixed(3)}
        fontSize={13 / zoom}
        fill="#ffcf6a"
      >
        太阳
      </text>
    </g>
  );
});

/** 地平遮罩 · 子午线 · 天顶 */
const ObserverFrame = memo(function ObserverFrame() {
  return (
    <g style={{ pointerEvents: "none" }}>
      <path
        d={BELOW_HORIZON_PATH}
        fillRule="evenodd"
        fill="#04060b"
        opacity={0.74}
      />
      <path
        d={HORIZON_PATH}
        fill="none"
        stroke="#6fb4e8"
        strokeWidth={4}
        opacity={0.07}
      />
      <path
        d={HORIZON_PATH}
        fill="none"
        stroke="#6fb4e8"
        strokeWidth={1.4}
        strokeDasharray="8 6"
        opacity={0.72}
      />
      {/* 子午：过天顶与北天极的大圆，在本投影中为一条直线 */}
      <line
        x1={0}
        y1={-R_MAX}
        x2={0}
        y2={R_MAX}
        stroke="#6fb4e8"
        strokeWidth={1}
        strokeDasharray="4 7"
        opacity={0.45}
      />
      {/* 天顶 */}
      <circle
        cx={0}
        cy={-R_ZENITH}
        r={7.5}
        fill="none"
        stroke="#6fb4e8"
        strokeWidth={1.1}
        opacity={0.85}
      />
      <path
        d={`M -12,${-R_ZENITH} h 24 M 0,${-R_ZENITH - 12} v 24`}
        stroke="#6fb4e8"
        strokeWidth={1}
        opacity={0.7}
      />
      <text x={15} y={-R_ZENITH - 5} fontSize={13} fill="#8ec6ef" opacity={0.9}>
        天顶
      </text>
      <text x={9} y={-R_MAX + 32} fontSize={12} fill="#6fb4e8" opacity={0.7}>
        子午 · 上中天
      </text>
      <text
        x={16}
        y={qujiToR(LATITUDE_KAIFENG) + 18}
        fontSize={11}
        fill="#6fb4e8"
        opacity={0.62}
      >
        地平线下 · 此刻不可见
      </text>
    </g>
  );
});

export default function SkyMap({ sky }: { sky: ChineseSky }) {
  const svgRef = useRef<SVGSVGElement>(null);

  /** 显示历元：星表本身仍是 J2000，这里按岁差归算到所选年代 */
  const [epoch, setEpoch] = useState<EpochId>(DEFAULT_EPOCH);
  const view = useMemo(() => applyEpoch(sky, epoch), [sky, epoch]);
  const meanShift = useMemo(() => meanPrecessionShift(sky, epoch), [sky, epoch]);

  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [showMilky, setShowMilky] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [innerAngle, setInnerAngle] = useState(0);
  const [outerAngle, setOuterAngle] = useState(0);
  const [linked, setLinked] = useState(true);
  const [spin, setSpin] = useState(false);
  const [speed, setSpeed] = useState(12); // 度/秒

  /* —— 天象同步：由真实恒星时驱动星空 —— */
  const [sync, setSync] = useState(false);
  const [live, setLive] = useState(true);
  const [clockMs, setClockMs] = useState(0);
  const { last, rotation, sun } = useSkyClock(sync, live, clockMs, setClockMs);

  /** 同步开启时，两层统一由恒星时驱动（星空周日运动是一个整体） */
  const outerRot = sync ? rotation : outerAngle;
  const innerRot = sync ? rotation : innerAngle;

  /** 关闭同步时不跳变：把当前由恒星时算出的角继承给手动角 */
  const onSyncChange = (v: boolean) => {
    if (v) {
      if (live) setClockMs(Date.now());
    } else {
      setInnerAngle(rotation);
      setOuterAngle(rotation);
    }
    setSync(v);
  };
  // 只存下标：星位随历元更换，坐标须从 view 现取
  const [selected, setSelected] = useState<{
    idx: number;
    asterism: Asterism | null;
  } | null>(null);
  const [hovered, setHovered] = useState<{
    idx: number;
    x: number;
    y: number;
  } | null>(null);

  /** 視野（viewBox）：支援縮放與平移 */
  const [vb, setVb] = useState(BASE_VB);
  const vbRef = useRef(vb);
  useEffect(() => {
    vbRef.current = vb;
  }, [vb]);

  const drag = useRef({
    active: false,
    mode: "rotate" as "rotate" | "pan",
    which: null as "inner" | "outer" | null,
    lastAngle: 0,
    lastX: 0,
    lastY: 0,
    moved: false,
  });
  const pinch = useRef<{ d: number } | null>(null);

  const starToAsterism = useMemo(() => {
    const m = new Map<number, Asterism>();
    for (const a of view.asterisms) {
      for (const i of a.stars) if (!m.has(i)) m.set(i, a);
    }
    return m;
  }, [view]);

  const groups = useMemo(() => {
    const g = new Map<string, number>();
    for (const a of view.asterisms) {
      const k = groupKey(a);
      g.set(k, (g.get(k) || 0) + 1);
    }
    const order = ["紫微垣", "太微垣", "天市垣"];
    const rest = [...g.keys()].filter((k) => !order.includes(k));
    return [...order.filter((k) => g.has(k)), ...rest].map((k) => ({
      name: k,
      count: g.get(k)!,
    }));
  }, [view]);

  /** 按内规把星与连线分成内圈 / 外圈两层 */
  const layers = useMemo(() => {
    const inner: { s: SkyStar; i: number }[] = [];
    const outer: { s: SkyStar; i: number }[] = [];
    view.stars.forEach((s, i) => {
      (s.quji <= INNER_QJ ? inner : outer).push({ s, i });
    });

    const innerLines: { a: Asterism; seg: number[] }[] = [];
    const outerLines: { a: Asterism; seg: number[] }[] = [];
    for (const a of view.asterisms) {
      for (const seg of a.lines) {
        const ss = seg.map((si) => view.stars[si]).filter(Boolean);
        if (!ss.length) continue;
        const avg = ss.reduce((t, x) => t + x.quji, 0) / ss.length;
        (avg <= INNER_QJ ? innerLines : outerLines).push({ a, seg });
      }
    }
    return { inner, outer, innerLines, outerLines };
  }, [view]);

  const hiStars = useMemo(() => {
    const s = new Set<number>();
    if (!activeGroup) return s;
    for (const a of view.asterisms) {
      if (groupKey(a) === activeGroup) for (const i of a.stars) s.add(i);
    }
    return s;
  }, [activeGroup, view]);

  /**
   * 银河：按内外规拆成两层，各自跟随所属圆盘旋转 ——
   * 与星点分层同一判据（去极度 ≤ 观测纬度即恒显）。整条银河若只放一层，
   * 取消联动后就会跟错盘。
   */
  const milkyPaths = useMemo(() => {
    const pts = precessList(MILKY_SVG, epoch);
    let inner = "";
    let outer = "";
    for (const p of pts) {
      const [x, y] = toXY(p.ra, p.dec);
      const s = 1.5 + p.w * 2.1;
      const seg =
        `M${(x - s / 2).toFixed(2)} ${(y - s / 2).toFixed(2)}` +
        `h${s.toFixed(2)}v${s.toFixed(2)}h${(-s).toFixed(2)}z`;
      if (90 - p.dec <= INNER_QJ) inner += seg;
      else outer += seg;
    }
    return { inner, outer };
  }, [epoch]);

  const ecliptic = useMemo(eclipticPath, []);

  // 自动旋转（天象同步开启时由真实时刻接管，此处让位）
  useEffect(() => {
    if (!spin || sync) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const d = speed * dt;
      setOuterAngle((v) => v + d);
      if (linked) setInnerAngle((v) => v + d);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spin, speed, linked, sync]);

  /* ---------- 坐标变换 ---------- */

  /** 屏幕像素 → SVG 用户坐标（经 getScreenCTM，自动含 viewBox 缩放平移） */
  function toSvg(clientX: number, clientY: number): [number, number] {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return [0, 0];
    const inv = ctm.inverse();
    const pt = new DOMPoint(clientX, clientY).matrixTransform(inv);
    return [pt.x, pt.y];
  }

  /** 屏幕像素 → SVG 用户单位 的比例（每像素多少用户单位） */
  function pxScale(): number {
    const svg = svgRef.current;
    if (!svg) return 1;
    const rect = svg.getBoundingClientRect();
    return Math.min(rect.width, rect.height) / vbRef.current.w;
  }

  const angleAt = (cx: number, cy: number) => {
    const [x, y] = toSvg(cx, cy);
    return (Math.atan2(y, x) * 180) / Math.PI;
  };

  /* ---------- 缩放 / 平移 ---------- */

  /** 以用户坐标 (ax, ay) 为锚点缩放 */
  const zoomAt = (ax: number, ay: number, factor: number) => {
    setVb((v) => {
      const w = clamp(v.w / factor, MIN_W, MAX_W);
      const k = w / v.w;
      const half = VIEW / 2;
      return {
        x: clamp(ax - (ax - v.x) * k, -half - VIEW, half + VIEW),
        y: clamp(ay - (ay - v.y) * k, -half - VIEW, half + VIEW),
        w,
      };
    });
  };

  /** 以图心为锚点缩放（按钮 / 滑杆用） */
  const zoomCenter = (factor: number) => {
    const v = vbRef.current;
    zoomAt(v.x + v.w / 2, v.y + v.w / 2, factor);
  };

  const panPx = (dxScreen: number, dyScreen: number) => {
    const s = pxScale() || 1;
    setVb((v) => {
      const half = VIEW / 2;
      return {
        ...v,
        x: clamp(v.x - dxScreen / s, -half - VIEW, half + VIEW),
        y: clamp(v.y - dyScreen / s, -half - VIEW, half + VIEW),
      };
    });
  };

  const resetView = () => setVb(BASE_VB);

  /** 滚轮缩放（需 passive:false 才能 preventDefault，故手动綁定） */
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const [ax, ay] = toSvg(e.clientX, e.clientY);
      zoomAt(ax, ay, Math.exp(-e.deltaY * 0.0016));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zoomPct = Math.round((VIEW / vb.w) * 100);

  /* ---------- 拖拽：旋转 / 平移 ---------- */

  type Pt = { clientX: number; clientY: number; altKey?: boolean; button?: number };

  function onDown(e: Pt) {
    const panMode = Boolean(e.altKey) || e.button === 1;
    const [x, y] = toSvg(e.clientX, e.clientY);
    drag.current = {
      active: true,
      mode: panMode ? "pan" : "rotate",
      which: Math.hypot(x, y) <= R_INNER ? "inner" : "outer",
      lastAngle: angleAt(e.clientX, e.clientY),
      lastX: e.clientX,
      lastY: e.clientY,
      moved: false,
    };
  }

  function onMove(e: Pt) {
    const d = drag.current;
    if (!d.active) return;

    if (d.mode === "pan") {
      const dx = e.clientX - d.lastX;
      const dy = e.clientY - d.lastY;
      if (Math.abs(dx) + Math.abs(dy) > 0.5) {
        d.moved = true;
        d.lastX = e.clientX;
        d.lastY = e.clientY;
        panPx(dx, dy);
      }
      return;
    }

    const a = angleAt(e.clientX, e.clientY);
    const delta = norm180(a - d.lastAngle);
    if (Math.abs(delta) > 0.01) {
      d.moved = true;
      d.lastAngle = a;

      /* 天象同步下：拖动 = 拨动时刻（恒星时反推 UT），顺转 → 回溯 */
      if (sync) {
        setLive(false);
        setClockMs((v) => v - (delta / 360) * SIDEREAL_DAY_MS);
        return;
      }

      const apply = (v: number) => v + delta;
      if (d.which === "inner") {
        setInnerAngle(apply);
        if (linked) setOuterAngle(apply);
      } else {
        setOuterAngle(apply);
        if (linked) setInnerAngle(apply);
      }
    }
  }

  function onUp() {
    drag.current.active = false;
    // 让 click 事件能读到 moved 后重置（延后一帧）
    setTimeout(() => {
      drag.current.moved = false;
    }, 0);
  }

  /* ---------- 触摸：单指旋转 / 双指捏合缩放 + 平移 ---------- */

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      drag.current.active = false;
      pinch.current = { d: touchDist(e) };
      return;
    }
    if (e.touches[0]) onDown(e.touches[0]);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinch.current) {
      const nd = touchDist(e);
      const md = touchMid(e);
      const [ax, ay] = toSvg(md.x, md.y);
      zoomAt(ax, ay, nd / pinch.current.d);
      pinch.current = { d: nd };
      drag.current.moved = true;
      return;
    }
    if (e.touches[0]) onMove(e.touches[0]);
  }

  function onTouchEnd() {
    pinch.current = null;
    onUp();
  }

  function touchDist(e: React.TouchEvent) {
    const [a, b] = [e.touches[0], e.touches[1]];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
  }

  function touchMid(e: React.TouchEvent) {
    const [a, b] = [e.touches[0], e.touches[1]];
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
  }

  /* ---------- 事件委托：hover / click ---------- */

  function starIndexFrom(target: EventTarget | null): number | null {
    const el = (target as Element | null)?.closest?.("[data-si]");
    if (!el) return null;
    const raw = el.getAttribute("data-si");
    if (raw == null) return null;
    const i = Number(raw);
    return Number.isFinite(i) ? i : null;
  }

  function handleMove(e: React.MouseEvent) {
    const i = starIndexFrom(e.target);
    if (i != null) {
      if (view.stars[i]) setHovered({ idx: i, x: e.clientX, y: e.clientY });
      return;
    }
    if (hovered) setHovered(null);
  }

  function handleClick(e: React.MouseEvent) {
    if (drag.current.moved) return;
    const i = starIndexFrom(e.target);
    if (i == null) return;
    if (!view.stars[i]) return;
    setSelected({ idx: i, asterism: starToAsterism.get(i) || null });
  }

  const reset = () => {
    setInnerAngle(0);
    setOuterAngle(0);
  };

  /** 选中星从 view 现取 —— 切历元后坐标随之更新 */
  const selStar = selected ? view.stars[selected.idx] : null;
  const epochLabel = EPOCHS.find((e) => e.id === epoch)?.label ?? "";

  const fmtRa = (deg: number) => {
    const h = deg / 15;
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60);
    const ss = Math.round(((h - hh) * 60 - mm) * 60);
    return `${hh}h ${mm}m ${ss}s`;
  };

  const labels = (list: { s: SkyStar; i: number }[], minMag: number, size: number) => (
    <g style={{ pointerEvents: "none" }}>
      {list
        .filter(({ s }) => s.mag <= minMag && s.zh)
        .map(({ s }) => {
          const [x, y] = toXY(s.ra, s.dec);
          return (
            <text
              key={`${s.zh}-${s.ra}`}
              x={+(x + magToR(s.mag) + 4 / (VIEW / vb.w)).toFixed(3)}
              y={+(y + 4 / (VIEW / vb.w)).toFixed(3)}
              fontSize={size / (VIEW / vb.w)}
              fill="#e8ecf5"
              opacity={0.8}
            >
              {s.zh}
            </text>
          );
        })}
    </g>
  );

  const vbStr = `${vb.x.toFixed(2)} ${vb.y.toFixed(2)} ${vb.w.toFixed(
    2
  )} ${vb.w.toFixed(2)}`;

  return (
    <>
      <div className="flat-root">
        <svg
          ref={svgRef}
          viewBox={vbStr}
          className="skymap"
          onMouseDown={onDown}
          onMouseMove={(e) => {
            onMove(e);
            handleMove(e);
          }}
          onMouseUp={onUp}
          onMouseLeave={() => {
            onUp();
            setHovered(null);
          }}
          onClick={handleClick}
          onDoubleClick={resetView}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <defs>
            <radialGradient id="bgGrad">
              <stop offset="0%" stopColor="#0b1424" />
              <stop offset="70%" stopColor="#080d18" />
              <stop offset="100%" stopColor="#05070d" />
            </radialGradient>
            <radialGradient id="innerGrad">
              <stop offset="0%" stopColor="#1b2438" />
              <stop offset="100%" stopColor="#131a2b" />
            </radialGradient>
            {/* 银河星尘用模糊合成连续的雾带 —— 比单纯堆点数更像银河 */}
            <filter id="milkyBlur" x="-15%" y="-15%" width="130%" height="130%">
              <feGaussianBlur stdDeviation="2.6" />
            </filter>
          </defs>

          <circle r={R_MAX + 30} fill="url(#bgGrad)" />

          {/* —— 固定参考层：赤纬圈（内规/赤道/外规）—— */}
          <circle r={R_INNER} fill="url(#innerGrad)" />
          <circle
            className="draw"
            r={R_INNER}
            fill="none"
            stroke="#e8c76a"
            strokeWidth={2.6}
            opacity={0.95}
            pathLength={1}
          />
          <circle
            className="draw"
            r={R_EQ}
            fill="none"
            stroke="#c9a227"
            strokeWidth={2}
            opacity={0.85}
            pathLength={1}
          />
          <circle
            className="draw"
            r={R_OUTER}
            fill="none"
            stroke="#c9a227"
            strokeWidth={1.6}
            opacity={0.7}
            pathLength={1}
          />
          <circle
            className="draw"
            r={R_MAX}
            fill="none"
            stroke="#c9a227"
            strokeWidth={2.4}
            opacity={0.9}
            pathLength={1}
          />

          {/* 内外圈标注 */}
          <text
            x={0}
            y={-R_INNER - 10}
            textAnchor="middle"
            fontSize={15}
            fill="#e8c76a"
            opacity={0.9}
            style={{ pointerEvents: "none" }}
          >
            内规 · 恒显圈（内圈）
          </text>
          <text
            x={0}
            y={R_OUTER + 22}
            textAnchor="middle"
            fontSize={15}
            fill="#c9a227"
            opacity={0.85}
            style={{ pointerEvents: "none" }}
          >
            外规 · 恒隐圈界
          </text>

          {/* —— 外圈层：二十八宿 · 黄道 · 外圈星官 —— */}
          <g
            className="ring-outer"
            transform={`rotate(${outerRot.toFixed(3)})`}
          >
            {showMilky ? (
              <path d={milkyPaths.outer} fill="#8d9cc4" opacity={0.5} filter="url(#milkyBlur)" pointerEvents="none" />
            ) : null}
            <path
              d={ecliptic}
              fill="none"
              stroke="#8fb9a8"
              strokeWidth={1.8}
              strokeDasharray="7 5"
              opacity={0.85}
            />
            {view.mansions.map((m) => {
              if (m.ra == null) return null;
              const t = (m.ra * Math.PI) / 180;
              const x2 = +(R_MAX * Math.cos(t)).toFixed(3);
              const y2 = +(R_MAX * Math.sin(t)).toFixed(3);
              const nx = +(R_NAME * Math.cos(t)).toFixed(3);
              const ny = +(R_NAME * Math.sin(t)).toFixed(3);
              const isHi = activeGroup === m.zh;
              return (
                <g key={m.zh}>
                  <line
                    x1={0}
                    y1={0}
                    x2={x2}
                    y2={y2}
                    stroke={isHi ? "#ffe9a8" : "#d8b45a"}
                    strokeWidth={isHi ? 1.6 : 0.9}
                    opacity={isHi ? 0.95 : 0.3}
                  />
                  <text
                    x={nx}
                    y={ny}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={19}
                    fill={isHi ? "#ffe9a8" : "#c9a227"}
                    fontWeight={isHi ? 700 : 500}
                    style={{ userSelect: "none", pointerEvents: "none" }}
                  >
                    {m.zh}
                  </text>
                </g>
              );
            })}
            {showLines && (
              <LineLayer
                list={layers.outerLines}
                activeGroup={activeGroup}
                sky={view}
              />
            )}
            <StarLayer
              list={layers.outer}
              hiSet={hiStars}
              dimming={activeGroup != null}
            />
            {showLabels && labels(layers.outer, 1.6, 13)}

            {/* 太阳此刻所在（随天球一起旋转） */}
            {sync ? <SunMarker sun={sun} zoom={VIEW / vb.w} /> : null}
          </g>

          {/* —— 内圈层：紫微垣 · 拱极星官 —— */}
          <g
            className="ring-inner"
            transform={`rotate(${innerRot.toFixed(3)})`}
          >
            {showMilky ? (
              <path d={milkyPaths.inner} fill="#8d9cc4" opacity={0.5} filter="url(#milkyBlur)" pointerEvents="none" />
            ) : null}
            {showLines && (
              <LineLayer
                list={layers.innerLines}
                activeGroup={activeGroup}
                sky={view}
              />
            )}
            <StarLayer
              list={layers.inner}
              hiSet={hiStars}
              dimming={activeGroup != null}
            />
            {showLabels && labels(layers.inner, 2.5, 12)}
          </g>

          {/* —— 观测者坐标（固定于图纸）：地平遮罩 · 子午 · 天顶 —— */}
          {sync ? <ObserverFrame /> : null}

          {/* 北极 */}
          <circle r={3.4} fill="#ffe9a8" />
          <text
            x={0}
            y={-16}
            textAnchor="middle"
            fontSize={15}
            fill="#ffe9a8"
            style={{ pointerEvents: "none" }}
          >
            北天极
          </text>
        </svg>
      </div>

      {/* 缩放控制 */}
      <div className="zoombar">
        <button
          className="zbtn"
          onClick={() => zoomCenter(1.35)}
          title="放大（滚轮向上 / 双指张开）"
          aria-label="放大"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path
              d="M6.5 1.5v10M1.5 6.5h10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <div className="zval" title="当前视野比例">
          {zoomPct}%
        </div>
        <button
          className="zbtn"
          onClick={() => zoomCenter(1 / 1.35)}
          title="缩小（滚轮向下 / 双指捏合）"
          aria-label="缩小"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path
              d="M1.5 6.5h10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <button
          className="zbtn zreset"
          onClick={resetView}
          title="复位视野（双击画布）"
          aria-label="复位视野"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path
              d="M2.6 6.5a3.9 3.9 0 1 0 1.5-3.06M2.4 2.2v2.1h2.1"
              stroke="currentColor"
              strokeWidth="1.35"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* 控制台 */}
      <Dock title="盖天图 · 图层">
        <DockSection>历元 EPOCH</DockSection>
        <div className="chips">
          {EPOCHS.map((e) => (
            <Chip
              key={e.id}
              active={epoch === e.id}
              onClick={() => setEpoch(e.id)}
              title={e.note}
            >
              {e.label}
            </Chip>
          ))}
        </div>
        <div className="hint">
          {epoch === "j2000"
            ? "星表原历元。与北宋相距约 950 年，岁差已使星位整体偏移 13° 量级"
            : `已按 IAU 1976 岁差归算到${
                epoch === "song" ? "北宋 1052 年" : "当代"
              }，全表平均位移 ${meanShift.toFixed(2)}°`}
        </div>

        <DockSection>星图图层</DockSection>
        <Toggle
          checked={showMilky}
          onChange={setShowMilky}
          label="银河"
          meta="银道面"
        />
        <Toggle checked={showLines} onChange={setShowLines} label="星官连线" />
        <Toggle checked={showLabels} onChange={setShowLabels} label="亮星标注" />

        <DockSection>视野</DockSection>
        <div className="hint">
          滚轮 / 双指捏合缩放 · Alt（中键）拖动平移 · 双击复位
        </div>
        <Slider
          label="缩放"
          value={Math.round(Math.log2(VIEW / vb.w) * 100)}
          display={`${zoomPct}%`}
          min={-100}
          max={Math.round(Math.log2(VIEW / MIN_W) * 100)}
          onChange={(v) => {
            const target = Math.pow(2, v / 100); // 目标倍率
            const cur = VIEW / vbRef.current.w;
            zoomCenter(target / cur);
          }}
        />

        <DockSection>双盘旋转</DockSection>
        {sync ? (
          <div className="hint">
            同步开启 —— 双盘此刻由恒星时统一驱动，旋转角 {rotation.toFixed(1)}°
          </div>
        ) : (
          <>
            <div className="hint">在内圈区域拖动转内盘，在外圈区域拖动转外盘</div>
            <Slider
              label="内圈"
              value={((innerAngle + 180) % 360) - 180}
              display={`${innerAngle.toFixed(0)}°`}
              min={-180}
              max={180}
              onChange={(v) => {
                setInnerAngle(v);
                if (linked) setOuterAngle(v);
              }}
            />
            <Slider
              label="外圈"
              value={((outerAngle + 180) % 360) - 180}
              display={`${outerAngle.toFixed(0)}°`}
              min={-180}
              max={180}
              onChange={(v) => {
                setOuterAngle(v);
                if (linked) setInnerAngle(v);
              }}
            />
            <Toggle checked={linked} onChange={setLinked} label="内外圈联动" />
            <Toggle checked={spin} onChange={setSpin} label="自动旋转" />
            <Slider
              label="周日运动速度"
              value={speed}
              display={`${speed}°/s`}
              min={1}
              max={60}
              onChange={setSpeed}
            />
            <button className="btn" onClick={reset} style={{ marginTop: 8 }}>
              旋回 ±0°
            </button>
          </>
        )}

        <SkyClockPanel
          sync={sync}
          onSync={onSyncChange}
          live={live}
          onLive={setLive}
          clockMs={clockMs}
          setClockMs={setClockMs}
          last={last}
          sun={sun}
          hint={
            sync
              ? "观测者坐标已锁定此刻，在地平曲线以内的星官此刻可见；拖动星图可直接拨动时刻"
              : "开启后星空按开封真实恒星时转动，可校正到任意时刻"
          }
        />

        <DockSection>三垣二十八宿</DockSection>
        <div className="hint">点选分区可高亮该天区星官</div>
        <div className="chips">
          <Chip active={activeGroup === null} onClick={() => setActiveGroup(null)}>
            全部
          </Chip>
          {groups.map((g) => (
            <Chip
              key={g.name}
              active={activeGroup === g.name}
              onClick={() => setActiveGroup(g.name)}
              title={`${g.count} 个星官`}
            >
              {g.name}
            </Chip>
          ))}
        </div>
      </Dock>

      {hovered && (
        <div
          className="tooltip"
          style={{ left: hovered.x + 14, top: hovered.y + 14 }}
        >
          {view.stars[hovered.idx].zh || "无名星"}
          <span>
            {starToAsterism.get(hovered.idx)?.zh || "—"} ·{" "}
            {view.stars[hovered.idx].mag.toFixed(2)} 等
          </span>
        </div>
      )}

      {selected && selStar && (
        <div className="panel">
          <button
            className="close"
            onClick={() => setSelected(null)}
            aria-label="关闭"
          >
            ×
          </button>
          <div className="panel-eyebrow">
            <i />
            {selected.asterism?.enclosure
              ? "三垣"
              : selected.asterism?.mansion
              ? "二十八宿"
              : "星官"}
          </div>
          <h2>{selStar.zh || "无名星"}</h2>
          <div className="sub">
            {selStar.hip ? `HIP ${selStar.hip}` : "Gaia DR3"}
            {selStar.en ? ` · ${selStar.en}` : ""}
          </div>

          <div className="tags">
            {selStar.quji <= INNER_QJ ? (
              <span className="tag">内圈 · 恒显</span>
            ) : (
              <span className="tag">外圈 · 二十八宿</span>
            )}
            {selected.asterism?.zh ? (
              <span className="tag">{selected.asterism.zh}</span>
            ) : null}
            {selected.asterism?.enclosure ? (
              <span className="tag">{selected.asterism.enclosure}</span>
            ) : null}
            {selected.asterism?.mansion ? (
              <span className="tag">{selected.asterism.mansion}宿</span>
            ) : null}
            {selected.asterism?.quadrant ? (
              <span className="tag">{selected.asterism.quadrant}</span>
            ) : null}
          </div>

          <dl className="meta">
            <dt>赤经 α</dt>
            <dd>{fmtRa(selStar.ra)}</dd>
            <dt>赤纬 δ</dt>
            <dd>
              {selStar.dec >= 0 ? "+" : "−"}
              {Math.abs(selStar.dec).toFixed(3)}°
            </dd>
            <dt>去极度</dt>
            <dd>{selStar.quji.toFixed(3)}°</dd>
            <dt>视星等</dt>
            <dd>{selStar.mag.toFixed(2)}</dd>
            <dt>历元</dt>
            <dd>{epochLabel}</dd>
          </dl>
        </div>
      )}
    </>
  );
}
