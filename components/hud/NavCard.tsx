"use client";

import { Freshness, CheckButtons } from "@/components/ReportChecks";
import type { Route } from "@/lib/geo/route";
import type { Report } from "@/lib/types";
import { formatDistance } from "./CompassStrip";

export default function NavCard({
  route,
  barriers,
  stepIndex,
  remainingM,
  walking,
  arrived,
  onStart,
  onStop,
  onClear,
  onOpenReport,
  onChecked,
}: {
  route: Route;
  /** Open issues reported at the destination. */
  barriers: Report[];
  stepIndex: number;
  remainingM: number;
  walking: boolean;
  arrived: boolean;
  onStart: () => void;
  onStop: () => void;
  onClear: () => void;
  onOpenReport: (id: string) => void;
  onChecked: (stillThere: boolean) => void;
}) {
  const { destination: d } = route;
  const step = route.steps[Math.min(stepIndex, route.steps.length - 1)];
  const next = route.steps[stepIndex + 1];
  const entrance = d.entrance;
  const alternative = entrance && (barriers.length > 0 || route.avoided.length > 0);
  const etaMin = Math.max(1, Math.round((remainingM / route.distanceM) * route.etaMin));

  return (
    <div className="hud-panel mx-auto w-full max-w-md rounded-2xl p-3" role="region" aria-label={`Directions to ${d.label}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-400/60 bg-cyan-400/10 text-2xl" aria-hidden>
          {d.kind === "amenity" ? "💧" : "🏁"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[11px] uppercase tracking-wider text-cyan-300">
            {arrived ? "Arrived" : `${formatDistance(remainingM)} · ${etaMin} min`}
            {route.stepFree && <span className="ml-1.5 text-emerald-300">· step-free</span>}
          </div>
          <div className="truncate text-sm font-semibold text-white">{d.label}</div>
          {d.kind === "amenity" && <div className="truncate text-[11px] text-slate-400">{d.buildingShort}</div>}
        </div>
        <button onClick={onClear} className="text-slate-400" aria-label="Clear route">
          ✕
        </button>
      </div>

      <div className="mt-2 rounded-xl bg-slate-950/60 px-3 py-2" aria-live="polite">
        <div className="text-sm font-semibold text-white">{step.text}</div>
        {next && !arrived && <div className="mt-0.5 text-[11px] text-slate-400">Then: {next.text}</div>}
      </div>

      {route.skipped.length > 0 && (
        <p className="mt-2 text-[11px] text-amber-200">
          Skipped {route.skipped.map((a) => a.label).join(", ")}: reported broken.
        </p>
      )}
      {route.avoided.length > 0 && (
        <p className="mt-1.5 text-[11px] text-slate-300">
          <span className="text-emerald-300">Avoiding:</span> {route.avoided.map((o) => o.alert.label ?? o.report.title).join(", ")}
        </p>
      )}
      {route.passes.length > 0 && (
        <p className="mt-1 text-[11px] text-slate-300">
          <span className="text-amber-300">Caution on route:</span> {route.passes.map((o) => o.alert.label ?? o.report.title).join(", ")}
        </p>
      )}

      {barriers.length > 0 && (
        <div className="mt-2 border-t border-slate-700/60 pt-2">
          <div className="font-mono text-[10px] uppercase tracking-widest text-rose-300">Reported barriers at destination</div>
          <ul className="mt-1 space-y-1.5">
            {barriers.slice(0, 3).map((r) => (
              <li key={r.id}>
                <button onClick={() => onOpenReport(r.id)} className="text-left text-xs font-semibold text-white underline decoration-slate-500 underline-offset-2">
                  {r.title}
                </button>
                <Freshness report={r} />
                <div className="mt-1">
                  <CheckButtons reportId={r.id} compact onChecked={onChecked} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {entrance && (
        <div className="mt-2 border-t border-slate-700/60 pt-2 text-xs">
          <div className="font-mono text-[10px] uppercase tracking-widest text-emerald-300">
            {alternative ? (entrance.verifiedMinAgo !== null ? "Verified alternative entrance" : "Alternative entrance") : "Entrance"}
          </div>
          <div className="mt-0.5 text-white">
            {entrance.label}
            {entrance.stepFree && <span className="text-emerald-300"> · step-free</span>}
          </div>
          <div className="font-mono text-[10px] text-slate-400">
            {entrance.verifiedMinAgo !== null
              ? `Checked by campus staff ${entrance.verifiedMinAgo < 60 ? `${entrance.verifiedMinAgo} min` : `${Math.round(entrance.verifiedMinAgo / 60)} h`} ago (demo data)`
              : entrance.source === "osm"
                ? "From OpenStreetMap, not verified"
                : "Not verified yet"}
          </div>
        </div>
      )}

      <div className="mt-2.5 flex gap-2">
        {walking ? (
          <button onClick={onStop} className="flex-1 rounded-lg border border-slate-500/60 px-3 py-2 text-xs font-semibold text-white">
            ⏹ Stop
          </button>
        ) : (
          <button onClick={onStart} className="flex-1 rounded-lg bg-cyan-400 px-3 py-2 text-xs font-semibold text-slate-950">
            🚶 {arrived ? "Walk again" : "Start walk"}
          </button>
        )}
        <button onClick={onClear} className="rounded-lg border border-slate-500/60 px-3 py-2 text-xs text-slate-200">
          Clear
        </button>
      </div>
    </div>
  );
}
