"use client";

import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import PageShell, { Empty, ErrorNote } from "@/components/PageShell";
import { getBalance, getRedemptions, getRewards, getVolunteering, redeemReward, subscribeBalance } from "@/lib/data";
import { timeAgo } from "@/lib/status";
import type { Reward } from "@/lib/types";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useLive } from "@/lib/useLive";
import { formatServiceTime } from "@/lib/volunteer";

export default function RewardsPage() {
  const user = useCurrentUser();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<{ name: string; code: string } | null>(null);

  const { data: rewards } = useLive(getRewards, null, []);
  const { data: balance } = useLive(() => getBalance(user.id), (cb) => subscribeBalance(user.id, cb), [user.id]);
  const { data: redemptions, reload } = useLive(() => getRedemptions(user.id), (cb) => subscribeBalance(user.id, cb), [user.id]);
  const { data: volunteering } = useLive(
    () => getVolunteering(user.id).catch(() => []),
    (cb) => subscribeBalance(user.id, cb),
    [user.id],
  );
  const serviceTotal = volunteering?.reduce((s, v) => s + v.service_minutes, 0) ?? 0;
  const nameOf = (id: string) => rewards?.find((r) => r.id === id)?.name ?? "Reward";

  async function redeem(r: Reward) {
    setBusyId(r.id);
    setError(null);
    try {
      const { code } = await redeemReward(r.id);
      setShown({ name: r.name, code });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't redeem.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PageShell title="Rewards">
      <div className="hud-panel flex items-center justify-between rounded-2xl p-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-emerald-300">You can spend</div>
          <div className="mt-1 text-3xl font-semibold text-white">{balance?.spendable ?? "–"} pts</div>
        </div>
        {!!balance?.pending && <div className="text-right text-xs text-amber-200">+{balance.pending} pending review</div>}
      </div>

      <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
        <p className="font-semibold text-white">Ways to earn</p>
        <p className="mt-1">📦 Bring found items to Lost & Found, or help return them to their owners.</p>
        <p className="mt-1">
          🧹 Take on Student solvable tasks such as litter pickups and quick checks. Register with the department that runs
          them, and each approved task also counts toward your community service hours.
        </p>
        {serviceTotal > 0 && (
          <p className="mt-2 font-mono text-emerald-200">{formatServiceTime(serviceTotal)} of community service logged</p>
        )}
      </div>

      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}

      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {rewards?.map((r) => {
          const short = (balance?.spendable ?? 0) < r.cost_points;
          return (
            <li key={r.id} className="hud-panel flex flex-col rounded-2xl p-4">
              <span className="text-2xl" aria-hidden>
                🎟️
              </span>
              <h2 className="mt-2 text-sm font-semibold text-white">{r.name}</h2>
              {r.partner && <p className="text-xs text-slate-400">{r.partner}</p>}
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="font-mono text-sm text-cyan-200">{r.cost_points} pts</span>
                <button
                  onClick={() => redeem(r)}
                  disabled={short || busyId !== null || r.stock === 0}
                  className="rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 disabled:bg-white/10 disabled:text-slate-500"
                >
                  {busyId === r.id ? "Redeeming…" : r.stock === 0 ? "Sold out" : short ? `Need ${r.cost_points - (balance?.spendable ?? 0)} more` : "Redeem"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-slate-500">You can redeem up to 300 points a week.</p>

      <section className="mt-6">
        <h2 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">Your codes</h2>
        {redemptions?.length === 0 && <Empty>Nothing redeemed yet. Finish missions to earn points.</Empty>}
        <ul className="space-y-2">
          {redemptions?.map((x) => (
            <li key={x.id}>
              <button onClick={() => setShown({ name: nameOf(x.reward_id), code: x.code })} className="hud-panel flex w-full items-center gap-3 rounded-xl p-3 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-white">{nameOf(x.reward_id)}</span>
                  <span className="text-[11px] text-slate-500">
                    {timeAgo(x.redeemed_at)} · {x.points_spent} pts
                  </span>
                </span>
                <span className="font-mono text-xs text-cyan-200">{x.code}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {shown && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6 backdrop-blur-sm" role="dialog" aria-label={`${shown.name} code`} onClick={() => setShown(null)}>
          <div className="hud-panel w-full max-w-xs rounded-3xl p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-300">Show at the counter</p>
            <h2 className="mt-1 text-lg font-semibold text-white">{shown.name}</h2>
            <div className="mx-auto mt-4 w-fit rounded-2xl bg-white p-3">
              <QRCodeSVG value={shown.code} size={180} level="M" />
            </div>
            <div className="mt-3 font-mono text-lg tracking-widest text-cyan-100">{shown.code}</div>
            <button onClick={() => setShown(null)} className="mt-4 w-full rounded-xl border border-white/15 py-2.5 text-sm text-white">
              Done
            </button>
          </div>
        </div>
      )}
    </PageShell>
  );
}
