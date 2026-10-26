<div align="right">
  <a href="README.md">English</a> &nbsp;·&nbsp; <b>简体中文</b>
</div>

# 浑天仪 · Huntianyi

**以真实星表重建的中国星空 —— 浑天仪、三垣二十八宿。每一颗星都在实测位置上，不是画出来的示意图。**

全部星位都按岁差归算到**北宋 1052 年**——苏颂在开封造水运仪象台的年代。同一套坐标内核驱动两套视图：三维浑天仪，以及苏州石刻天文图形制的平面盖天图。

![浑天仪：银河与日月五星](docs/images/armillary.jpg)

<p align="center"><em>浑天仪 —— 历元 1052 年、纬度 34.8°N，银河与日月五星可见</em></p>

## 特性

| | |
| --- | --- |
| **两套协同视图** | 三维浑天仪带六合仪环系（子午 / 地平 / 赤道 / 黄道 / 白道 / 四游）；二维盖天图双盘可独立旋转 |
| **真实岁差** | IAU 1976 三转角岁差，可切换**北宋 1052** / **J2000** / **当代**三档历元 |
| **真实星表** | 1386 颗星、312 星官、28 宿，每颗星都有传统中文星名 |
| **银河** | 由真实银道面（银心与银河北极锚点）生成，不是装饰色带 |
| **日月五星** | 行星用 JPL/Standish 根数，月球用 Meeus 简化式；位置随历元年对齐，看到的是宋朝某一夜的天空 |
| **观测地纬度** | 七座古都预设（开封 / 长安 / 洛阳 / 北京 / 南京 / 杭州 / 广州），也可用滑杆任取 |
| **恒星时驱动** | 天球按真实地方恒星时自转，可拨到任意时刻；拖动星图即拨动时钟 |
| **分享与导出** | 历元与纬度写入地址栏；两套视图均可导出 PNG |

<p align="center">
  <img src="docs/images/planisphere.jpg" alt="盖天图，北纬 39.9 度" width="49%">
  <img src="docs/images/armillary.jpg" alt="浑天仪" width="49%">
</p>

## 快速开始

```bash
git clone https://github.com/skywalkerqqq/huntianyi.git
cd huntianyi
npm install
npm run dev       # http://localhost:8771
```

```bash
npm run build      # 生产构建（完全静态预渲染）
npm start          # 启动构建产物
npm run typecheck  # tsc --noEmit
npm run test:astro # 天文算法断言（恒星时、太阳位置、岁差）
```

需要 Node.js 20 以上。

## 为什么这些数字重要

这是「星图」和「复原件」的分界线。

### 岁差

星表存的是 J2000——这是数据的唯一真值。而北宋比它早约 950 年，这个距离上的岁差不是可忽略量。按 IAU 1976 全量回推：

| 星 | J2000 | 1052 年 | 位移 |
| --- | --- | --- | --- |
| 勾陈一（今北极星） | 距极 0.736° | **5.916°** | 5.38° |
| 角宿一 | 101.161° | 96.065° | 13.21° |
| 心宿二 | 116.432° | 113.807° | 13.18° |
| 全部 1386 星 | — | — | **平均 10.70°，最大 13.22°** |

于是 1052 年的北极星离极近六度——宋人「北极星离极三度有余」的记载才讲得通。恒显圈也跟着走：在开封，**147** 颗星落在圈内，而用未改正的 J2000 星位会错算成 159 颗。

### 行星的参考系

Standish 根数给的是**J2000 固定参考系**下的日心位置，而经典 `sunRaDec()` 公式给的是相对当日春分点的黄经。自检办法是用地球根数反推太阳黄经再对比：J2000 时 Δ = 0.005°，1950 年却是 0.699°——而 50 年 × 50.29″/年 = 0.698°。**偏差恰好等于岁差**。系数是对的，只是参考系必须转一次。

所以行星和星表走同一次岁差；再由 `shiftToYear()` 把时钟的「月-日」搬进历元年份——你看到的确实就是 1052 年某一夜的金木水火土。

### 恒星时

盖图上 `rotation = 270° − LAST`，浑天仪上 `rotation.y = −(90° + LAST)`，两者得到同一片天空。一个时钟小时让星空转过 15.041° 而不是 15°——恒星日是 86164.0905 秒，不是 86400 秒。

## 数据

| 来源 | 提供什么 |
| --- | --- |
| [Stellarium](https://github.com/Stellarium/stellarium) 中国星空文化 | 312 星官、连线拓扑、28 宿距星（HIP）、中文星名 |
| [`star-catalog-lite`](https://www.npmjs.com/package/star-catalog-lite) | TSC1 亮星星表（Gaia DR3 / Hipparcos / BSC5），匹配到 1386 颗 |

`src/data/chineseSky.json` 由脚本生成，不手改：

```bash
npm run data:sky   # scripts/export_sky.mjs
```

坐标校验：5 颗亮星与星表比对 Δ < 0.003°。

## 目录结构

```
src/
  app/           路由：/（浑天仪）、/flat（盖天图）
  components/    Armillary.tsx、SkyMap.tsx、TimeSync.tsx、Shell.tsx、ui.tsx
  lib/           astro.ts（恒星时、岁差）、epoch.ts、planets.ts、
                 milkyway.ts、export.ts、sky.ts
  data/          chineseSky.json —— 生成的星表
scripts/
  export_sky.mjs 数据管线：原始源 → chineseSky.json
  data/          原始 Stellarium 数据
  test_astro.mjs 天文算法断言
  verify*.cjs    端到端回归（Playwright）
docs/            设计笔记与截图
```

更详细的对标分析与技术决策记录见 [docs/design-notes.zh-CN.md](docs/design-notes.zh-CN.md)。

## 已知局限

- **没有石氏/甘氏/巫咸三家星配色**（朱、墨、黄）。权威数据源——国家虚拟天文台带 `属氏` 字段的「星官总表」——已下线：该端点上所有文件均 404，且无存档。Stellarium 新增的 `chinese_chenzhuo`（陈卓三家星官图）其 id 只编码分区（P/S/H/数字），不含三家。要做得从《晋书·天文志》《开元占经》手工整理，宁可暂缺，不编造。
- **盖图性能**。1386 星、420 条连线、银河路径与日月五星都在 SVG 里，页面切换约 0.7–1.0 秒。下一步是把星点层迁到 Canvas。
- **精度**。行星约 10′、月球约 0.3°——用于标位足够，不足以做日月食时刻或掩星计算。

## 许可

代码为 **MIT © skywalkerqqq**，见 [LICENSE](LICENSE)。

`scripts/data/` 下的天文文化数据与衍生的 `src/data/chineseSky.json` 来自 Stellarium 项目，遵循其上游许可，**不**包含在上面这份 MIT 许可内。逐项说明见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
