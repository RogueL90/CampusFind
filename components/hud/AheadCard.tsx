"use client";

import type { CSSProperties } from "react";
import { CheckButtons, Freshness } from "@/components/ReportChecks";
import { ACCESS_NEEDS } from "@/lib/geo/campus";
import type { ObstacleReading } from "@/lib/geo/obstacles";
import { formatDistance } from "./CompassStrip";

export default function AheadCard({
  ahead,
  nearest,
  alerting,
  onShowDetour,
  onDismiss,
  onChecked,
}: {
  ahead: ObstacleReading | null;
  nearest: ObstacleReading | null;
  alerting: boolean;
  onShowDetour: (id: string) => void;
  onDismiss: (id: string) => void;
  onChecked: (stillThere: boolean) => void;
}) {
  if (!ahead) {
    return (
      <div className="hud-panel mx-auto flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs text-emerald-200">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        Path clear
        {nearest && <span className="font-mono text-slate-400">· nearest obstacle {formatDistance(nearest.distance)}</span>}
      </div>
    );
  }

  const { obstacle, distance } = ahead;
  const blocks = obstacle.alert.impact === "blocks";
  const affects = ACCESS_NEEDS.filter((n) => obstacle.alert.affects.includes(n.id)).map((n) => n.short);

  return (
    <div
      className={`hud-panel ahead-card mx-auto w-full max-w-md rounded-2xl p-3 ${alerting ? "ahead-card-alert" : ""}`}
      style={{ "--tag-color": obstacle.color } as CSSProperties}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl" style={{ background: `${obstacle.color}22`, border: `1px solid ${obstacle.color}88` }}>
          {blocks ? "⛔" : "⚠️"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider" style={{ color: obstacle.color }}>
            Ahead · <span className="text-base font-semibold">{formatDistance(distance)}</span>
          </div>
          <div className="text-sm font-semibold leading-snug text-white">{obstacle.report.title}</div>
          <div className="mt-0.5 text-[11px] text-slate-300">
            {blocks ? "Blocks the route" : "Use caution"} for {affects.join(", ")}
          </div>
          <Freshness report={obstacle.report} className="mt-0.5" />
        </div>
      </div>
      {obstacle.alert.detour_text && (
        <p className="mt-2 text-xs leading-relaxed text-cyan-100">
          <span className="font-semibold text-cyan-300">Detour: </span>
          {obstacle.alert.detour_text}
        </p>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {obstacle.alert.detour_path && (
          <button onClick={() => onShowDetour(obstacle.report.id)} className="rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950">
            Show detour
          </button>
        )}
        <CheckButtons key={obstacle.report.id} reportId={obstacle.report.id} compact onChecked={onChecked} />
        <button onClick={() => onDismiss(obstacle.report.id)} className="ml-auto text-[11px] text-slate-400 underline" aria-label="Dismiss alert">
          Dismiss
        </button>
      </div>
    </div>
  );
}
