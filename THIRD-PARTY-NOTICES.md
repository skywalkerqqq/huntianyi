# Third-party notices

本项目代码以 [MIT](LICENSE) 授权。以下数据来自第三方，遵循各自的上游许可，**不**包含在 MIT 许可范围内。

---

## Stellarium 中国星空文化（Chinese sky culture）

| 文件 | 内容 |
| --- | --- |
| `scripts/data/stellarium_chinese.json` | 312 星官定义、连线拓扑（HIP / Gaia 编号）、二十八宿距星 |
| `scripts/data/star_names_zh.fab` | 中文星名与三垣四象分区标注 |
| `src/data/chineseSky.json` | 由上述两文件与星表合成的衍生数据 |

来源：<https://github.com/Stellarium/stellarium> — `skycultures/chinese/`

Stellarium 项目整体以 **GNU GPL v2** 发布；其星空文化（sky culture）内容另有 CC BY-SA 授权声明。上游未对本目录下的具体文件逐一标注独立许可，因此这里不做推定，请在使用或再分发上述文件前查阅 Stellarium 仓库的许可条款。

若你只需要本项目的代码逻辑而不需要这些数据，可删除上述文件并改用自己准备的星表；`scripts/export_sky.mjs` 中描述了所需的输入格式。

---

## 恒星位置数据

`src/data/chineseSky.json` 中的恒星坐标与视星等来自 [`star-catalog-lite`](https://www.npmjs.com/package/star-catalog-lite) 提供的 TSC1 亮星星表，原始观测数据源自 Gaia DR3、Hipparcos（ESA 1997）与 Bright Star Catalogue。这些星表由其各自机构发布，请遵循相应的科学数据使用惯例。

---

## 算法参考（非代码复制）

- **Jean Meeus**, *Astronomical Algorithms* (2nd ed.) — 恒星时（第 12 章）、岁差三转角（第 21 章）、月球位置简化式（第 47 章）
- **E. M. Standish**, *Keplerian Elements for Approximate Positions of the Major Planets*, JPL — 行星轨道根数（1800–2050 历元）
- **IAU 1982** 恒星时决议
