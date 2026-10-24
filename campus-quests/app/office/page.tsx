"use client";

import { useEffect, useRef, useState } from "react";
import PageShell, { Empty } from "@/components/PageShell";
import Photo from "@/components/Photo";
import StaffNotice from "@/components/StaffNotice";
import { userName } from "@/lib/currentUser";
import { checkInItem, getItemByCode, getItemsAtOffice, getItemsOnTheWay, markPickedUp, subscribeReports } from "@/lib/data";
import { timeAgo } from "@/lib/status";
import type { Report } from "@/lib/types";
import { useLive } from "@/lib/useLive";

type Scanner = { stop: () => Promise<void>; isScanning: boolean };

/** `campusquests://checkin/482731` → `482731`; plain codes pass through. */
const codeFromScan = (text: string) => (text.trim().split("/").pop() ?? "").replace(/\D/g, "").slice(0, 6);

export default function OfficePage() {
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<Report | null | undefined>(undefined);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const scanner = useRef<Scanner | null>(null);

  const { data: atOffice } = useLive(getItemsAtOffice, subscribeReports, []);
  const { data: onTheWay } = useLive(getItemsOnTheWay, subscribeReports, []);

  useEffect(
    () => () => {
      if (scanner.current?.isScanning) void scanner.current.stop();
    },
    [],
  );

  function enterCode(next: string) {
    setCode(next);
    setMessage(null);
    setPreview(undefined);
    if (next.length === 6) getItemByCode(next).then(setPreview, () => setPreview(null));
  }

  async function startScanner() {
    setMessage(null);
    setScanning(true);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const reader = new Html5Qrcode("office-qr-reader");
      scanner.current = reader;
      await reader.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (text) => {
          void reader.stop();
          setScanning(false);
          enterCode(codeFromScan(text));
        },
        () => undefined,
      );
    } catch {
      setScanning(false);
      setMessage({ ok: false, text: "Camera scanner unavailable. Type the 6-digit code instead." });
    }
  }

  async function checkIn() {
    setBusy(true);
    setMessage(null);
    try {
      const { itemTitle, points } = await checkInItem(code);
      setMessage({ ok: true, text: points ? `✓ ${itemTitle} checked in · finder earned +${points}` : `✓ ${itemTitle} checked in (owner brought it in, no reward)` });
      setCode("");
      setPreview(undefined);
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Check-in failed." });
    } finally {
      setBusy(false);
    }
  }

  const pickUp = (id: string) =>
    markPickedUp(id).catch((e: unknown) => setMessage({ ok: false, text: e instanceof Error ? e.message : "Couldn't mark picked up." }));

  return (
    <PageShell title="Lost & Found desk" back="/staff">
      <StaffNotice roles={["office", "moderator"]} />
      <section className="hud-panel rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-white">Check in a found item</h2>
        <p className="mt-1 text-xs text-slate-400">Scan the finder&apos;s QR or type their backup code.</p>
        <div className="mt-3 flex gap-2">
          <input
            value={code}
            onChange={(e) => enterCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            placeholder="6-digit code"
            aria-label="6-digit finder code"
            className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 font-mono text-lg tracking-[.3em] text-white outline-none placeholder:tracking-normal placeholder:text-slate-500 focus:border-cyan-400"
          />
          <button onClick={startScanner} disabled={scanning} className="rounded-xl border border-cyan-400/40 px-3 text-sm text-cyan-100">
            ⌗ Scan
          </button>
        </div>
        {scanning && <div id="office-qr-reader" className="mt-3 overflow-hidden rounded-xl bg-black" />}

        {preview && (
          <div className="mt-3 flex gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
            {preview.photo_urls[0] && <Photo src={preview.photo_urls[0]} alt={preview.title} sensitive={preview.contains_sensitive} isReporter={false} className="h-16 w-16 shrink-0" />}
            <div className="min-w-0 text-xs">
              <div className="text-sm font-semibold text-white">{preview.title}</div>
              <div className="text-slate-400">
                Found by {userName(preview.reporter_id)} {timeAgo(preview.created_at)}
                {preview.building && ` near ${preview.building}`}
              </div>
              {preview.item?.whereabouts !== "with_finder" && <div className="mt-1 text-amber-200">Already checked in</div>}
            </div>
          </div>
        )}
        {preview === null && <p className="mt-3 text-xs text-rose-300">No found item uses that code.</p>}

        <button
          onClick={checkIn}
          disabled={busy || code.length < 6 || preview?.item?.whereabouts !== "with_finder"}
          className="mt-3 w-full rounded-xl bg-cyan-400 py-3 text-sm font-semibold text-slate-950 disabled:opacity-40"
        >
          {busy ? "Checking in…" : "Check in · finder gets +50"}
        </button>
        {message && (
          <p role="status" className={`mt-3 rounded-xl p-3 text-sm ${message.ok ? "bg-emerald-400/15 text-emerald-200" : "bg-rose-500/15 text-rose-200"}`}>
            {message.text}
          </p>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">At the desk · {atOffice?.length ?? 0}</h2>
        {atOffice?.length === 0 && <Empty>No items waiting for pickup.</Empty>}
        <ul className="space-y-2">
          {atOffice?.map((r) => (
            <li key={r.id} className="hud-panel flex items-center gap-3 rounded-xl p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-white">{r.title}</div>
                <div className="text-[11px] text-slate-500">Found by {userName(r.reporter_id)}</div>
              </div>
              <button onClick={() => pickUp(r.id)} className="shrink-0 rounded-lg bg-emerald-400/15 px-3 py-1.5 text-xs text-emerald-200">
                Owner picked up · +25
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">On the way · {onTheWay?.length ?? 0}</h2>
        {onTheWay?.length === 0 && <Empty>Nothing on its way right now.</Empty>}
        <ul className="space-y-2">
          {onTheWay?.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-xl border border-white/10 p-3 text-xs">
              <span className="min-w-0 flex-1 truncate text-slate-200">{r.title}</span>
              <span className="text-slate-500">
                {userName(r.reporter_id)} · {timeAgo(r.created_at)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </PageShell>
  );
}
