"use client";

import { useId, useEffect, useState, type ReactNode } from "react";

/* ==========================================================================
   Dock — 控制台。桌面為左側浮層，行動端為底部抽屜，可折疊。
   行動端預設收起（掛載後檢測，避免 SSR hydration 分歧）
   ========================================================================== */
export function Dock({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 780px)");
    if (mq.matches) setOpen(false);
    const onChange = (e: MediaQueryListEvent) => setOpen(!e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return (
    <aside className={open ? "dock is-open" : "dock"}>
      <div
        className="dock-head"
        onClick={() => setOpen((v) => !v)}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        <h2>{title}</h2>
        <span className="chev" aria-hidden>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path
              d="M2.5 4.2 5.5 7l3-2.8"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
      <div className="dock-body">
        <div className="dock-inner">{children}</div>
      </div>
    </aside>
  );
}

export function DockSection({ children }: { children: ReactNode }) {
  return <div className="dock-sec">{children}</div>;
}

/* ==========================================================================
   Toggle — 定制開關
   ========================================================================== */
export function Toggle({
  checked,
  onChange,
  label,
  meta,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  meta?: string;
}) {
  const id = useId();
  return (
    <label className="toggle" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle-track" aria-hidden />
      <span className="toggle-text">
        {label}
        {meta ? <em> {meta}</em> : null}
      </span>
    </label>
  );
}

/* ==========================================================================
   Slider
   ========================================================================== */
export function Slider({
  label,
  value,
  display,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div className="slider">
      <div className="slider-top">
        <label htmlFor={id}>{label}</label>
        <b>{display}</b>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/* ==========================================================================
   Chip
   ========================================================================== */
export function Chip({
  active = false,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      className={active ? "chip is-on" : "chip"}
      onClick={onClick}
      title={title}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
