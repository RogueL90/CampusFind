"use client";

import Link from "next/link";
import { useState } from "react";
import Countdown from "@/components/Countdown";
import FinderCard from "@/components/FinderCard";
import Photo from "@/components/Photo";
import ProofCapture from "@/components/ProofCapture";
import { authorityName } from "@/lib/categories";
import { userName } from "@/lib/currentUser";
import { claimMission, getCheckinCode, getStatusEvents, subscribeReports, voteMeToo } from "@/lib/data";
import { CATEGORY_BY_ID } from "@/lib/geo/campus";
import { statusLabel, timeAgo } from "@/lib/status";
import type { Report } from "@/lib/types";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useLive } from "@/lib/useLive";

/** Bottom sheet for a map pin: what it is, who has it, its history, and what you can do about it. */
export default function ReportSheet({ report, onClose }: { report: Report; onClose: () => void }) {
  const user = useCurrentUser();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const [voted, setVoted] = useState(false);
  const cat = CATEGORY_BY_ID[report.category] ?? CATEGORY_BY_ID.other;
  const mine = report.reporter_id === user.id;
  const mission = report.mission;
  const myClaim = mission?.status === "claimed" && mission.claimed_by === user.id;

  const { data: events } = useLive(() => getStatusEvents(report.id), subscribeReports, [report.id]);
  const carrying = mine || (myClaim && mission?.mission_type === "delivery");
  const showFinderCard = report.kind === "found" && carrying && report.item?.whereabouts === "with_finder";
  const { data: code } = useLive(() => (showFinderCard ? getCheckinCode(report.id) : Promise.resolve(null)), null, [report.id, showFinderCard]);

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
      <div className="hud-panel mx-auto max-h-[72dvh] max-w-md overflow-y-auto rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <span className="rounded-lg px-2 py-1 text-xs" style={{ background: `${cat.color}22`, color: cat.color }}>
            {cat.icon} {report.kind === "lost" ? "Lost item" : report.kind === "found" ? "Found item" : cat.label}
          </span>
          <span className="font-mono text-[11px] text-slate-400">{timeAgo(report.created_at)}</span>
          <button onClick={onClose} className="ml-auto text-slate-400" aria-label="Close">
            ✕
          </button>
        </div>

        <h2 className="mt-2 text-base font-semibold leading-snug text-white">{report.title}</h2>
        {(report.building || report.floor) && (
          <p className="text-xs text-slate-400">
            {[report.building, report.floor && `floor ${report.floor}`].filter(Boolean).join(" · ")}
          </p>
        )}
        {report.description && <p className="mt-1 text-xs text-slate-300">{report.description}</p>}

        {report.photo_urls[0] && (
          <Photo
            src={report.photo_urls[0]}
            alt={report.title}
            sensitive={report.contains_sensitive}
            isReporter={mine}
            className="mt-3 h-40 w-full"
          />
        )}

        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-slate-400">
          <span className="text-cyan-200">{statusLabel(report.status)}</span>
          {report.kind === "issue" && report.routed_to && <span>Sent to {authorityName(report.routed_to)}</span>}
          {report.kind === "issue" && <span>{report.votes} × me too</span>}
        </div>

        {report.kind === "lost" && report.item && (
          <p className="mt-2 text-xs text-amber-100">
            Lost somewhere within {report.item.radius_m} m
            {[report.item.color, report.item.brand].filter(Boolean).length > 0 && ` · ${[report.item.color, report.item.brand].filter(Boolean).join(", ")}`}
            {mine ? ". We'll ping you when a found item matches." : ". Spot it? Report it as found."}
          </p>
        )}
        {report.kind === "found" && !mine && (
          <p className="mt-2 text-xs text-slate-300">
            {report.item?.whereabouts === "at_office"
              ? "Waiting at the Lost & Found office."
              : `${userName(report.reporter_id)} found this and is bringing it to Lost & Found.`}{" "}
            Yours? Report it lost and we&apos;ll match it.
          </p>
        )}
        {showFinderCard && (
          <div className="mt-3">
            <FinderCard code={code ?? null} title={report.title} />
          </div>
        )}

        {mission && (
          <div className="mt-3 rounded-xl border border-cyan-400/30 bg-cyan-400/5 p-3 text-xs text-cyan-100">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{mission.title}</span>
              <span className="shrink-0 rounded-full bg-cyan-400/20 px-2 py-0.5 font-mono">+{mission.points} pts</span>
            </div>
            <div className="mt-1 text-slate-300">Proof: {mission.proof_required}</div>
            {mission.status === "open" && !mine && (
              <button
                disabled={busy}
                onClick={() => run(() => claimMission(mission.id))}
                className="mt-2.5 w-full rounded-lg bg-cyan-400 px-3 py-2 font-semibold text-slate-950 disabled:opacity-50"
              >
                {busy ? "Claiming…" : "Claim mission · 30 min"}
              </button>
            )}
            {mission.status === "open" && mine && <p className="mt-2 text-slate-400">Other students can claim this one.</p>}
            {myClaim && mission.claim_expires_at && (
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <Countdown expiresAt={mission.claim_expires_at} />
                {mission.mission_type === "search" || mission.mission_type === "delivery" || mission.mission_type === "return" ? (
                  <span className="text-slate-300">Finishes at the office check-in</span>
                ) : (
                  <button onClick={() => setProofOpen(true)} className="rounded-lg bg-cyan-400 px-3 py-1.5 font-semibold text-slate-950">
                    Submit proof
                  </button>
                )}
              </div>
            )}
            {mission.status === "claimed" && !myClaim && <p className="mt-2 text-amber-200">{userName(mission.claimed_by)} is on it.</p>}
            {mission.status === "submitted" && <p className="mt-2 text-amber-200">Proof submitted · waiting for a moderator</p>}
          </div>
        )}

        {events && events.length > 0 && (
          <ol className="mt-3 space-y-1.5 border-l border-cyan-400/20 pl-3">
            {events.map((e) => (
              <li key={e.id} className="relative text-xs">
                <span className="absolute -left-[17px] top-1 h-2 w-2 rounded-full bg-cyan-400" />
                <span className="text-slate-200">{statusLabel(e.to_status)}</span>
                <span className="ml-2 font-mono text-[10px] text-slate-500">{timeAgo(e.at)}</span>
              </li>
            ))}
          </ol>
        )}

        {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
        <div className="mt-3 flex gap-2">
          {report.kind === "issue" && !mine && (
            <button
              disabled={busy || voted}
              onClick={() => run(async () => {
                await voteMeToo(report.id);
                setVoted(true);
              })}
              className="rounded-lg border border-slate-500/60 px-3 py-2 text-xs text-white disabled:opacity-50"
            >
              {voted ? "✓ Me too" : "Me too"}
            </button>
          )}
          {report.kind === "found" && !mine && (
            <Link href="/report?kind=lost" className="rounded-lg border border-slate-500/60 px-3 py-2 text-xs text-white">
              It&apos;s mine
            </Link>
          )}
        </div>
      </div>

      {proofOpen && mission && (
        <ProofCapture mission={mission} report={report} onClose={() => setProofOpen(false)} onSubmitted={() => setProofOpen(false)} />
      )}
    </div>
  );
}
