"use client";

import { useEffect, useState } from "react";
import { getBalance, subscribeReports } from "@/lib/data";
import { useCurrentUser } from "@/lib/useCurrentUser";
import type { Balance, Report } from "@/lib/types";

const VOUCHER_COST = 100;

function useNow(intervalMs: number) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export default function StatusCorner({ reports, onOpenReport }: { reports: Report[]; onOpenReport: (id: string) => void }) {
  const user = useCurrentUser();
  const [balance, setBalance] = useState<Balance>({ pending: 0, spendable: 0 });
  const [bump, setBump] = useState(false);
  const now = useNow(1000);

  useEffect(() => {
    let alive = true;
    let last: number | null = null;
    const load = () =>
      getBalance(user.id).then((b) => {
        if (!alive) return;
        if (last !== null && b.spendable > last) {
          setBump(true);
          setTimeout(() => setBump(false), 1600);
        }
        last = b.spendable;
        setBalance(b);
      });
    load();
    const unsubscribe = subscribeReports(load);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [user.id]);

  const open = reports.filter((r) => !["fixed", "verified", "picked_up", "closed"].includes(r.status)).length;
  const active = reports.find((r) => r.mission?.status === "claimed" && r.mission.claimed_by === user.id);
  const remainingMs = active?.mission?.claim_expires_at && now ? Date.parse(active.mission.claim_expires_at) - now : 30 * 60_000;
  const mm = Math.max(0, Math.floor(remainingMs / 60000));
  const ss = Math.max(0, Math.floor((remainingMs % 60000) / 1000));
  const progress = Math.min(100, ((balance.spendable % VOUCHER_COST) / VOUCHER_COST) * 100);

  return (
    <div className="hud-panel w-44 rounded-xl p-2.5 text-xs">
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-emerald-300">
        <span className="live-dot" /> Live · {open} open
      </div>
      <div className={`mt-1.5 flex items-baseline gap-1 transition-transform ${bump ? "points-bump" : ""}`}>
        <span className="font-mono text-xl font-semibold text-cyan-100">{balance.spendable}</span>
        <span className="text-cyan-200/70">pts</span>
        {balance.pending > 0 && <span className="ml-auto font-mono text-[10px] text-amber-300">+{balance.pending} pending</span>}
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded bg-cyan-950" aria-label={`${Math.round(progress)}% to next meal voucher`}>
        <div className="h-full bg-cyan-400" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-0.5 text-[10px] text-slate-400">
        {balance.spendable >= VOUCHER_COST ? "Meal voucher ready" : `${VOUCHER_COST - (balance.spendable % VOUCHER_COST)} to $5 meal`}
      </div>
      {active && (
        <button onClick={() => onOpenReport(active.id)} className="mt-2 w-full rounded-md border border-amber-400/40 bg-amber-400/10 p-1.5 text-left">
          <div className="truncate text-[11px] text-amber-100">{active.title}</div>
          <div className="font-mono text-[10px] text-amber-300">
            Claim {mm}:{String(ss).padStart(2, "0")} left
          </div>
        </button>
      )}
    </div>
  );
}
