"use client";

import Link from "next/link";
import { useState } from "react";
import Countdown from "@/components/Countdown";
import PageShell, { Empty, ErrorNote } from "@/components/PageShell";
import { getBalance, getLedger, getMyMissions, getReports, subscribeBalance, subscribeReports } from "@/lib/data";
import { timeAgo } from "@/lib/status";
import type { Mission } from "@/lib/types";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useLive } from "@/lib/useLive";

const FILTERS = ["all", "active", "available", "completed"] as const;
type Filter = (typeof FILTERS)[number];

const TYPE_ICON: Record<string, string> = {
  verify: "📷",
  access_check: "♿",
  search: "🔎",
  return: "📦",
  delivery: "🚚",
  tidy: "🧹",
};

const STATUS_STYLE: Record<string, string> = {
  open: "text-cyan-200 bg-cyan-400/10",
  claimed: "text-amber-200 bg-amber-400/10",
  submitted: "text-violet-200 bg-violet-400/10",
  completed: "text-emerald-200 bg-emerald-400/10",
  cancelled: "text-slate-400 bg-white/5",
};

export default function MissionsPage() {
  const user = useCurrentUser();
  const [filter, setFilter] = useState<Filter>("all");

  const { data: balance } = useLive(() => getBalance(user.id), (cb) => subscribeBalance(user.id, cb), [user.id]);
  const { data: ledger } = useLive(() => getLedger(user.id), (cb) => subscribeBalance(user.id, cb), [user.id]);
  const { data, error } = useLive(
    async () => {
      const [mine, reports] = await Promise.all([getMyMissions(user.id), getReports()]);
      const available = reports
        .filter((r) => r.mission?.status === "open" && r.reporter_id !== user.id)
        .map((r) => ({ ...r.mission!, report_title: r.title }));
      return { mine, available };
    },
    subscribeReports,
    [user.id],
  );

  const mine = data?.mine ?? [];
  const active = mine.filter((m) => m.status === "claimed" || m.status === "submitted");
  const completed = mine.filter((m) => m.status === "completed");
  const shown: Mission[] =
    filter === "active" ? active : filter === "available" ? (data?.available ?? []) : filter === "completed" ? completed : [...active, ...(data?.available ?? []), ...completed];

  return (
    <PageShell title="Missions">
      <div className="grid grid-cols-2 gap-3">
        <div className="hud-panel rounded-2xl p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-emerald-300">Spendable</div>
          <div className="mt-1 text-3xl font-semibold text-white">{balance?.spendable ?? "–"}</div>
          <Link href="/rewards" className="mt-1 inline-block text-xs text-cyan-300">
            Spend on rewards ›
          </Link>
        </div>
        <div className="hud-panel rounded-2xl p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-amber-300">Pending</div>
          <div className="mt-1 text-3xl font-semibold text-white">{balance?.pending ?? "–"}</div>
          <div className="mt-1 text-xs text-slate-400">Waiting for review</div>
        </div>
      </div>

      <div className="mt-4 flex gap-1.5 overflow-x-auto" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-xs capitalize ${filter === f ? "bg-cyan-400 font-semibold text-slate-950" : "border border-white/10 text-slate-300"}`}
          >
            {f}
            {f === "active" && active.length > 0 && ` · ${active.length}`}
          </button>
        ))}
      </div>

      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
      <ul className="mt-3 space-y-2">
        {data && shown.length === 0 && (
          <Empty>
            {filter === "available" || filter === "all" ? "No open missions right now. Check the map later." : `No ${filter} missions yet.`}
          </Empty>
        )}
        {shown.map((m) => (
          <li key={m.id}>
            <Link href={`/?report=${m.report_id}`} className="hud-panel flex items-start gap-3 rounded-2xl p-3">
              <span className="mt-0.5 text-xl" aria-hidden>
                {TYPE_ICON[m.mission_type] ?? "★"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-white">{m.title}</span>
                  <span className="ml-auto shrink-0 font-mono text-xs text-cyan-200">+{m.points}</span>
                </div>
                {m.report_title && <p className="truncate text-xs text-slate-400">{m.report_title}</p>}
                <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                  <span className={`rounded-full px-2 py-0.5 capitalize ${STATUS_STYLE[m.status]}`}>
                    {m.status === "submitted" ? "in review" : m.status}
                  </span>
                  {m.status === "claimed" && m.claim_expires_at && <Countdown expiresAt={m.claim_expires_at} />}
                  {m.status === "open" && <span className="text-slate-400">Tap to see it on the map</span>}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {ledger && ledger.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">Points history</h2>
          <ul className="divide-y divide-white/5 rounded-2xl border border-white/10">
            {ledger.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-slate-200">{e.reason}</span>
                <span className="text-[10px] text-slate-500">{timeAgo(e.created_at)}</span>
                <span
                  className={`w-14 text-right font-mono ${e.state === "reversed" ? "text-slate-500 line-through" : e.delta < 0 ? "text-rose-300" : e.state === "pending" ? "text-amber-300" : "text-emerald-300"}`}
                >
                  {e.delta > 0 ? "+" : ""}
                  {e.delta}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageShell>
  );
}
