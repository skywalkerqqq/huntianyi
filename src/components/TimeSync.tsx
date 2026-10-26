"use client";

import { useEffect, useMemo } from "react";
import {
  SITE,
  degToHms,
  fromLocalInput,
  lstDeg,
  rotationFromLast,
  sunRaDec,
  toLocalInput,
} from "@/lib/astro";
import { Chip, DockSection, Toggle } from "@/components/ui";

/* ==========================================================================
   星空时钟 —— 由真实恒星时驱动星图/浑仪的周日运动
   ========================================================================== */

export function useSkyClock(
  sync: boolean,
  live: boolean,
  clockMs: number,
  setClockMs: (v: number) => void
) {
  // 挂载后取真实时刻（初始 0 避免 SSR 与客户端不一致）
  useEffect(() => {
    setClockMs(Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sync || !live) return;
    setClockMs(Date.now());
    const id = window.setInterval(() => setClockMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [sync, live, setClockMs]);

  return useMemo(
    () => ({ last: lstDeg(clockMs), rotation: rotationFromLast(lstDeg(clockMs)), sun: sunRaDec(clockMs) }),
    [clockMs]
  );
}

/* -------------------------------------------------------------------------- */

export function SkyClockPanel({
  sync,
  onSync,
  live,
  onLive,
  clockMs,
  setClockMs,
  last,
  sun,
  hint,
}: {
  sync: boolean;
  onSync: (v: boolean) => void;
  live: boolean;
  onLive: (v: boolean) => void;
  clockMs: number;
  setClockMs: (v: number) => void;
  last: number;
  sun: { ra: number; dec: number };
  hint: string;
}) {
  const setMs = (ms: number) => {
    onLive(false);
    setClockMs(ms);
  };

  return (
    <>
      <DockSection>天象同步</DockSection>
      <Toggle
        checked={sync}
        onChange={onSync}
        label="天象同步"
        meta={sync ? "由恒星时驱动" : "手动"}
      />

      {sync ? (
        <>
          <div className="hint">{hint}</div>
          <Toggle checked={live} onChange={onLive} label="跟随此刻" meta="实时" />
          <input
            className="dtinput"
            type="datetime-local"
            value={toLocalInput(clockMs)}
            onChange={(e) => {
              const ms = fromLocalInput(e.target.value);
              if (!Number.isNaN(ms)) setMs(ms);
            }}
            aria-label="校正观测时刻"
          />
          <div className="btnrow">
            <Chip onClick={() => setMs(clockMs - 86400000)}>−1日</Chip>
            <Chip onClick={() => setMs(clockMs - 3600000)}>−1时</Chip>
            <Chip onClick={() => setMs(Date.now())}>此刻</Chip>
            <Chip onClick={() => setMs(clockMs + 3600000)}>+1时</Chip>
            <Chip onClick={() => setMs(clockMs + 86400000)}>+1日</Chip>
          </div>

          <div className="readout">
            <div>
              <span>观测地</span>
              <b>
                {SITE.name} {SITE.lat}°N · {SITE.lon}°E
              </b>
            </div>
            <div>
              <span>地方恒星时</span>
              <b>{degToHms(last)}</b>
            </div>
            <div>
              <span>此刻上中天</span>
              <b>α {degToHms(last)}</b>
            </div>
            <div>
              <span>太阳赤经α</span>
              <b>{degToHms(sun.ra)}</b>
            </div>
            <div>
              <span>太阳赤纬δ</span>
              <b>
                {sun.dec >= 0 ? "+" : "−"}
                {Math.abs(sun.dec).toFixed(2)}°
              </b>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
