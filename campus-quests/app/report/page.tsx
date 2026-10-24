"use client";

// Report flow: snap a photo, drop a pin, and Claude does the rest (what it is, who handles it,
// and the written report). The student just checks it and taps Send.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import type { MatchScore } from "@/app/api/match/route";
import FinderCard from "@/components/FinderCard";
import PageShell from "@/components/PageShell";
import PinPicker, { type PinValue } from "@/components/map/PinPicker";
import { AUTHORITIES, AUTHORITY_IDS, authorityName, ISSUE_CATEGORIES, ISSUE_CATEGORY_IDS, mapCategory } from "@/lib/categories";
import { createMatch, createReport, getCheckinCode, getOpenLostReports, uploadPhoto } from "@/lib/data";
import { fixPath } from "@/lib/fixPath";
import { nearestBuilding } from "@/lib/geo/buildings";
import { MATCH_THRESHOLD } from "@/lib/matchScore";
import { reportFooter } from "@/lib/reportFooter";
import { resizeImage } from "@/lib/resizeImage";
import { HAZARD_FLAGS, type NewReport, type Report, type ReportKind, type Triage } from "@/lib/types";
import { useCurrentUser } from "@/lib/useCurrentUser";

type Step = "photo" | "pin" | "confirm" | "done";
type Saved = { report: Report; matched: number; code: string | null };

const KINDS: { kind: ReportKind; label: string }[] = [
  { kind: "issue", label: "Problem" },
  { kind: "lost", label: "Lost item" },
  { kind: "found", label: "Found item" },
];

const ACCESS = ["wheelchair", "low_vision", "no_stairs", "crutches"];

/** Quick picks for "when did you lose it?" */
function windowFor(choice: string): [string | null, string | null] {
  const now = new Date();
  const h = (n: number) => new Date(now.getTime() - n * 3600_000).toISOString();
  const today = (hr: number) => {
    const d = new Date(now);
    d.setHours(hr, 0, 0, 0);
    return d;
  };
  switch (choice) {
    case "1h":
      return [h(1), now.toISOString()];
    case "3h":
      return [h(3), now.toISOString()];
    case "morning":
      return [today(7).toISOString(), today(12).toISOString()];
    case "yesterday": {
      const s = today(0);
      s.setDate(s.getDate() - 1);
      return [s.toISOString(), today(0).toISOString()];
    }
    default:
      return [null, null];
  }
}

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

async function requestTriage(photo: string | null, note: string, kind: ReportKind): Promise<Triage> {
  const res = await fetch("/api/triage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ photo, note, kind }),
  });
  if (!res.ok) throw new Error("Couldn't read the photo");
  return res.json();
}

/** Scores open lost reports against a new found item and notifies the best-matching owners. */
async function matchFoundItem(found: Report): Promise<number> {
  const candidates = (await getOpenLostReports()).filter((r) => r.reporter_id !== found.reporter_id);
  if (!candidates.length) return 0;
  const res = await fetch("/api/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ found, candidates }),
  });
  if (!res.ok) return 0;
  const { results } = (await res.json()) as { results: MatchScore[] };
  const byOwner = new Map<string, { lostId: string; score: number }>();
  for (const { lost_report_id, score } of results) {
    const owner = candidates.find((c) => c.id === lost_report_id)?.reporter_id;
    if (!owner || score.total < MATCH_THRESHOLD) continue;
    if ((byOwner.get(owner)?.score ?? 0) < score.total) byOwner.set(owner, { lostId: lost_report_id, score: score.total });
  }
  await Promise.all([...byOwner.values()].map((m) => createMatch(m.lostId, found.id, m.score)));
  return byOwner.size;
}

/** Wall clock for the "Reported in Ns" timer; only called from event handlers. */
const clock = () => Date.now();

const field = "mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white";

export default function ReportPage() {
  return (
    <PageShell title="Report">
      <Suspense fallback={null}>
        <ReportFlow />
      </Suspense>
    </PageShell>
  );
}

function ReportFlow() {
  const user = useCurrentUser();
  const initialKind = useSearchParams().get("kind");
  const [step, setStep] = useState<Step>("photo");
  const [kind, setKind] = useState<ReportKind>(initialKind === "lost" || initialKind === "found" ? initialKind : "issue");
  const [preview, setPreview] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState("");
  const [pin, setPin] = useState<PinValue | null>(null);
  const [building, setBuilding] = useState("");
  const [when, setWhen] = useState("unsure");
  const [delivery, setDelivery] = useState(false);
  const [triage, setTriage] = useState<Triage | null>(null);
  const [triaging, setTriaging] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const dataUrl = useRef<string | null>(null);
  const triagePromise = useRef<Promise<Triage | null> | null>(null);

  const isItem = kind !== "issue";

  function reset() {
    setStep("photo");
    setPreview(null);
    setPhotoUrl(null);
    setNote("");
    setPin(null);
    setBuilding("");
    setWhen("unsure");
    setDelivery(false);
    setTriage(null);
    setShowDetails(false);
    setSaved(null);
    setError(null);
    dataUrl.current = null;
    triagePromise.current = null;
  }

  function runTriage(k: ReportKind) {
    setTriage(null);
    setTriaging(true);
    setError(null);
    triagePromise.current = requestTriage(dataUrl.current, note, k)
      .then((t) => {
        setTriage(t);
        return t;
      })
      .catch((e: Error) => {
        setError(e.message);
        return null;
      })
      .finally(() => setTriaging(false));
  }

  /** Upload and Claude's triage start the moment a photo is picked, so the report is usually ready by the time the pin is placed. */
  async function onPhoto(file: File | undefined) {
    if (!file) return;
    startedAt.current = clock();
    setPreview(URL.createObjectURL(file));
    setPhotoUrl(null);
    setUploading(true);
    setStep("pin");
    try {
      const blob = await resizeImage(file);
      dataUrl.current = await blobToDataUrl(blob);
      runTriage(kind);
      uploadPhoto(blob, "reports")
        .then(setPhotoUrl, () => setError("Photo upload failed. You can still send the report without it."))
        .finally(() => setUploading(false));
    } catch {
      setUploading(false);
      setError("Couldn't read that image. Try another photo.");
    }
  }

  function describeInstead() {
    if (!note.trim()) return;
    startedAt.current = clock();
    dataUrl.current = null;
    runTriage(kind);
    setStep("pin");
  }

  /** Changing problem/lost/found after the photo re-runs triage with the right framing. */
  function chooseKind(k: ReportKind) {
    setKind(k);
    if (step !== "photo") runTriage(k);
  }

  function choosePin(p: PinValue) {
    setPin(p);
    setBuilding(nearestBuilding(p.lat, p.lng) ?? "");
  }

  async function pinNext() {
    setStep("confirm");
    await triagePromise.current;
  }

  async function submit() {
    if (!triage || !pin) return;
    setSaving(true);
    setError(null);
    const [lostFrom, lostTo] = kind === "lost" ? windowFor(when) : [null, null];
    const createdAt = new Date().toISOString();
    const t = triage;
    const input: NewReport = {
      kind,
      category: mapCategory(isItem ? "lost_found" : t.category),
      issue_type: t.issue_type || undefined,
      severity: isItem ? undefined : t.severity,
      title: t.title,
      description: t.identified || undefined,
      photo_urls: photoUrl ? [photoUrl] : [],
      lat: pin.lat,
      lng: pin.lng,
      building: building.trim() || undefined,
      fix_path: fixPath({ kind, category: t.category, severity: t.severity, hazard_flags: t.hazard_flags }),
      hazard_flags: isItem ? [] : t.hazard_flags,
      access_impact: isItem ? [] : t.access_impact,
      routed_to: isItem ? "lost_found" : (t.routed_to ?? undefined),
      cc: isItem ? [] : t.cc,
      identified: t.identified || undefined,
      routing_reason: t.routing_reason || undefined,
      report_subject: t.report_subject,
      report_body: t.report_body + reportFooter({ building, lat: pin.lat, lng: pin.lng, created_at: createdAt, photo: photoUrl }),
      contains_sensitive: t.contains_sensitive,
      ...(isItem && {
        radius_m: kind === "lost" ? (pin.radiusM ?? 50) : 10,
        item_category: t.issue_type || undefined,
        color: t.color ?? undefined,
        brand: t.brand ?? undefined,
        marks: t.marks ?? undefined,
        lost_from: lostFrom ?? undefined,
        lost_to: lostTo ?? undefined,
        leave_for_delivery: kind === "found" && delivery,
      }),
    };
    try {
      const report = await createReport(input);
      const [matched, code] =
        kind === "found" ? await Promise.all([matchFoundItem(report).catch(() => 0), getCheckinCode(report.id)]) : [0, null];
      setSaved({ report, matched, code });
      setElapsed(Math.round((clock() - startedAt.current) / 1000));
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send");
    } finally {
      setSaving(false);
    }
  }

  const set = <K extends keyof Triage>(k: K, v: Triage[K]) => setTriage((t) => (t ? { ...t, [k]: v } : t));
  const toggle = (k: "hazard_flags" | "access_impact" | "cc", v: string) =>
    setTriage((t) => (t ? { ...t, [k]: t[k].includes(v) ? t[k].filter((x) => x !== v) : [...t[k], v] } : t));

  const stepIndex = ["photo", "pin", "confirm"].indexOf(step);

  return (
    <div className="space-y-5">
      {step !== "done" && (
        <div className="flex items-center gap-3">
          {step !== "photo" && (
            <button
              type="button"
              aria-label="Back"
              onClick={() => setStep(step === "confirm" ? "pin" : "photo")}
              className="rounded-full border border-white/15 px-3 py-1 text-sm text-white"
            >
              ←
            </button>
          )}
          <div className="flex flex-1 gap-1.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= stepIndex ? "bg-cyan-400" : "bg-white/10"}`} />
            ))}
          </div>
        </div>
      )}

      {step !== "done" && (
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-white/5 p-1 text-sm" role="radiogroup" aria-label="Report type">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              role="radio"
              aria-checked={kind === k.kind}
              onClick={() => chooseKind(k.kind)}
              className={`rounded-lg py-2 ${kind === k.kind ? "bg-cyan-400 font-semibold text-slate-950" : "text-slate-300"}`}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}

      {step === "photo" && (
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">
            {kind === "lost" ? "Show us what you lost" : kind === "found" ? "Snap what you found" : "Snap the problem"}
          </h2>
          <p className="text-sm text-slate-400">
            {kind === "lost"
              ? "Your own photo or a product photo of the same model. AI fills in the details."
              : "AI figures out what it is, who should fix it, and writes the report."}
          </p>
          <label className="grid aspect-[4/3] w-full cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-cyan-400/40 bg-cyan-400/5 text-center">
            <span>
              <span className="block text-5xl">📷</span>
              <span className="mt-2 block font-medium text-cyan-200">Take photo</span>
            </span>
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
          </label>
          <label className="block cursor-pointer rounded-xl border border-white/15 bg-white/5 py-3 text-center text-sm text-white">
            🖼️ Choose from gallery
            <input type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
          </label>
          <div className="rounded-xl border border-white/10 p-3">
            <label className="text-xs text-slate-400" htmlFor="report-note">
              No photo? Describe it instead
            </label>
            <textarea
              id="report-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder={kind === "issue" ? "e.g. Wi-Fi keeps dropping on MLK floor 4" : "e.g. Black AirPods Pro case with a sticker"}
              className={`${field} text-sm`}
            />
            <button type="button" disabled={!note.trim()} onClick={describeInstead} className="mt-2 text-sm text-cyan-300 disabled:text-slate-600">
              Continue without a photo ›
            </button>
          </div>
        </section>
      )}

      {step === "pin" && (
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL
              <img src={preview} alt="Your photo" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
            )}
            <p className="text-sm text-slate-400">
              {triaging ? "✨ AI is looking at it…" : triage ? "✨ AI report ready" : uploading ? "Uploading…" : ""}
            </p>
          </div>
          <h2 className="text-2xl font-semibold text-white">
            {kind === "lost" ? "Where did you lose it?" : kind === "found" ? "Where did you find it?" : "Where is it?"}
          </h2>
          <PinPicker value={pin} onChange={choosePin} withRadius={kind === "lost"} />
          {pin && (
            <label className="block text-sm text-slate-400">
              Building <span className="text-slate-600">(optional)</span>
              <input value={building} onChange={(e) => setBuilding(e.target.value)} placeholder="Outdoors" className={field} />
            </label>
          )}
          {kind === "lost" && (
            <div>
              <p className="text-sm text-slate-300">
                When? <span className="text-slate-500">(optional)</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  ["1h", "Last hour"],
                  ["3h", "Last 3 hours"],
                  ["morning", "This morning"],
                  ["yesterday", "Yesterday"],
                  ["unsure", "Not sure"],
                ].map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setWhen(v)}
                    className={`rounded-full border px-3 py-1.5 text-sm ${when === v ? "border-cyan-300 bg-cyan-300/15 text-cyan-200" : "border-white/15 bg-white/5 text-white"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {kind === "found" && (
            <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
              <input type="checkbox" checked={delivery} onChange={(e) => setDelivery(e.target.checked)} className="h-5 w-5 accent-cyan-400" />
              I can&apos;t take it to Lost &amp; Found. Post a delivery mission for another student.
            </label>
          )}
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <button type="button" disabled={!pin} onClick={pinNext} className="w-full rounded-xl bg-white py-3 font-medium text-slate-900 disabled:opacity-30">
            Next
          </button>
        </section>
      )}

      {step === "confirm" && (
        <section className="space-y-4">
          {!triage ? (
            <div className="space-y-3 py-10 text-center">
              {error ? (
                <>
                  <p className="text-rose-300">{error}</p>
                  <button type="button" onClick={() => setStep("photo")} className="rounded-xl border border-white/15 px-4 py-2 text-white">
                    Try another photo
                  </button>
                </>
              ) : (
                <p className="text-slate-400">✨ AI is writing your report…</p>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3">
                {preview && (
                  // eslint-disable-next-line @next/next/no-img-element -- local object URL
                  <img src={preview} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
                )}
                <div className="min-w-0">
                  <span className="rounded-full bg-cyan-300/15 px-2 py-0.5 text-xs text-cyan-200">
                    ✨ {triage.source === "claude" ? "Claude" : "Demo AI"} identified
                  </span>
                  <input
                    aria-label="Title"
                    value={triage.title}
                    onChange={(e) => set("title", e.target.value)}
                    className="mt-1 w-full bg-transparent text-lg font-semibold leading-snug text-white outline-none focus:underline"
                  />
                  {triage.identified && <p className="mt-1 text-sm text-slate-400">{triage.identified}</p>}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white">
                <p className="text-xs uppercase tracking-wide text-slate-500">Sending to</p>
                <p className="font-medium">{authorityName(isItem ? "lost_found" : triage.routed_to)}</p>
                {!isItem && triage.cc.length > 0 && <p className="text-sm text-slate-400">cc {triage.cc.map(authorityName).join(", ")}</p>}
                {!isItem && <p className="mt-1 text-sm text-slate-400">{triage.routing_reason}</p>}
                {!isItem && (
                  <p className="mt-2 text-sm">
                    Severity <b>{triage.severity}/5</b>
                    {triage.hazard_flags.length > 0 && (
                      <span className="text-rose-300"> · {triage.hazard_flags.map((h) => h.replace(/_/g, " ")).join(", ")}</span>
                    )}
                    {triage.access_impact.length > 0 && <span className="text-amber-300"> · access alert</span>}
                  </p>
                )}
              </div>

              {!isItem && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Report</p>
                  <input aria-label="Report subject" value={triage.report_subject} onChange={(e) => set("report_subject", e.target.value)} className={`${field} font-medium`} />
                  <textarea
                    aria-label="Report body"
                    value={triage.report_body}
                    onChange={(e) => set("report_body", e.target.value)}
                    rows={7}
                    className={`${field} text-sm leading-relaxed`}
                  />
                  <p className="mt-1 text-xs text-slate-500">Location and time are added automatically.</p>
                </div>
              )}

              {isItem && (
                <div className="grid grid-cols-3 gap-2">
                  {(["color", "brand", "marks"] as const).map((k) => (
                    <label key={k} className="text-xs capitalize text-slate-400">
                      {k}
                      <input value={triage[k] ?? ""} onChange={(e) => set(k, e.target.value || null)} className={`${field} text-sm`} />
                    </label>
                  ))}
                </div>
              )}

              {!isItem && (
                <button type="button" onClick={() => setShowDetails((s) => !s)} className="text-sm text-cyan-300">
                  {showDetails ? "Hide details" : "Something wrong? Edit details"}
                </button>
              )}
              {!isItem && showDetails && (
                <div className="space-y-3 rounded-2xl border border-white/10 p-4">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm text-slate-300">
                      Category
                      <select value={triage.category} onChange={(e) => set("category", e.target.value as Triage["category"])} className={field}>
                        {ISSUE_CATEGORY_IDS.map((c) => (
                          <option key={c} value={c} className="bg-slate-900">
                            {ISSUE_CATEGORIES[c].label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm text-slate-300">
                      Send to
                      <select value={triage.routed_to ?? ""} onChange={(e) => set("routed_to", e.target.value)} className={field}>
                        {AUTHORITY_IDS.filter((a) => a !== "lost_found").map((a) => (
                          <option key={a} value={a} className="bg-slate-900">
                            {AUTHORITIES[a].name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="text-sm text-slate-300">
                    Severity
                    <div className="mt-1 grid grid-cols-5 gap-1.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => set("severity", s)}
                          className={`rounded-lg py-2 ${triage.severity === s ? "bg-cyan-400 font-semibold text-slate-900" : "bg-white/5 text-white"}`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Chips
                    label="Also notify"
                    options={AUTHORITY_IDS.filter((a) => a !== triage.routed_to && a !== "lost_found")}
                    labels={(a) => AUTHORITIES[a as keyof typeof AUTHORITIES].name}
                    value={triage.cc}
                    onToggle={(v) => toggle("cc", v)}
                    tone="cyan"
                  />
                  <Chips label="Hazards" options={[...HAZARD_FLAGS]} value={triage.hazard_flags} onToggle={(v) => toggle("hazard_flags", v)} tone="rose" />
                  <Chips label="Blocks access for" options={ACCESS} value={triage.access_impact} onToggle={(v) => toggle("access_impact", v)} tone="amber" />
                  <label className="flex items-center gap-3 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={triage.contains_sensitive}
                      onChange={(e) => set("contains_sensitive", e.target.checked)}
                      className="h-5 w-5 accent-cyan-400"
                    />
                    Photo shows an ID, card, screen, plate or face (blur it for others)
                  </label>
                </div>
              )}

              {!isItem && fixPath({ kind, ...triage }) === "self_fixable" && (
                <p className="rounded-xl bg-white/5 px-3 py-2 text-sm text-slate-200">🎯 Students can help: this also becomes a mission</p>
              )}

              {error && <p className="text-sm text-rose-300">{error}</p>}
              <button
                type="button"
                disabled={saving || !pin || !triage.title.trim()}
                onClick={submit}
                className="w-full rounded-xl bg-cyan-400 py-3.5 text-lg font-semibold text-slate-950 disabled:opacity-40"
              >
                {saving ? "Sending…" : isItem ? "Post it" : `Send to ${authorityName(triage.routed_to).split(" – ")[0]}`}
              </button>
            </>
          )}
        </section>
      )}

      {step === "done" && saved && (
        <section className="space-y-4 pt-2">
          <div className="text-center">
            <div className="text-5xl">✅</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Reported in {elapsed}s</h2>
            <p className="mt-1 text-sm text-slate-300">
              {kind === "lost" && "It's on the map with a search mission. We'll ping you the moment a found item looks like a match."}
              {kind === "found" &&
                (saved.matched
                  ? "Good news: it looks like someone lost this. We've let them know."
                  : "Thanks! We'll match it as soon as the owner reports it.")}
              {kind === "found" &&
                (delivery ? " Another student can claim the delivery mission and carry it in." : " Please take it to the Lost & Found office.")}
              {kind === "issue" &&
                `Sent to ${authorityName(saved.report.routed_to)}${saved.report.cc.length ? `, cc ${saved.report.cc.map(authorityName).join(", ")}` : ""}.${
                  saved.report.fix_path === "self_fixable" ? " It's also a mission other students can help with." : ""
                }`}
            </p>
          </div>
          {kind === "found" && <FinderCard code={saved.code} title={saved.report.title} />}
          {kind === "issue" && saved.report.report_body && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">What they received</p>
              <p className="mt-1 font-medium text-white">{saved.report.report_subject}</p>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-slate-300">{saved.report.report_body}</pre>
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={reset} className="flex-1 rounded-xl border border-white/15 py-3 text-white">
              Report another
            </button>
            <Link href={`/?report=${saved.report.id}`} className="flex-1 rounded-xl bg-white py-3 text-center font-medium text-slate-900">
              See it on the map
            </Link>
          </div>
          <p className="text-center text-[11px] text-slate-500">Signed in as {user.display_name}</p>
        </section>
      )}
    </div>
  );
}

function Chips({
  label,
  options,
  value,
  onToggle,
  tone,
  labels = (o) => o.replace(/_/g, " "),
}: {
  label: string;
  options: string[];
  value: string[];
  onToggle: (v: string) => void;
  tone: "rose" | "amber" | "cyan";
  labels?: (o: string) => string;
}) {
  const on = {
    rose: "border-rose-300 bg-rose-300/15 text-rose-200",
    amber: "border-amber-300 bg-amber-300/15 text-amber-200",
    cyan: "border-cyan-300 bg-cyan-300/15 text-cyan-200",
  }[tone];
  return (
    <div className="text-sm text-slate-300">
      {label}
      <div className="mt-1 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            className={`rounded-full border px-2.5 py-1 text-xs ${value.includes(o) ? on : "border-white/15 bg-white/5 text-white"}`}
          >
            {labels(o)}
          </button>
        ))}
      </div>
    </div>
  );
}
