"use client";

// Staff view: what each campus authority received. Stands in for the email / work-order
// integration, so the demo can show the report landing at IT Services, Facilities, etc.

import { useEffect, useState } from "react";
import Photo from "@/components/Photo";
import { AUTHORITIES, AUTHORITY_IDS, categoryLabel, type AuthorityId } from "@/lib/categories";
import type { Report } from "@/lib/types";

const POLL_MS = 4000;

export default function AuthoritiesPage() {
  const [authority, setAuthority] = useState<AuthorityId>("it_services");
  const [reports, setReports] = useState<Report[] | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const res = await fetch(`/api/authorities/${authority}`, { cache: "no-store" });
      if (alive && res.ok) setReports(await res.json());
    };
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [authority]);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-cyan-300">Staff view</p>
        <h1 className="text-2xl font-semibold">Authority inboxes</h1>
      </div>
      <select
        aria-label="Authority"
        value={authority}
        onChange={(e) => {
          setReports(null);
          setAuthority(e.target.value as AuthorityId);
        }}
        className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2"
      >
        {AUTHORITY_IDS.map((id) => (
          <option key={id} value={id} className="bg-slate-900">
            {AUTHORITIES[id].name}
          </option>
        ))}
      </select>

      {reports === null && <p className="text-white/60">Loading…</p>}
      {reports?.length === 0 && (
        <p className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-white/60">No reports yet.</p>
      )}
      <ul className="space-y-3">
        {reports?.map((r) => (
          <li key={r.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex gap-3">
              <Photo src={r.photo_urls[0]} alt="" sensitive={r.contains_sensitive} className="h-16 w-16 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-white/50">
                  {categoryLabel(r.category)} · severity {r.severity}/5 ·{" "}
                  {r.routed_to === authority ? "assigned" : "cc"}
                </p>
                <p className="font-medium">{r.report_subject ?? r.title}</p>
              </div>
            </div>
            {r.report_body && (
              <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-white/80">{r.report_body}</pre>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
