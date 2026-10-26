"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  CELESTIAL_R,
  OBLIQUITY_DEG,
  MOON_INCLINATION_DEG,
  QUADRANT_COLORS,
  type Asterism,
  type ChineseSky,
  type SkyStar,
  groupKey,
  magToScale,
  raDecToVec3,
} from "@/lib/sky";
import { Chip, Dock, DockSection, Toggle } from "@/components/ui";
import { SkyClockPanel, useSkyClock } from "@/components/TimeSync";

/** 观测地纬度（北宋开封 ≈ 34.8°N，苏颂水运仪象台所在） */
const LATITUDE = 34.8;

const starVertex = /* glsl */ `
  uniform float uSize;
  attribute float aScale;
  attribute float aHi;
  varying float vHi;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * aScale * (1.0 + aHi * 0.85) / -mv.z;
    vHi = aHi;
  }
`;

const starFragment = /* glsl */ `
  varying float vHi;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float a = pow(max(0.0, 1.0 - d * 2.0), 1.8);
    vec3 base = vec3(0.93, 0.92, 0.86);
    vec3 hi = vec3(1.0, 0.82, 0.42);
    gl_FragColor = vec4(mix(base, hi, vHi), a * mix(0.85, 1.0, vHi));
  }
`;

function hexToVec3(hex: string): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

/** 星官连线：按所属分区着色 */
function buildAsterismLines(sky: ChineseSky) {
  const pos: number[] = [];
  const col: number[] = [];
  for (const a of sky.asterisms) {
    const hex =
      QUADRANT_COLORS[a.enclosure || a.quadrant || ""] || "#b9c6de";
    const [r, g, b] = hexToVec3(hex);
    for (const seg of a.lines) {
      for (let i = 0; i < seg.length - 1; i++) {
        const s0 = sky.stars[seg[i]];
        const s1 = sky.stars[seg[i + 1]];
        if (!s0 || !s1) continue;
        const p0 = raDecToVec3(s0.ra, s0.dec);
        const p1 = raDecToVec3(s1.ra, s1.dec);
        pos.push(...p0, ...p1);
        col.push(r, g, b, r, g, b);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
  });
  return new THREE.LineSegments(geo, mat);
}

/** 二十八宿分界线：沿各宿距星赤经，从北天极辐射到南天极 */
function buildMansionLines(sky: ChineseSky) {
  const pos: number[] = [];
  for (const m of sky.mansions) {
    if (m.ra == null) continue;
    let prev: [number, number, number] | null = null;
    for (let dec = 88; dec >= -88; dec -= 4) {
      const p = raDecToVec3(m.ra, dec);
      if (prev) pos.push(...prev, ...p);
      prev = p;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0xd8b45a,
    transparent: true,
    opacity: 0.22,
  });
  return new THREE.LineSegments(geo, mat);
}

/** 浑仪环系：地平/子午（固定于地平坐标系）+ 赤道/黄道/白道/四游（随天轴） */
function buildRings(skyGroup: THREE.Group, fixedGroup: THREE.Group) {
  const bronze = (c: number, metal: number, rough: number) =>
    new THREE.MeshStandardMaterial({
      color: c,
      metalness: metal,
      roughness: rough,
    });

  const mk = (
    radius: number,
    tube: number,
    mat: THREE.Material,
    rot: [number, number, number] = [0, 0, 0]
  ) => {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(radius, tube, 16, 128),
      mat
    );
    m.rotation.set(rot[0], rot[1], rot[2]);
    return m;
  };

  // —— 随天轴（放 skyGroup 内，天轴 = +Y）——
  const goldMat = bronze(0xc9a227, 0.85, 0.32);
  const jadeMat = bronze(0x8fb9a8, 0.7, 0.4);
  const silverMat = bronze(0xbcc7d6, 0.75, 0.35);

  // 赤道环：垂直于天轴 → XZ 平面
  const equator = mk(5.2, 0.045, goldMat, [-Math.PI / 2, 0, 0]);
  // 黄道环：与赤道成黄赤交角
  const ecliptic = mk(
    5.25,
    0.042,
    jadeMat,
    [-Math.PI / 2 + (OBLIQUITY_DEG * Math.PI) / 180, 0, 0]
  );
  // 白道环：与黄道再成黄白交角
  const lunar = mk(
    5.32,
    0.034,
    silverMat,
    [
      -Math.PI / 2 +
        ((OBLIQUITY_DEG + MOON_INCLINATION_DEG) * Math.PI) / 180,
      0,
      0,
    ]
  );
  // 四游环：过南北天极，可绕天轴转动
  const fourYou = mk(5.1, 0.038, goldMat, [0, 0, 0]);
  // 天轴（南北极连线）
  const axis = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, CELESTIAL_R * 2.3, 12),
    bronze(0xd9c48a, 0.8, 0.35)
  );
  skyGroup.add(equator, ecliptic, lunar, fourYou, axis);

  // —— 固定于地平坐标系 ——
  // 北天极倾斜方向为 −Z（天球组绕 X 轴旋转所致），故子午面 = YZ 平面
  const meridian = mk(5.6, 0.05, goldMat, [0, Math.PI / 2, 0]);
  // 地平环：水平
  const horizon = mk(5.92, 0.062, bronze(0xa8813f, 0.8, 0.4), [
    -Math.PI / 2,
    0,
    0,
  ]);
  fixedGroup.add(meridian, horizon);

  // 底座与立柱
  const base = new THREE.Mesh(
    new THREE.TorusGeometry(3.0, 0.09, 12, 96),
    bronze(0x6b4f2a, 0.6, 0.55)
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = -6.1;
  fixedGroup.add(base);

  const pillarMat = bronze(0x7a5c33, 0.55, 0.6);
  for (const [px, pz] of [
    [2.1, 2.1],
    [-2.1, 2.1],
    [2.1, -2.1],
    [-2.1, -2.1],
  ]) {
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.09, 1.9, 10),
      pillarMat
    );
    pillar.position.set(px, -5.15, pz);
    fixedGroup.add(pillar);
  }

  return { equator, ecliptic, lunar, fourYou, axis, meridian, horizon };
}

export default function Armillary({ sky }: { sky: ChineseSky }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showStars, setShowStars] = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [showMansion, setShowMansion] = useState(true);
  const [showRings, setShowRings] = useState(true);
  const [axisUp, setAxisUp] = useState(false); // 天轴摆正（赤道模式）
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [selected, setSelected] = useState<{
    star: SkyStar;
    asterism: Asterism | null;
  } | null>(null);
  const [hovered, setHovered] = useState<{
    star: SkyStar;
    x: number;
    y: number;
  } | null>(null);

  // 星 → 所属星官
  const starToAsterism = useMemo(() => {
    const m = new Map<number, Asterism>();
    for (const a of sky.asterisms) {
      for (const i of a.stars) if (!m.has(i)) m.set(i, a);
    }
    return m;
  }, [sky]);

  // 分组统计
  const groups = useMemo(() => {
    const g = new Map<string, number>();
    for (const a of sky.asterisms) {
      const k = groupKey(a);
      g.set(k, (g.get(k) || 0) + 1);
    }
    const order = ["紫微垣", "太微垣", "天市垣"];
    const rest = [...g.keys()].filter((k) => !order.includes(k));
    return [...order.filter((k) => g.has(k)), ...rest].map((k) => ({
      name: k,
      count: g.get(k)!,
    }));
  }, [sky]);

  const refs = useRef<{
    stars?: THREE.Points;
    hiAttr?: THREE.BufferAttribute;
    lines?: THREE.LineSegments;
    mansionLines?: THREE.LineSegments;
    skyGroup?: THREE.Group;
    ringGroup?: THREE.Group;
    fixedGroup?: THREE.Group;
    sun?: THREE.Mesh;
  }>({});

  /* —— 天象同步 —— */
  const [sync, setSync] = useState(false);
  const [live, setLive] = useState(true);
  const [clockMs, setClockMs] = useState(0);
  const { last, sun } = useSkyClock(sync, live, clockMs, setClockMs);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x06070c, 0.012);

    const camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.1,
      200
    );
    // 窄竖屏时拉远相机，保证浑天仪完整入画
    const portrait = container.clientWidth / container.clientHeight < 0.85;
    camera.position.set(0, 5.5, portrait ? 19.5 : 13);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x06070c, 1);
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xfff0d0, 1.1);
    key.position.set(6, 9, 8);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x88aaff, 0.5);
    rim.position.set(-8, -4, -7);
    scene.add(rim);

    // 天球组（随天轴倾斜）
    const skyGroup = new THREE.Group();
    skyGroup.rotation.x = -((90 - LATITUDE) * Math.PI) / 180;
    scene.add(skyGroup);

    const fixedGroup = new THREE.Group();
    scene.add(fixedGroup);
    buildRings(skyGroup, fixedGroup);

    // 星点
    const n = sky.stars.length;
    const pos = new Float32Array(n * 3);
    const scale = new Float32Array(n);
    const hi = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const s = sky.stars[i];
      const [x, y, z] = raDecToVec3(s.ra, s.dec);
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      scale[i] = magToScale(s.mag);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aScale", new THREE.BufferAttribute(scale, 1));
    const hiAttr = new THREE.BufferAttribute(hi, 1);
    geo.setAttribute("aHi", hiAttr);
    const mat = new THREE.ShaderMaterial({
      vertexShader: starVertex,
      fragmentShader: starFragment,
      uniforms: { uSize: { value: 165 * renderer.getPixelRatio() } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const stars = new THREE.Points(geo, mat);
    skyGroup.add(stars);

    // 连线
    const lines = buildAsterismLines(sky);
    skyGroup.add(lines);
    const mansionLines = buildMansionLines(sky);
    skyGroup.add(mansionLines);

    // 太阳此刻所在（随天球旋转）
    const sunBody = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 })
    );
    const sunHalo = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 18, 18),
      new THREE.MeshBasicMaterial({
        color: 0xff9d3c,
        transparent: true,
        opacity: 0.24,
      })
    );
    sunBody.add(sunHalo);
    sunBody.visible = false;
    skyGroup.add(sunBody);

    refs.current = {
      stars,
      hiAttr,
      lines,
      mansionLines,
      skyGroup,
      fixedGroup,
      sun: sunBody,
    };

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 6;
    controls.maxDistance = 30;
    controls.target.set(0, 0, 0);

    // 拾取
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 0.16 };
    const ndc = new THREE.Vector2(-10, -10);

    function pick(): number | null {
      raycaster.setFromCamera(ndc, camera);
      const inter = raycaster.intersectObject(stars);
      if (inter.length && inter[0].index != null) return inter[0].index;
      return null;
    }

    function onMove(e: MouseEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const idx = pick();
      if (idx != null) {
        setHovered({ star: sky.stars[idx], x: e.clientX, y: e.clientY });
        renderer.domElement.style.cursor = "pointer";
      } else {
        setHovered(null);
        renderer.domElement.style.cursor = "grab";
      }
    }
    function onClick() {
      const idx = pick();
      if (idx != null) {
        setSelected({
          star: sky.stars[idx],
          asterism: starToAsterism.get(idx) || null,
        });
      }
    }
    renderer.domElement.addEventListener("mousemove", onMove);
    renderer.domElement.addEventListener("click", onClick);
    renderer.domElement.style.cursor = "grab";

    let raf = 0;
    function animate() {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    }
    animate();

    function onResize() {
      const w = container?.clientWidth || window.innerWidth;
      const h = container?.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("mousemove", onMove);
      renderer.domElement.removeEventListener("click", onClick);
      controls.dispose();
      geo.dispose();
      mat.dispose();
      lines.geometry.dispose();
      (lines.material as THREE.Material).dispose();
      mansionLines.geometry.dispose();
      (mansionLines.material as THREE.Material).dispose();
      const sun = refs.current.sun;
      if (sun) {
        sun.geometry.dispose();
        (sun.material as THREE.Material).dispose();
        sun.children.forEach((c) => {
          const m = c as THREE.Mesh;
          m.geometry?.dispose?.();
          (m.material as THREE.Material)?.dispose?.();
        });
      }
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [sky, starToAsterism]);

  // 显示开关
  useEffect(() => {
    const r = refs.current;
    if (r.stars) r.stars.visible = showStars;
    if (r.lines) r.lines.visible = showLines;
    if (r.mansionLines) r.mansionLines.visible = showMansion;
    if (r.skyGroup) {
      r.skyGroup.children.forEach((c) => {
        // 太阳标记不随「浑仪环系」一并隐藏
        if (c instanceof THREE.Mesh && c !== r.sun) c.visible = showRings;
      });
    }
    if (r.fixedGroup) r.fixedGroup.visible = showRings;
  }, [showStars, showLines, showMansion, showRings]);

  // 天轴姿态
  useEffect(() => {
    if (refs.current.skyGroup) {
      refs.current.skyGroup.rotation.x = axisUp
        ? 0
        : -((90 - LATITUDE) * Math.PI) / 180;
    }
  }, [axisUp]);

  /**
   * 周日运动：天球绕极轴自转。
   * 极轴 = 天球组局部 +Y；令 rotation.y = −(90° + LAST)，
   * 则此刻 α = LAST 的天体恰落在子午环（YZ 平面）内侧的上中天位置。
   */
  useEffect(() => {
    const r = refs.current;
    if (r.skyGroup) {
      r.skyGroup.rotation.y = sync
        ? -((90 + last) * Math.PI) / 180
        : 0;
    }
    if (r.sun) {
      r.sun.visible = sync;
      const [x, y, z] = raDecToVec3(sun.ra, sun.dec, CELESTIAL_R * 0.985);
      r.sun.position.set(x, y, z);
    }
  }, [sync, last, sun]);

  // 分组高亮
  useEffect(() => {
    const { hiAttr } = refs.current;
    if (!hiAttr) return;
    const arr = hiAttr.array as Float32Array;
    arr.fill(0);
    if (activeGroup) {
      for (const a of sky.asterisms) {
        if (groupKey(a) === activeGroup) {
          for (const i of a.stars) arr[i] = 1;
        }
      }
    }
    hiAttr.needsUpdate = true;
  }, [activeGroup, sky]);

  const fmtRa = (deg: number) => {
    const h = deg / 15;
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60);
    const ss = (((h - hh) * 60 - mm) * 60).toFixed(1);
    return `${hh}h ${mm}m ${ss}s`;
  };
  const fmtDec = (deg: number) =>
    `${deg >= 0 ? "+" : "−"}${Math.abs(deg).toFixed(3)}°`;

  return (
    <>
      <div ref={containerRef} className="armillary-root" />

      {/* 控制台 */}
      <Dock title="浑天仪 · 图层">
        <DockSection>天球图层</DockSection>
        <Toggle
          checked={showStars}
          onChange={setShowStars}
          label="星点"
          meta={String(sky.stars.length)}
        />
        <Toggle
          checked={showLines}
          onChange={setShowLines}
          label="星官连线"
          meta={String(sky.asterisms.length)}
        />
        <Toggle
          checked={showMansion}
          onChange={setShowMansion}
          label="二十八宿分界"
        />
        <Toggle checked={showRings} onChange={setShowRings} label="浑仪环系" />
        <Toggle checked={axisUp} onChange={setAxisUp} label="天轴摆正" />
        <div className="hint">摆正后天轴垂直于视图，呈赤道视角</div>

        <SkyClockPanel
          sync={sync}
          onSync={setSync}
          live={live}
          onLive={setLive}
          clockMs={clockMs}
          setClockMs={setClockMs}
          last={last}
          sun={sun}
          hint={
            sync
              ? "天球此刻按开封恒星时自转，上中天天体位于子午环内；标记的太阳位置同步移动"
              : "开启后天球按真实恒星时自转，可校正到任意时刻"
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

      {/* 悬停提示 */}
      {hovered && (
        <div
          className="tooltip"
          style={{ left: hovered.x + 14, top: hovered.y + 14 }}
        >
          {hovered.star.zh || "无名星"}
          <span>
            {starToAsterism.get(sky.stars.indexOf(hovered.star))?.zh ||
              "—"}{" "}
            · {hovered.star.mag.toFixed(2)} 等
          </span>
        </div>
      )}

      {/* 详情面板 */}
      {selected && (
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
          <h2>{selected.star.zh || "无名星"}</h2>
          <div className="sub">
            {selected.star.hip
              ? `HIP ${selected.star.hip}`
              : `Gaia DR3 ${selected.star.gaia ?? "—"}`}
            {selected.star.en ? ` · ${selected.star.en}` : ""}
          </div>

          <div className="tags">
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
            <dd>{fmtRa(selected.star.ra)}</dd>
            <dt>赤纬 δ</dt>
            <dd>{fmtDec(selected.star.dec)}</dd>
            <dt>去极度</dt>
            <dd>{selected.star.quji.toFixed(3)}°</dd>
            <dt>视星等</dt>
            <dd>{selected.star.mag.toFixed(2)}</dd>
          </dl>
        </div>
      )}
    </>
  );
}
