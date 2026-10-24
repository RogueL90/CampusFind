"use client";

// Report flow: snap a photo, drop a pin, and Claude does the rest (what it is, who handles it,
// and the written report). The student just checks it and taps Send.

import Link from "next/link";
import { useRef, useState } from "react";
import PinPicker, { type PinValue } from "@/components/PinPicker";
import { AUTHORITIES, AUTHORITY_IDS, authorityName, ISSUE_CATEGORIES, ISSUE_CATEGORY_IDS } from "@/lib/categories";
import { fixPath } from "@/lib/fixPath";
import { resizeImage } from "@/lib/resizeImage";
import { HAZARD_FLAGS, type ReportKind, type Triage } from "@/lib/types";

type Step = "photo" | "pin" | "confirm" | "done";
type Saved = {
  report: { id: string; fix_path: string; routed_to: string | null; cc: string[]; report_subject: string | null; report_body: string | null };
  matches: { match_id: string }[];
};

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

/** Wall clock for the "Reported in Ns" timer; only called from event handlers. */
const clock = () => Date.now();

const field = "mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white";

export default function ReportPage() {
  const [step, setStep] = useState<Step>("photo");
  const [kind, setKind] = useState<ReportKind>("issue");
  const [preview, setPreview] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pin, setPin] = useState<PinValue | null>(null);
  const [when, setWhen] = useState("unsure");
  const [atOffice, setAtOffice] = useState(false);
  const [triage, setTriage] = useState<Triage | null>(null);
  const [triaging, setTriaging] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const startedAt = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  const triagePromise = useRef<Promise<Triage | null> | null>(null);

  const isItem = kind !== "issue";

  function reset() {
    setStep("photo");
    setKind("issue");
    setPreview(null);
    setPhotoUrl(null);
    setPin(null);
    setWhen("unsure");
    setAtOffice(false);
    setTriage(null);
    setShowDetails(false);
    setSaved(null);
    setError(null);
    triagePromise.current = null;
  }

  /**
   * Upload starts the moment a photo is picked, and Claude's triage right after, so the
   * report is usually ready by the time the pin is placed.
   */
  function onPhoto(file: File | undefined, k: ReportKind = kind) {
    if (!file) return;
    startedAt.current = clock();
    setPreview(URL.createObjectURL(file));
    setPhotoUrl(null);
    setTriage(null);
    setError(null);
    setUploading(true);
    setTriaging(true);
    triagePromise.current = (async () => {
      try {
        const blob = await resizeImage(file);
        const fd = new FormData();
        fd.append("photo", blob, "photo.jpg");
        const up = await fetch("/api/upload", { method: "POST", body: fd });
        if (!up.ok) throw new Error((await up.json()).error ?? "Upload failed");
        const { url } = (await up.json()) as { url: string };
        setPhotoUrl(url);
        setUploading(false);
        const res = await fetch("/api/triage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoUrl: url, kind: k }),
        });
        if (!res.ok) throw new Error("Couldn't read the photo");
        const t = (await res.json()) as Triage;
        setTriage(t);
        return t;
      } catch (e) {
        setError((e as Error).message);
        return null;
      } finally {
        setUploading(false);
        setTriaging(false);
      }
    })();
    setStep((s) => (s === "photo" ? "pin" : s));
  }

  /** Changing problem/lost/found after the photo re-runs triage with the right framing. */
  function chooseKind(k: ReportKind) {
    setKind(k);
    if (preview && step !== "photo") {
      fetch(preview)
        .then((r) => r.blob())
        .then((b) => onPhoto(new File([b], "photo.jpg", { type: b.type }), k));
    }
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
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          triage,
          photoUrl,
          lat: pin.lat,
          lng: pin.lng,
          radiusM: pin.radiusM,
          building: pin.building,
          lostFrom,
          lostTo,
          atOffice,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't send");
      setSaved(await res.json());
      setElapsed(Math.round((clock() - startedAt.current) / 1000));
      setStep("done");
    } catch (e) {
      setError((e as Error).message);
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
              className="rounded-full border border-white/15 px-3 py-1 text-sm"
            >
              ←
            </button>
          )}
          <div className="flex flex-1 gap-1.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= stepIndex ? "bg-cyan-300" : "bg-white/10"}`} />
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
              className={`rounded-lg py-2 ${kind === k.kind ? "bg-white font-medium text-slate-900" : "text-white/70"}`}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}

      {step === "photo" && (
        <section className="space-y-4">
          <h1 className="text-2xl font-semibold">
            {kind === "lost" ? "Show us what you lost" : kind === "found" ? "Snap what you found" : "Snap the problem"}
          </h1>
          <p className="text-sm text-white/60">
            {kind === "lost"
              ? "Your own photo or a product photo of the same model. AI fills in the details."
              : "AI figures out what it is, who should fix it, and writes the report."}
          </p>
          <label className="grid aspect-square w-full cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-cyan-300/40 bg-cyan-300/5 text-center">
            <span>
              <span className="block text-5xl">📷</span>
              <span className="mt-2 block font-medium text-cyan-200">Take photo</span>
            </span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onPhoto(e.target.files?.[0])}
            />
          </label>
          <label className="block cursor-pointer rounded-xl border border-white/15 bg-white/5 py-3 text-center">
            🖼️ Choose from gallery
            <input type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
          </label>
        </section>
      )}

      {step === "pin" && (
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL
              <img src={preview} alt="Your photo" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
            )}
            <p className="text-sm text-white/60">
              {uploading ? "Uploading…" : triaging ? "✨ AI is looking at your photo…" : triage ? "✨ AI report ready" : ""}
            </p>
          </div>
          <h1 className="text-2xl font-semibold">
            {kind === "lost" ? "Where did you lose it?" : kind === "found" ? "Where did you find it?" : "Where is it?"}
          </h1>
          <PinPicker onChange={setPin} showRadius={kind === "lost"} initial={pin ?? undefined} />
          {kind === "lost" && (
            <div>
              <p className="text-sm text-white/70">
                When? <span className="text-white/40">(optional)</span>
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
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      when === v ? "border-cyan-300 bg-cyan-300/15 text-cyan-200" : "border-white/15 bg-white/5"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {kind === "found" && (
            <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
              <input
                type="checkbox"
                checked={atOffice}
                onChange={(e) => setAtOffice(e.target.checked)}
                className="h-5 w-5 accent-cyan-300"
              />
              I already dropped it at the Lost & Found office
            </label>
          )}
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <button
            type="button"
            disabled={!pin}
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
                  <button type="button" onClick={() => setStep("photo")} className="rounded-xl border border-white/15 px-4 py-2">
                    Try another photo
                  </button>
                </>
              ) : (
                <p className="text-white/60">✨ AI is writing your report…</p>
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
                  <p className="mt-1 text-lg font-semibold leading-snug">
                    {isItem ? "" : `${ISSUE_CATEGORIES[triage.category as keyof typeof ISSUE_CATEGORIES]?.icon ?? ""} `}
                    {triage.title}
                  </p>
                  {triage.identified && <p className="mt-1 text-sm text-white/70">{triage.identified}</p>}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-wide text-white/50">Sending to</p>
                <p className="font-medium">{authorityName(triage.routed_to)}</p>
                {triage.cc.length > 0 && (
                  <p className="text-sm text-white/60">cc {triage.cc.map(authorityName).join(", ")}</p>
                )}
                {!isItem && <p className="mt-1 text-sm text-white/60">{triage.routing_reason}</p>}
                {!isItem && (
                  <p className="mt-2 text-sm">
                    Severity <b>{triage.severity}/5</b>
                    {triage.hazard_flags.length > 0 && (
                      <span className="text-rose-300"> · {triage.hazard_flags.map((h) => h.replace(/_/g, " ")).join(", ")}</span>
                    )}
                  </p>
                )}
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-white/50">Report</p>
                <input
                  aria-label="Report subject"
                  value={triage.report_subject}
                  onChange={(e) => set("report_subject", e.target.value)}
                  className={`${field} font-medium`}
                />
                <textarea
                  aria-label="Report body"
                  value={triage.report_body}
                  onChange={(e) => set("report_body", e.target.value)}
                  rows={7}
                  className={`${field} text-sm leading-relaxed`}
                />
                <p className="mt-1 text-xs text-white/40">Location and time are added automatically.</p>
              </div>

              {isItem && (
                <div className="grid grid-cols-3 gap-2">
                  {(["color", "brand", "marks"] as const).map((k) => (
                    <label key={k} className="text-xs capitalize text-white/60">
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
                    <label className="text-sm text-white/70">
                      Category
                      <select
                        value={triage.category}
                        onChange={(e) => set("category", e.target.value as Triage["category"])}
                        className={field}
                      >
                        {ISSUE_CATEGORY_IDS.map((c) => (
                          <option key={c} value={c} className="bg-slate-900">
                            {ISSUE_CATEGORIES[c].label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm text-white/70">
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
                  <div className="text-sm text-white/70">
                    Severity
                    <div className="mt-1 grid grid-cols-5 gap-1.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => set("severity", s)}
                          className={`rounded-lg py-2 ${triage.severity === s ? "bg-cyan-300 font-semibold text-slate-900" : "bg-white/5"}`}
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
                  <label className="flex items-center gap-3 text-sm text-white/70">
                    <input
                      type="checkbox"
                      checked={triage.contains_sensitive}
                      onChange={(e) => set("contains_sensitive", e.target.checked)}
                      className="h-5 w-5 accent-cyan-300"
                    />
                    Photo shows an ID, card, screen, plate or face (blur it for others)
                  </label>
                </div>
              )}

              {!isItem && fixPath({ kind, ...triage }) === "self_fixable" && (
                <p className="rounded-xl bg-white/5 px-3 py-2 text-sm text-white/80">🎯 Students can help: this also becomes a mission</p>
              )}

              {error && <p className="text-sm text-rose-300">{error}</p>}
              <button
                type="button"
                disabled={saving || !pin || !triage.report_subject.trim()}
                onClick={submit}
                className="w-full rounded-xl bg-cyan-300 py-3.5 text-lg font-semibold text-slate-900 disabled:opacity-40"
              >
                {saving ? "Sending…" : isItem ? "Confirm" : `Send to ${authorityName(triage.routed_to).split(" – ")[0]}`}
              </button>
            </>
          )}
        </section>
      )}

      {step === "done" && saved && (
        <section className="space-y-4 pt-4">
          <div className="text-center">
            <div className="text-5xl">✅</div>
            <h1 className="mt-2 text-2xl font-semibold">Reported in {elapsed}s</h1>
            <p className="mt-1 text-white/70">
              {kind === "lost" && "We'll watch every found item for it and ping you the moment there's a likely match."}
              {kind === "found" &&
                (saved.matches.length
                  ? "Good news: it looks like someone lost this. We've let them know. Please take it to the Lost & Found office."
                  : "Thanks! Please take it to the Lost & Found office. We'll match it as soon as the owner reports it.")}
              {kind === "issue" &&
                `Sent to ${authorityName(saved.report.routed_to)}${
                  saved.report.cc.length ? `, cc ${saved.report.cc.map(authorityName).join(", ")}` : ""
                }.${saved.report.fix_path === "self_fixable" ? " It's also a mission other students can help with." : ""}`}
            </p>
          </div>
          {kind === "issue" && saved.report.report_body && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-wide text-white/50">What they received</p>
              <p className="mt-1 font-medium">{saved.report.report_subject}</p>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-white/80">{saved.report.report_body}</pre>
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={reset} className="flex-1 rounded-xl border border-white/15 py-3">
              Report another
            </button>
            <Link href="/inbox" className="flex-1 rounded-xl bg-white py-3 text-center font-medium text-slate-900">
              Inbox
            </Link>
          </div>
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
    <div className="text-sm text-white/70">
      {label}
      <div className="mt-1 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            className={`rounded-full border px-2.5 py-1 text-xs ${value.includes(o) ? on : "border-white/15 bg-white/5"}`}
          >
            {labels(o)}
          </button>
        ))}
      </div>
    </div>
  );
}
