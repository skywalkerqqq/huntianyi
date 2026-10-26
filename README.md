# 浑天仪 · 三垣二十八宿

以**真实古代星官体系**重建的交互式星图。两套视图共享同一套坐标与授时内核：

| 视图 | 路由 | 形制 | 渲染 |
| --- | --- | --- | --- |
| 浑天仪 | `/` | 三维天球 + 六合仪环系（子午 / 地平 / 赤道 / 黄道 / 白道 / 四游） | Three.js + 自定义粒子着色器 |
| 盖天图 | `/flat` | 平面极坐标星图，双圈可旋转（内规恒显圈 / 外规恒隐界），苏州石刻天文图形制 | React + SVG |

观测地取**北宋开封（34.8°N, 114.307°E）**——苏颂水运仪象台所在，天轴倾角与内规半径均由此纬度决定。

---

## 数据链（全部真实，可复现）

星位与星官均不来自手工录入，由 `scripts/export_sky.mjs` 从公开权威源合成：

| 数据 | 来源 | 用途 |
| --- | --- | --- |
| 星官与连线 | Stellarium `skycultures/chinese/index.json` | 312 星官、连线拓扑、二十八宿距星（HIP 编号） |
| 恒星位置 | npm `star-catalog-lite`（TSC1 亮星星表，基于 Gaia DR3 / Hipparcos / BSC5） | 1386 颗星的赤经赤纬与视星等 |
| 中文星名与分区 | Stellarium `star_names.zh_CN.fab` | 100% 中文星名；`###紫微垣` 等分区标注作为三垣归属依据 |

产出 `src/data/chineseSky.json`（244 KB）。重新生成：

```bash
npm run data:sky     # = node scripts/export_sky.mjs
```

坐标校验：5 颗亮星与星表比对 Δ < 0.003°。

## 天文内核

`src/lib/astro.ts` 为纯函数，系数取自 IAU 1982 恒星时决议与 Meeus《Astronomical Algorithms》：

- `gmstDeg()` — 格林尼治平恒星时（Meeus 12.4），J2000 基准校验通过
- `sunRaDec()` — 太阳视位置低精度算法，误差 < 0.01°
- `rotationFromLast()` — **平面盖图与三维浑天仪共用同一旋转角 `rotation = 270° − LAST`**（已交叉验算：±1 小时 = −15.041°，按恒星日 86164.0905 s 而非太阳日）

星空自转按真实恒星时驱动，可任意时刻校正（`TimeSync.tsx`）；盖图在同步开启时额外绘制地平线遮罩（`cot p = −cot φ · cos(ψ − 270°)`）、子午线、天顶与太阳实时位置，拖动星图即拨动时刻。

## 目录

```
src/
  app/
    page.tsx            浑天仪视图
    flat/page.tsx       盖天图视图
    globals.css         设计系统（色板 / 动效令牌 / 响应式）
  components/
    Armillary.tsx       三维天球、环系、粒子着色器、拾取
    SkyMap.tsx          平面星图：投影、双圈旋转、缩放平移
    TimeSync.tsx        恒星时时钟 hook 与校时面板
    Shell.tsx           导航骨架
    ui.tsx              Dock / Toggle / Slider / Chip
  lib/
    astro.ts            恒星时与太阳视位置
    sky.ts              坐标变换、配色、星等映射
  data/
    chineseSky.json     合成的星表（由脚本生成，勿手改）
scripts/
  export_sky.mjs        数据管线：原始源 → chineseSky.json
  data/                 原始数据与抓取脚本
  test_astro.mjs        天文算法单测（对照 Meeus 例 12.a 与二分二至）
  verify*.cjs           端到端回归（Playwright，截图写入 _archive/screenshots）
_archive/               调试截图与一次性探测脚本（不入版本库）
```

## 开发

```bash
npm install
npm run dev        # http://localhost:8771
npm run build      # 生产构建
npm run typecheck  # tsc --noEmit
npm run test:astro # 天文算法校验
```

> 依赖装不上的话：`.npmrc` 已固化 `registry=npmmirror.com`（直连 npmjs 在此网络环境会 CONNECT 502）。
> 需要把构建产物隔离到独立目录时，用 `NEXT_DIST_DIR=build-xxx npm run build`。

## 已知局限

1. **未做岁差改正**。星位为 J2000 历元，而界面语境是北宋（约 1052 年）——两者相差约 950 年，岁差约 13°。对「复原古人所见星空」这一目标而言这是实质性偏差，是下一步最高优先级的修复项。
2. **二十八宿天区为近似划分**。当前按星官平均赤经归入宿，正统做法是以距星（determinative star）定宿界，把天球切成从北天极到南天极的 28 个楔形区（Stellarium `lunar_system` 即如此）。
3. **盖图 SVG 层为全量 DOM**（1386 星 + 420 连线），已用事件委托 + `memo` 缓解，但星数再上量需迁到 Canvas / WebGL。
4. 无银河、无行星与月亮（环系画了白道但无月体）。
