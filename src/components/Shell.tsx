"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export type ViewKey = "sphere" | "flat";

const VIEWS: { key: ViewKey; href: string; zh: string; en: string }[] = [
  { key: "sphere", href: "/", zh: "浑天仪", en: "armillary" },
  { key: "flat", href: "/flat", zh: "盖天图", en: "planisphere" },
];

/**
 * 全站外殼：品牌 + 視圖切換器（滑動指示器）+ 數據狀態 + 底部腳註。
 * 視圖切換用真實路由（Link），指示器位置由當前 pathname 決定。
 */
export default function Shell({
  stats,
  foot,
}: {
  stats: { value: string | number; label: string }[];
  foot: { label: string; value: string }[];
}) {
  const pathname = usePathname();
  const routeIdx = Math.max(
    0,
    VIEWS.findIndex((v) => v.href === pathname)
  );
  // 乐观指示：点击即滑动，不等路由真正切换完成
  const [pending, setPending] = useState<number | null>(null);
  useEffect(() => setPending(null), [pathname]);
  const idx = pending ?? routeIdx;

  return (
    <>
      <header className="shell">
        <span
          className={pending != null ? "navprog is-on" : "navprog"}
          aria-hidden
        />
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            渾
          </div>
          <div className="brand-text">
            <b>三垣二十八宿</b>
            <span>ANCIENT CHINESE STAR ATLAS · J2000</span>
          </div>
        </div>

        <nav className="switch" aria-label="视图切换">
          <span
            className="switch-ind"
            style={{ transform: `translateX(${idx * 100}%)` }}
            aria-hidden
          />
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={v.href}
              prefetch
              onClick={() => setPending(VIEWS.indexOf(v))}
              className={
                "switch-item" +
                (v.href === pathname ? " is-on" : "") +
                (pending === VIEWS.indexOf(v) ? " is-pending" : "")
              }
              aria-current={v.href === pathname ? "page" : undefined}
            >
              {v.zh}
              <span className="en">{v.en}</span>
            </Link>
          ))}
        </nav>

        <div className="status">
          {stats.map((s, i) => (
            <div key={s.label} style={{ display: "flex", gap: 18 }}>
              {i > 0 ? <div className="status-sep" /> : null}
              <div className={i > 1 ? "stat opt" : "stat"}>
                <b>{s.value}</b>
                <span>{s.label}</span>
              </div>
            </div>
          ))}
        </div>
      </header>

      <div className="footbar">
        {foot.map((f, i) => (
          <span key={f.label} style={{ display: "flex", gap: 14, alignItems: "center" }}>
            {i > 0 ? <i className="dot" /> : null}
            <span>
              <b>{f.label}</b> {f.value}
            </span>
          </span>
        ))}
      </div>
    </>
  );
}
