"use client";

import { QRCodeSVG } from "qrcode.react";

export const checkinPayload = (code: string) => `campusquests://checkin/${code}`;

/** Shown to the finder: the office scans the QR or types the 6-digit code to check the item in. */
export default function FinderCard({ code, title }: { code: string | null; title: string }) {
  if (!code) return null;
  return (
    <section className="flex items-center gap-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-3">
      <div className="shrink-0 rounded-xl bg-white p-1.5">
        <QRCodeSVG value={checkinPayload(code)} size={104} level="M" />
      </div>
      <div className="min-w-0">
        <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-300">Finder check-in · +50 pts</span>
        <h3 className="mt-1 text-sm font-semibold text-white">Bring it to Lost &amp; Found</h3>
        <p className="mt-0.5 text-xs text-slate-300">Show this at the desk to check in {title.toLowerCase()}.</p>
        <div className="mt-2 text-[10px] text-slate-400">Backup code</div>
        <div className="font-mono text-xl font-semibold tracking-[.25em] text-emerald-200">{code}</div>
      </div>
    </section>
  );
}
