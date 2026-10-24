"use client";

// Report flow: snap a photo, drop a pin, and Claude does the rest (problem, lost or found item,
// who handles it, and the written report). The student just checks it and taps Send.

import Link from "next/link";
import { useRef, useState } from "react";
import type { MatchScore } from "@/app/api/match/route";
import FinderCard from "@/components/FinderCard";
import PageShell from "@/components/PageShell";
import PinPicker, { type PinValue } from "@/components/map/PinPicker";
import { SolvabilityNote } from "@/components/Solvability";
import { AUTHORITIES, AUTHORITY_IDS, authorityName, ISSUE_CATEGORIES, ISSUE_CATEGORY_IDS, mapCategory } from "@/lib/categories";
import { createMatch, createReport, getCheckinCode, getOpenLostReports, uploadPhoto } from "@/lib/data";
import { fixPath } from "@/lib/fixPath";
import { nearestBuilding } from "@/lib/geo/places";
import { MATCH_THRESHOLD } from "@/lib/matchScore";
import { reportFooter } from "@/lib/reportFooter";
import { resizeImage } from "@/lib/resizeImage";
import { HAZARD_FLAGS, type NewReport, type Report, type ReportKind, type Triage } from "@/lib/types";
import { PRIVATE_LISTING } from "@/lib/visibility";
import { useCurrentUser } from "@/lib/useCurrentUser";

type Step = "photo" | "pin" | "confirm" | "done";
type Saved = { report: Report; matched: number; code: string | null };
type PhotoSource = "camera" | "gallery" | null;

const KIND_LABEL: Record<ReportKind, string> = { issue: "Campus problem", lost: "Lost item", found: "Found item" };

/** Drop a leading "Lost" or "Found" so the question isn't answered before the student picks. */
function itemName(title: string) {
  return title.replace(/^(lost|found)\b[:\s]*/i, "");
}

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

/** `kind` is only sent when the student corrects the AI; otherwise Claude decides. */
async function requestTriage(photo: string | null, note: string, source: PhotoSource, kind: ReportKind | null): Promise<Triage> {
  const res = await fetch("/api/triage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ photo, note, source, kind }),
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
      <ReportFlow />
    </PageShell>
  );
}

function ReportFlow() {
  const user = useCurrentUser();
  const [step, setStep] = useState<Step>("photo");
  const [preview, setPreview] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState("");
  const [pin, setPin] = useState<PinValue | null>(null);
  const [building, setBuilding] = useState("");
  const [when, setWhen] = useState("unsure");
  const [delivery, setDelivery] = useState(false);
  const [listOnMap, setListOnMap] = useState(true);
  /** Set only after the student says whether they lost the item or someone else did. */
  const [itemRole, setItemRole] = useState<"lost" | "found" | null>(null);
  const [triage, setTriage] = useState<Triage | null>(null);
  const [triaging, setTriaging] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const dataUrl = useRef<string | null>(null);
  const source = useRef<PhotoSource>(null);
  const triagePromise = useRef<Promise<Triage | null> | null>(null);

  const detectedItem = !!triage && triage.kind !== "issue";
  // An item is not lost or found until the student says so. The AI only decides that it is an item.
  const kind: ReportKind | null = !triage ? null : triage.kind === "issue" ? "issue" : itemRole;
  const isItem = kind === "lost" || kind === "found";

  function reset() {
    setStep("photo");
    setPreview(null);
    setPhotoUrl(null);
    setNote("");
    setPin(null);
    setBuilding("");
    setWhen("unsure");
    setDelivery(false);
    setListOnMap(true);
    setItemRole(null);
    setTriage(null);
    setShowDetails(false);
    setSaved(null);
    setError(null);
    dataUrl.current = null;
    source.current = null;
    triagePromise.current = null;
  }

  function runTriage(forced: ReportKind | null = null) {
    setTriage(null);
    setTriaging(true);
    setError(null);
    triagePromise.current = requestTriage(dataUrl.current, note, source.current, forced)
      .then((t) => {
        setTriage(t);
        if (forced === "lost" || forced === "found") setItemRole(forced);
        else setItemRole(null);
        return t;
      })
      .catch((e: Error) => {
        setError(e.message);
        return null;
      })
      .finally(() => setTriaging(false));
  }

  /** Upload and Claude's triage start the moment a photo is picked, so the report is usually ready by the time the pin is placed. */
  async function onPhoto(file: File | undefined, from: PhotoSource) {
    if (!file) return;
    startedAt.current = clock();
    source.current = from;
    setPreview(URL.createObjectURL(file));
    setPhotoUrl(null);
    setUploading(true);
    setStep("pin");
    try {
      const blob = await resizeImage(file);
      dataUrl.current = await blobToDataUrl(blob);
      runTriage();
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
    source.current = null;
    runTriage();
    setStep("pin");
  }

  function choosePin(p: PinValue) {
    setPin(p);
    setBuilding(nearestBuilding(p.lat, p.lng) ?? "");
  }

  function chooseItemRole(role: "lost" | "found") {
    setItemRole(role);
    const label = role === "lost" ? "Lost" : "Found";
    setTriage((t) => {
      if (!t) return t;
      const rest = t.title.replace(/^(lost|found)\s*:\s*/i, "");
      const title = `${label}: ${rest}`;
      return { ...t, kind: role, title, report_subject: t.report_subject ? title : t.report_subject };
    });
  }

  async function pinNext() {
    const t = (await triagePromise.current) ?? triage;
    if (t && t.kind !== "issue" && itemRole == null) return;
    setStep("confirm");
  }

  async function submit() {
    if (!triage || !pin) return;
    setSaving(true);
    setError(null);
    const t = triage;
    const kind = t.kind;
    const [lostFrom, lostTo] = kind === "lost" ? windowFor(when) : [null, null];
    const createdAt = new Date().toISOString();
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
      fix_path: fixPath({ ...t, kind }),
      solvable_reason: isItem ? undefined : t.solvable_reason || undefined,
      hazard_flags: isItem ? [] : t.hazard_flags,
      access_impact: isItem ? [] : t.access_impact,
      routed_to: isItem ? "lost_found" : (t.routed_to ?? undefined),
      cc: isItem ? (listOnMap ? [] : [PRIVATE_LISTING]) : t.cc,
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
        public_map: listOnMap,
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
  const pinStatus = triaging
    ? "✨ AI is looking at it…"
    : triage
      ? triage.kind === "issue"
        ? `✨ Campus problem: ${triage.title}`
        : itemRole
          ? `✨ ${KIND_LABEL[itemRole]}: ${triage.title}`
          : `✨ Item: ${itemName(triage.title)}`
      : uploading
        ? "Uploading…"
        : "";

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

      {step === "photo" && (
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">Snap it</h2>
          <p className="text-sm text-slate-400">
            A problem on campus, something you found, or a photo of something you lost. AI works out which one it is, who handles it, and
            writes the report.
          </p>
          <label className="grid aspect-[4/3] w-full cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-cyan-400/40 bg-cyan-400/5 text-center">
            <span>
              <span className="block text-5xl">📷</span>
              <span className="mt-2 block font-medium text-cyan-200">Take photo</span>
            </span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onPhoto(e.target.files?.[0], "camera")}
            />
          </label>
          <label className="block cursor-pointer rounded-xl border border-white/15 bg-white/5 py-3 text-center text-sm text-white">
            🖼️ Choose from gallery
            <input type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0], "gallery")} />
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
              placeholder="e.g. Fence blocking the path by MLK, or I lost my black AirPods case"
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
            <p className="text-sm text-slate-400">{pinStatus}</p>
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
          {detectedItem && (
            <div>
              <p className="text-sm text-slate-200">Did you lose this, or did someone else?</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(
                  [
                    ["lost", "I lost it"],
                    ["found", "Someone else lost it"],
                  ] as const
                ).map(([role, label]) => (
                  <button
                    key={role}
                    type="button"
                    aria-pressed={itemRole === role}
                    onClick={() => chooseItemRole(role)}
                    className={`rounded-xl border px-3 py-3 text-sm ${itemRole === role ? "border-cyan-300 bg-cyan-300/15 font-semibold text-cyan-100" : "border-white/15 bg-white/5 text-white"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
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
          <button
            type="button"
            disabled={!pin || triaging || !triage || (detectedItem && !itemRole)}
            onClick={pinNext}
            className="w-full rounded-xl bg-white py-3 font-medium text-slate-900 disabled:opacity-30"
          >
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
                    ✨ {kind ? KIND_LABEL[kind] : "Item"} · {triage.source === "claude" ? "Claude" : "Demo AI"}
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

              {isItem && (
                <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={listOnMap}
                    onChange={(e) => setListOnMap(e.target.checked)}
                    className="mt-0.5 h-5 w-5 accent-cyan-400"
                  />
                  <span>
                    <span className="block">Show on everyone&apos;s map</span>
                    <span className="block text-xs text-slate-400">
                      On by default. Turn this off to stay anonymous. Only you and Lost &amp; Found staff will see it.
                    </span>
                  </span>
                </label>
              )}

              {!isItem && <SolvabilityNote triage={triage} />}

              {detectedItem && (
                <div>
                  <p className="text-sm text-slate-200">Did you lose this, or did someone else?</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(
                      [
                        ["lost", "I lost it"],
                        ["found", "Someone else lost it"],
                      ] as const
                    ).map(([role, label]) => (
                      <button
                        key={role}
                        type="button"
                        aria-pressed={itemRole === role}
                        onClick={() => chooseItemRole(role)}
                        className={`rounded-xl border px-3 py-3 text-sm ${itemRole === role ? "border-cyan-300 bg-cyan-300/15 font-semibold text-cyan-100" : "border-white/15 bg-white/5 text-white"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-center text-xs text-slate-500">
                {detectedItem ? (
                  <>
                    Not an item? It&apos;s a{" "}
                    <button type="button" onClick={() => runTriage("issue")} className="text-cyan-300 underline-offset-2 hover:underline">
                      campus problem
                    </button>
                  </>
                ) : (
                  <>
                    Not a campus problem? It&apos;s an{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setItemRole(null);
                        setTriage((t) => (t ? { ...t, kind: "found" } : t));
                      }}
                      className="text-cyan-300 underline-offset-2 hover:underline"
                    >
                      item
                    </button>
                  </>
                )}
              </p>

              {error && <p className="text-sm text-rose-300">{error}</p>}
              <button
                type="button"
                disabled={saving || !pin || !triage.title.trim() || (detectedItem && !itemRole)}
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
              {kind === "lost" &&
                (listOnMap
                  ? "It's on everyone's map. We'll ping you the moment a found item looks like a match."
                  : "Only you and Lost & Found staff can see it. We'll ping you the moment a found item looks like a match.")}
              {kind === "found" &&
                (saved.matched
                  ? "Good news: it looks like someone lost this. We've let them know."
                  : "Thanks! We'll match it as soon as the owner reports it.")}
              {kind === "found" &&
                (delivery ? " Another student can claim the delivery mission and carry it in." : " Please take it to the Lost & Found office.")}
              {kind === "found" && !listOnMap && " It stays off the public map."}
              {kind === "issue" &&
                `Sent to ${authorityName(saved.report.routed_to)}${saved.report.cc.length ? `, cc ${saved.report.cc.map(authorityName).join(", ")}` : ""}.${
                  saved.report.fix_path === "self_fixable"
                    ? " It's student solvable, so registered volunteers can claim it for points and service hours."
                    : ""
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
