"use client";

import Link from "next/link";
import { useState } from "react";
import PageShell, { Empty, ErrorNote } from "@/components/PageShell";
import Photo from "@/components/Photo";
import { SolvabilityBadge } from "@/components/Solvability";
import { AUTHORITIES, AUTHORITY_IDS, authorityName, categoryLabel, type AuthorityId } from "@/lib/categories";
import { getReportsForAuthority, subscribeReports } from "@/lib/data";
import { PRIVATE_LISTING } from "@/lib/visibility";
import { statusLabel, timeAgo } from "@/lib/status";
import { useLive } from "@/lib/useLive";

/** What each campus office received. Stands in for the email / work-order integration in the demo. */
export default function AuthoritiesPage() {
  const [authority, setAuthority] = useState<AuthorityId>("fdo_maintenance");
  const { data: reports, error } = useLive(() => getReportsForAuthority(authority), subscribeReports, [authority]);

  return (
    <PageShell title="Authority inboxes" back="/staff" staffOnly>
      <select
        aria-label="Authority"
        value={authority}
        onChange={(e) => setAuthority(e.target.value as AuthorityId)}
        className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2.5 text-sm text-white"
      >
        {AUTHORITY_IDS.map((id) => (
          <option key={id} value={id}>
            {AUTHORITIES[id].name}
          </option>
        ))}
      </select>
      <p className="mt-2 text-xs text-slate-500">Handles {AUTHORITIES[authority].handles}.</p>

      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
      {reports?.length === 0 && <div className="mt-4"><Empty>Nothing routed here yet.</Empty></div>}
      <ul className="mt-4 space-y-3">
        {reports?.map((r) => (
          <li key={r.id} className="hud-panel rounded-2xl p-4">
            <div className="flex gap-3">
              <Photo src={r.photo_urls[0]} alt="" sensitive={r.contains_sensitive} className="h-16 w-16 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  {categoryLabel(r.issue_type ?? r.category)}
                  {r.severity != null && ` · severity ${r.severity}/5`} · {r.routed_to === authority ? "assigned" : "cc"}
                </p>
                {r.kind === "issue" && (
                  <div className="mt-1">
                    <SolvabilityBadge fixPath={r.fix_path} />
                  </div>
                )}
                <p className="text-sm font-semibold text-white">{r.report_subject ?? r.title}</p>
                <p className="text-[11px] text-slate-500">
                  {statusLabel(r.status)} · {timeAgo(r.created_at)}
                  {r.building && ` · ${r.building}`}
                </p>
              </div>
            </div>
            {r.routing_reason && <p className="mt-2 text-xs italic text-cyan-200/80">Why here: {r.routing_reason}</p>}
            {r.cc.filter((id) => id !== PRIVATE_LISTING).length > 0 && (
              <p className="mt-1 text-[11px] text-slate-400">
                Also sent to {r.cc.filter((id) => id !== PRIVATE_LISTING).map(authorityName).join(", ")}
              </p>
            )}
            {r.report_body && (
              <pre className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl bg-black/30 p-3 font-sans text-xs text-slate-300">{r.report_body}</pre>
            )}
            <Link href={`/?report=${r.id}`} className="mt-2 inline-block text-xs text-cyan-300">
              Show on map ›
            </Link>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
