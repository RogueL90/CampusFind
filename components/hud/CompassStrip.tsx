"use client";

import { normalizeAngle } from "@/lib/geo/obstacles";

export interface CompassItem {
  id: string;
  bearing: number;
  distance: number;
  icon: string;
  color: string;
  label: string;
}

const CARDINALS: Record<number, string> = { 0: "N", 45: "NE", 90: "E", 135: "SE", 180: "S", 225: "SW", 270: "W", 315: "NW" };
const HALF_FOV = 90;

const toPercent = (rel: number) => 50 + (rel / HALF_FOV) * 50;

export function formatDistance(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

export default function CompassStrip({
  heading,
  items,
  onItemClick,
}: {
  heading: number;
  items: CompassItem[];
  onItemClick: (id: string) => void;
}) {
  const ticks = [];
  for (let deg = 0; deg < 360; deg += 15) {
    const rel = normalizeAngle(deg - heading);
    if (Math.abs(rel) > HALF_FOV) continue;
    const label = CARDINALS[deg];
    ticks.push(
      <div key={deg} className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: `${toPercent(rel)}%` }}>
        <div className={`w-px ${label ? "h-2.5 bg-cyan-300/80" : "h-1.5 bg-cyan-300/35"}`} />
        {label && <span className={`font-mono text-[10px] ${deg === 0 ? "text-rose-400" : "text-cyan-200/80"}`}>{label}</span>}
      </div>,
    );
  }

  const visible: (CompassItem & { rel: number })[] = [];
  for (const it of [...items].sort((a, b) => a.distance - b.distance)) {
    const rel = normalizeAngle(it.bearing - heading);
    if (Math.abs(rel) > HALF_FOV) continue;
    if (visible.some((v) => Math.abs(v.rel - rel) < 14)) continue;
    visible.push({ ...it, rel });
  }

  return (
    <div className="hud-panel relative h-14 w-full overflow-hidden rounded-xl" role="group" aria-label={`Compass, heading ${Math.round((heading + 360) % 360)} degrees`}>
      <div className="absolute inset-x-0 top-1 h-6">{ticks}</div>
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-cyan-300/60" />
      <div className="absolute left-1/2 top-0 -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent border-t-cyan-300" />
      {visible.map((it) => (
        <button
          key={it.id}
          onClick={() => onItemClick(it.id)}
          className="absolute bottom-0.5 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-md px-1 py-0.5 font-mono text-[10px] leading-none"
          style={{ left: `${toPercent(it.rel)}%`, color: it.color, background: "rgba(5,8,15,0.75)", border: `1px solid ${it.color}55` }}
          aria-label={`${it.label}, ${formatDistance(it.distance)} ahead`}
        >
          <span className="text-xs">{it.icon}</span>
          {formatDistance(it.distance)}
        </button>
      ))}
    </div>
  );
}
