import Armillary from "@/components/Armillary";
import Shell from "@/components/Shell";
import sky from "@/data/chineseSky.json";
import { LATITUDE_KAIFENG, type ChineseSky } from "@/lib/sky";

export default function Page() {
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
          { label: "环系", value: "子午 · 地平 · 赤道 · 黄道 · 白道 · 四游" },
          { label: "姿态", value: `开封 ${LATITUDE_KAIFENG}°N 水运仪象台` },
          { label: "星表", value: "Gaia DR3 · Hipparcos · BSC5" },
          { label: "星官", value: "Stellarium Chinese Sky Culture" },
        ]}
      />
      <Armillary sky={data} />
    </main>
  );
}
