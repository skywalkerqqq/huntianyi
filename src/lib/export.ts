"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * 与地址栏查询参数双向同步的状态。
 *
 * 刻意不用 `useSearchParams()` —— 那会把整页转成动态渲染，丢掉静态预渲染。
 * 这里改成「首帧用默认值、挂载后读地址栏、变更时 replaceState」：
 * SSR 与首帧客户端渲染完全一致，不会出现 hydration 分歧。
 */
export function useUrlState(
  key: string,
  initial: string,
  isValid?: (raw: string) => boolean
): [string, (v: string) => void] {
  const [value, setValue] = useState(initial);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get(key);
    if (raw && (!isValid || isValid(raw))) setValue(raw);
  }, [key, isValid]);

  const set = useCallback(
    (v: string) => {
      setValue(v);
      if (typeof window === "undefined") return;
      const u = new URL(window.location.href);
      u.searchParams.set(key, v);
      window.history.replaceState(null, "", u.toString());
    },
    [key]
  );

  return [value, set];
}

/** 把一个 Blob 作为文件下载 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 把页面里的 SVG 元素导出为 PNG。
 * 用于把盖天图存成配图（论文/展板）——SVG 里的渐变、滤镜、文字一并保留。
 */
export async function exportSvgToPng(
  svg: SVGSVGElement,
  opts: {
    size?: number;
    background?: string;
    filename: string;
    fontFamily?: string;
    /** 强制使用某个 viewBox（默认沿用元素当前视野，缩放后导出会只剩局部） */
    viewBox?: string;
  }
) {
  const size = opts.size ?? 2000;
  const clone = svg.cloneNode(true) as SVGSVGElement;

  // 统一成本地可解析的 SVG：补 xmlns、固定尺寸、铺底色
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(size));
  clone.setAttribute("height", String(size));
  if (opts.fontFamily) clone.style.fontFamily = opts.fontFamily;
  if (opts.viewBox) clone.setAttribute("viewBox", opts.viewBox);

  const vb = (clone.getAttribute("viewBox") || "0 0 100 100").split(/\s+/);
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("x", vb[0]);
  bg.setAttribute("y", vb[1]);
  bg.setAttribute("width", vb[2]);
  bg.setAttribute("height", vb[3]);
  bg.setAttribute("fill", opts.background ?? "#05070d");
  clone.insertBefore(bg, clone.firstChild);

  // 未应用的 CSS 变量/外部样式在 canvas 里会失效，这里把关键色写死到根节点
  clone.style.background = opts.background ?? "#05070d";

  const svgText = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    img.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("SVG 转图片失败"));
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建 canvas 上下文");
    ctx.fillStyle = opts.background ?? "#05070d";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);

    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, "image/png")
    );
    if (!blob) throw new Error("PNG 编码失败");
    downloadBlob(blob, opts.filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}
