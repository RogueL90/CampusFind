"use client";

import { useState } from "react";
import { checkReport } from "@/lib/data";
import { timeAgo } from "@/lib/status";
import type { Report } from "@/lib/types";
import { useNow } from "@/lib/useNow";

type Checked = Pick<Report, "created_at" | "last_checked_at" | "last_check_still" | "resolved_votes" | "status">;

/** "Reported 2 h ago · last confirmed 12 min ago (still there) · 1 of 3 say resolved" */
export function freshnessText(r: Checked, now: number): string {
  const parts = [`Reported ${timeAgo(r.created_at, now)}`];
  parts.push(r.last_checked_at ? `last confirmed ${timeAgo(r.last_checked_at, now)} (${r.last_check_still ? "still there" : "looks resolved"})` : "not confirmed since");
  if (r.resolved_votes > 0 && r.status !== "resolved") parts.push(`${r.resolved_votes} of 3 say resolved`);
  return parts.join(" · ");
}

export function Freshness({ report, className = "" }: { report: Checked; className?: string }) {
  const now = useNow(30_000);
  if (!now) return null;
  return <p className={`font-mono text-[10px] text-slate-400 ${className}`}>{freshnessText(report, now)}</p>;
}

/** "Still there" also counts as a Me too; 3 "Looks resolved" after the last "Still there" take the pin off the map. */
export function CheckButtons({
  reportId,
  onChecked,
  compact = false,
}: {
  reportId: string;
  onChecked?: (stillThere: boolean) => void;
  compact?: boolean;
}) {
  const [answered, setAnswered] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (answered !== null) {
    return (
      <span className="text-[11px] text-emerald-300">
        {answered ? "Thanks, marked still there." : "Thanks, we'll take it off once others agree."}
      </span>
    );
  }

  const answer = async (stillThere: boolean) => {
    setError(null);
    try {
      await checkReport(reportId, stillThere);
      setAnswered(stillThere);
      onChecked?.(stillThere);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const btn = compact ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!compact && <span className="text-[11px] text-slate-300">Is it still there?</span>}
      <button onClick={() => answer(true)} className={`rounded-lg border border-rose-400/60 font-semibold text-rose-100 ${btn}`}>
        Still there
      </button>
      <button onClick={() => answer(false)} className={`rounded-lg border border-emerald-400/60 font-semibold text-emerald-100 ${btn}`}>
        Looks resolved
      </button>
      {error && <span className="text-[11px] text-rose-300">{error}</span>}
    </div>
  );
}
