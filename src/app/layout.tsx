import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "渾天 · 三垣二十八宿 — 中国古代星图交互仪",
  description:
    "以真实 J2000 星表重建中国古代星空坐标系：3D 浑天仪与 2D 盖天图双视图，1386 颗星、312 星官、二十八宿。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <div className="grain" aria-hidden />
      </body>
    </html>
  );
}
