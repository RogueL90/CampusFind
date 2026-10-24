"use client";

import { useState } from "react";
import PageShell, { Empty, ErrorNote } from "@/components/PageShell";
import Photo from "@/components/Photo";
import StaffNotice from "@/components/StaffNotice";
import { getPendingProofs, overrideFixPath, reviewProof, subscribeReports } from "@/lib/data";
import { timeAgo } from "@/lib/status";
import type { FixPath, ProofForReview } from "@/lib/types";
import { useLive } from "@/lib/useLive";

const FIX_PATHS: { id: FixPath; label: string }[] = [
  { id: "staff", label: "Staff fix" },
  { id: "self_fixable", label: "Student can fix" },
  { id: "lost_found", label: "Lost & Found" },
];

export default function ModeratorPage() {
  const { data: proofs, error } = useLive(getPendingProofs, subscribeReports, []);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function act(id: string, fn: () => Promise<void>) {
    setBusy(id);
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageShell title="Proof review" back="/staff">
      <StaffNotice roles={["moderator"]} />
      <p className="mb-4 text-xs text-slate-400">
        Approving moves the helper&apos;s pending points to spendable. Rejecting reverses them and reopens the mission.
      </p>
      {(error || actionError) && <div className="mb-3"><ErrorNote>{error ?? actionError}</ErrorNote></div>}
      {proofs?.length === 0 && <Empty>No proofs waiting. Nice.</Empty>}
      <ul className="space-y-4">
        {proofs?.map((p) => (
          <ProofCard
            key={p.id}
            proof={p}
            busy={busy === p.id}
            onReview={(approve) => act(p.id, () => reviewProof(p.id, approve))}
            onFixPath={(to) => act(p.id, () => overrideFixPath(p.report_id, to, "moderator override"))}
          />
        ))}
      </ul>
    </PageShell>
  );
}

function ProofCard({
  proof: p,
  busy,
  onReview,
  onFixPath,
}: {
  proof: ProofForReview;
  busy: boolean;
  onReview: (approve: boolean) => void;
  onFixPath: (to: FixPath) => void;
}) {
  const near = p.distance_m <= 50;
  return (
    <li className="hud-panel rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">{p.mission_title}</div>
          <div className="truncate text-xs text-slate-400">{p.report_title}</div>
        </div>
        <span className="shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 font-mono text-xs text-amber-200">+{p.points} pending</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <figure>
          <figcaption className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Original report</figcaption>
          {p.report_photo_urls[0] ? (
            <Photo src={p.report_photo_urls[0]} alt="Reported photo" isReporter={false} className="h-32 w-full" />
          ) : (
            <div className="grid h-32 place-items-center rounded-xl bg-white/5 text-xs text-slate-500">No photo</div>
          )}
        </figure>
        <figure>
          <figcaption className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Proof by {p.helper_name}</figcaption>
          {p.photo_urls[0] ? (
            <Photo src={p.photo_urls[0]} alt="Proof photo" isReporter={false} className="h-32 w-full" />
          ) : (
            <div className="grid h-32 place-items-center rounded-xl bg-white/5 text-xs text-slate-500">No photo</div>
          )}
        </figure>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px]">
        <span className={near ? "text-emerald-300" : "text-rose-300"}>◎ {Math.round(p.distance_m)} m from pin</span>
        {p.speed_test != null && <span className="text-cyan-200">📶 {p.speed_test} Mbps</span>}
        <span className="text-slate-500">{timeAgo(p.taken_at)}</span>
      </div>

      <label className="mt-3 flex items-center gap-2 text-xs text-slate-400">
        Fix path
        <select
          value={p.fix_path}
          disabled={busy}
          onChange={(e) => onFixPath(e.target.value as FixPath)}
          className="rounded-lg border border-white/15 bg-slate-900 px-2 py-1 text-slate-100"
        >
          {FIX_PATHS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={() => onReview(false)} disabled={busy} className="rounded-xl border border-rose-400/40 py-2.5 text-sm text-rose-200 disabled:opacity-50">
          Reject
        </button>
        <button onClick={() => onReview(true)} disabled={busy} className="rounded-xl bg-emerald-400 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">
          {busy ? "Saving…" : "Approve"}
        </button>
      </div>
    </li>
  );
}
