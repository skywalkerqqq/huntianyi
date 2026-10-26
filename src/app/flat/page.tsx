import Shell from "@/components/Shell";
import SkyMap from "@/components/SkyMap";
import sky from "@/data/chineseSky.json";
import { LATITUDE_KAIFENG, type ChineseSky } from "@/lib/sky";

export default function FlatPage() {
  const data = sky as ChineseSky;
  return (
    <main className="page">
      <Shell
        stats={[
          { value: data.stars.length, label: "星 STARS" },
          { value: data.asterisms.length, label: "星官 ASTERISMS" },
          { value: data.mansions.length, label: "宿 MANSIONS" },
        ]}
        foot={[
          { label: "投影", value: "北极居中 · 去极度定半径（盖天式）" },
          { label: "内规", value: `恒显圈 开封 ${LATITUDE_KAIFENG}°N` },
          { label: "外规", value: "恒隐圈界 · 南天极在边缘" },
          { label: "范式", value: "苏州石刻天文图 · 淳祐七年" },
        ]}
      />
      <SkyMap sky={data} />
    </main>
  );
}
