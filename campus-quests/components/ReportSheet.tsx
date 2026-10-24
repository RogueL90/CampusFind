"use client";

import { useState } from "react";
import { claimMission, voteMeToo } from "@/lib/data";
import { CATEGORY_BY_ID } from "@/lib/geo/campus";
import type { Report } from "@/lib/types";

export default function ReportSheet({ report, onClose }: { report: Report; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cat = CATEGORY_BY_ID[report.category];

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 p-3" role="dialog" aria-label={report.title}>
      <div className="hud-panel mx-auto max-w-md rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <span className="rounded-lg px-2 py-1 text-xs" style={{ background: `${cat.color}22`, color: cat.color }}>
            {cat.icon} {cat.label}
          </span>
          <button onClick={onClose} className="ml-auto text-slate-400" aria-label="Close">
            ✕
          </button>
        </div>
        <h2 className="mt-2 text-base font-semibold text-white">{report.title}</h2>
        {report.description && <p className="mt-1 text-xs text-slate-300">{report.description}</p>}
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-slate-400">
          <span>Status: {report.status.replace(/_/g, " ")}</span>
          {report.routed_to && <span>Sent to {report.routed_to}</span>}
          <span>{report.votes} × me too</span>
        </div>
        {report.mission && (
          <div className="mt-3 rounded-xl border border-cyan-400/30 bg-cyan-400/5 p-3 text-xs text-cyan-100">
            <div className="font-semibold">
              Mission · +{report.mission.points} pts
            </div>
            <div className="text-slate-300">Proof: {report.mission.proof_required}</div>
          </div>
        )}
        {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
        <div className="mt-3 flex gap-2">
          <button disabled={busy} onClick={() => run(() => voteMeToo(report.id))} className="rounded-lg border border-slate-500/60 px-3 py-2 text-xs text-white">
            Me too
          </button>
          {report.mission?.status === "open" && (
            <button
              disabled={busy}
              onClick={() => run(() => claimMission(report.mission!.id))}
              className="flex-1 rounded-lg bg-cyan-400 px-3 py-2 text-xs font-semibold text-slate-950"
            >
              Claim mission
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
