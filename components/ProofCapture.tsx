"use client";

import * as turf from "@turf/turf";
import { useState } from "react";
import { submitProof, uploadPhoto } from "@/lib/data";
import { resizeImage } from "@/lib/resizeImage";
import type { Mission, Report } from "@/lib/types";

const PROOF_RADIUS_M = 50;

type Spot = { lat: number; lng: number; simulated: boolean };

/** Mission proof: photo + location (+ speed test for Wi-Fi). The database re-checks the 50 m rule. */
export default function ProofCapture({
  mission,
  report,
  onClose,
  onSubmitted,
}: {
  mission: Mission;
  report: Pick<Report, "lat" | "lng" | "title">;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [locating, setLocating] = useState(false);
  const [speed, setSpeed] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsSpeed = /speed test/i.test(mission.proof_required);
  const distance = spot ? turf.distance([spot.lng, spot.lat], [report.lng, report.lat], { units: "meters" }) : null;

  function pickPhoto(file: File | undefined) {
    if (!file) return;
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
    if (!spot) locate();
  }

  function locate() {
    if (!navigator.geolocation) {
      setError("This browser can't share your location.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setSpot({ lat: p.coords.latitude, lng: p.coords.longitude, simulated: false });
        setLocating(false);
      },
      () => {
        setError("Location permission was denied.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function send() {
    setError(null);
    if (!photo) return setError("Add a proof photo first.");
    if (!spot) return setError("Share your location so we can check you're at the pin.");
    if (needsSpeed && !Number(speed)) return setError("Enter your speed test result in Mbps.");
    setBusy(true);
    try {
      const url = await uploadPhoto(await resizeImage(photo, 1280, 0.8), "proofs");
      await submitProof(mission.id, {
        photo_urls: [url],
        lat: spot.lat,
        lng: spot.lng,
        speed_test_mbps: needsSpeed ? Number(speed) : undefined,
      });
      onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't submit proof.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/60 backdrop-blur-sm sm:place-items-center" role="dialog" aria-label="Mission proof">
      <section className="hud-panel w-full max-w-md rounded-t-3xl p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-cyan-300">Mission proof · +{mission.points} pts</p>
            <h2 className="mt-1 text-lg font-semibold text-white">{mission.title}</h2>
          </div>
          <button onClick={onClose} className="text-xl text-slate-400" aria-label="Close">
            ✕
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-300">Needed: {mission.proof_required}</p>

        <label className="mt-4 flex min-h-36 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-cyan-400/40 bg-cyan-400/5 text-center">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL
            <img src={preview} alt="Your proof photo" className="max-h-48 w-full object-cover" />
          ) : (
            <>
              <span className="text-3xl">📷</span>
              <span className="mt-2 text-sm font-medium text-cyan-100">Take a photo</span>
            </>
          )}
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => pickPhoto(e.target.files?.[0])} />
        </label>

        {needsSpeed && (
          <label className="mt-3 block text-sm text-slate-300">
            Speed test result
            <div className="mt-1 flex items-center gap-2">
              <input
                inputMode="decimal"
                value={speed}
                onChange={(e) => setSpeed(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="e.g. 4.2"
                className="w-28 rounded-lg border border-white/15 bg-white/5 px-3 py-2 font-mono text-white"
              />
              <span className="text-xs text-slate-400">Mbps (run fast.com at the pin)</span>
            </div>
          </label>
        )}

        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
          {spot && distance !== null ? (
            <p className={distance <= PROOF_RADIUS_M ? "text-emerald-300" : "text-rose-300"}>
              ◎ {Math.round(distance)} m from the pin ({PROOF_RADIUS_M} m limit){spot.simulated && " · demo location"}
            </p>
          ) : (
            <p>{locating ? "Getting your location…" : "We check that the photo was taken within 50 m of the pin."}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={locate} className="rounded-lg border border-cyan-400/40 px-2.5 py-1 text-cyan-100">
              📍 Use my location
            </button>
            <button
              type="button"
              onClick={() => setSpot({ lat: report.lat, lng: report.lng, simulated: true })}
              className="rounded-lg border border-white/15 px-2.5 py-1 text-slate-300"
            >
              Demo: I&apos;m at the pin
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-rose-500/15 p-2.5 text-sm text-rose-200">
            {error}
          </p>
        )}
        <button
          onClick={send}
          disabled={busy}
          className="mt-4 w-full rounded-xl bg-cyan-400 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50"
        >
          {busy ? "Submitting…" : "Submit for review"}
        </button>
        <p className="mt-2 text-center text-[11px] text-slate-500">Points stay pending until a moderator approves.</p>
      </section>
    </div>
  );
}
