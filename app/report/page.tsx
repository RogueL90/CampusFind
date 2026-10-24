"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import PinPicker, { type PinValue } from "@/components/PinPicker";
import { fixPath } from "@/lib/fixPath";
import { resizeImage } from "@/lib/resizeImage";
import { CATEGORIES, HAZARD_FLAGS, type ReportKind, type Triage } from "@/lib/types";

type Step = "type" | "photo" | "pin" | "confirm" | "done";
type Saved = { report: { id: string; fix_path: string; routed_to: string | null }; matches: { match_id: string }[] };

const KINDS: { kind: ReportKind; label: string; hint: string; emoji: string }[] = [
  { kind: "issue", label: "Report an issue", hint: "Slow Wi-Fi, broken filler, pothole, trash", emoji: "⚠️" },
  { kind: "lost", label: "I lost something", hint: "Photo + rough area, we watch for it", emoji: "🔍" },
  { kind: "found", label: "I found something", hint: "Snap it, pin it, bring it to Lost & Found", emoji: "🎒" },
];

const AUTHORITIES = ["Facilities", "IT", "Grounds", "Housing"];
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
  const [step, setStep] = useState<Step>("type");
  const [kind, setKind] = useState<ReportKind>("issue");
  const [preview, setPreview] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState("");
  const [pin, setPin] = useState<PinValue | null>(null);
  const [when, setWhen] = useState("unsure");
  const [atOffice, setAtOffice] = useState(false);
  const [triage, setTriage] = useState<Triage | null>(null);
  const [triaging, setTriaging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const startedAt = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  const uploadPromise = useRef<Promise<string | null> | null>(null);
  const triagePromise = useRef<Promise<Triage | null> | null>(null);

  const isItem = kind !== "issue";

  function reset() {
    setStep("type");
    setPreview(null);
    setPhotoUrl(null);
    setNote("");
    setPin(null);
    setWhen("unsure");
    setAtOffice(false);
    setTriage(null);
    setSaved(null);
    setError(null);
    uploadPromise.current = null;
    triagePromise.current = null;
  }

  function chooseKind(k: ReportKind) {
    setKind(k);
    startedAt.current = clock();
    setStep("photo");
  }

  /** Upload starts the moment a photo is picked, so it's done by the time they tap Next. */
  function onPhoto(file: File | undefined) {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setPhotoUrl(null);
    setError(null);
    setUploading(true);
    uploadPromise.current = (async () => {
      try {
        const blob = await resizeImage(file);
        const fd = new FormData();
        fd.append("photo", blob, "photo.jpg");
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed");
        const { url } = (await res.json()) as { url: string };
        setPhotoUrl(url);
        return url;
      } catch (e) {
        setError((e as Error).message);
        return null;
      } finally {
        setUploading(false);
      }
    })();
  }

  /** Triage runs while the student places the pin. */
  function photoNext() {
    setStep("pin");
    setTriaging(true);
    triagePromise.current = (async () => {
      const url = await uploadPromise.current;
      try {
        const res = await fetch("/api/triage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoUrl: url, note, kind }),
        });
        const t = (await res.json()) as Triage;
        setTriage(t);
        return t;
      } catch {
        setError("AI couldn't read the photo. Fill in the details below.");
        return null;
      } finally {
        setTriaging(false);
      }
    })();
  }

  async function pinNext() {
    setStep("confirm");
    const t = await triagePromise.current;
    if (!t)
      setTriage((cur) =>
        cur ?? {
          category: isItem ? "lost_found" : "waste",
          issue_type: isItem ? "unknown_item" : "other",
          severity: isItem ? 1 : 3,
          title: "",
          hazard_flags: [],
          access_impact: [],
          routed_to: isItem ? "Lost & Found office" : null,
          contains_sensitive: false,
          color: null,
          brand: null,
          marks: null,
        },
      );
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
          note: note || null,
          lat: pin.lat,
          lng: pin.lng,
          radiusM: pin.radiusM,
          building: pin.building,
          lostFrom,
          lostTo,
          atOffice,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't save");
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
  const toggle = (k: "hazard_flags" | "access_impact", v: string) =>
    setTriage((t) =>
      t ? { ...t, [k]: t[k].includes(v) ? t[k].filter((x) => x !== v) : [...t[k], v] } : t,
    );

  const stepIndex = ["type", "photo", "pin", "confirm"].indexOf(step);

  return (
    <div className="space-y-5">
      {step !== "done" && (
        <div className="flex items-center gap-3">
          {step !== "type" && (
            <button
              type="button"
              aria-label="Back"
              onClick={() => setStep((["type", "photo", "pin"] as Step[])[stepIndex - 1] ?? "type")}
              className="rounded-full border border-white/15 px-3 py-1 text-sm"
            >
              ←
            </button>
          )}
          <div className="flex flex-1 gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= stepIndex ? "bg-cyan-300" : "bg-white/10"}`} />
            ))}
          </div>
        </div>
      )}

      {step === "type" && (
        <section className="space-y-3">
          <h1 className="text-2xl font-semibold">What are you reporting?</h1>
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              onClick={() => chooseKind(k.kind)}
              className="flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-left active:scale-[0.99]"
            >
              <span className="text-3xl">{k.emoji}</span>
              <span>
                <span className="block font-medium">{k.label}</span>
                <span className="block text-sm text-white/60">{k.hint}</span>
              </span>
            </button>
          ))}
        </section>
      )}

      {step === "photo" && (
        <section className="space-y-4">
          <h1 className="text-2xl font-semibold">
            {kind === "lost" ? "Add a photo of it" : kind === "found" ? "Snap the item" : "Snap the problem"}
          </h1>
          {kind === "lost" && (
            <p className="text-sm text-white/60">No photo of your own? A product photo of the same model works too.</p>
          )}
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL
            <img src={preview} alt="Your photo" className="aspect-square w-full rounded-2xl object-cover" />
          ) : (
            <div className="grid aspect-square w-full place-items-center rounded-2xl border border-dashed border-white/20 text-white/40">
              No photo yet
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="cursor-pointer rounded-xl bg-cyan-300 py-3 text-center font-medium text-slate-900">
              📷 {preview ? "Retake" : "Take photo"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => onPhoto(e.target.files?.[0])}
              />
            </label>
            <label className="cursor-pointer rounded-xl border border-white/15 bg-white/5 py-3 text-center">
              🖼️ Gallery
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
            </label>
          </div>
          <label className="block text-sm text-white/70">
            Anything to add? <span className="text-white/40">(optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={isItem ? "black AirPods case, smiley sticker" : "trash overflowing by the entrance"}
              className={field}
            />
          </label>
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <button
            type="button"
            disabled={!preview}
            onClick={photoNext}
            className="w-full rounded-xl bg-white py-3 font-medium text-slate-900 disabled:opacity-30"
          >
            {uploading ? "Uploading… Next" : "Next"}
          </button>
        </section>
      )}

      {step === "pin" && (
        <section className="space-y-4">
          <h1 className="text-2xl font-semibold">
            {kind === "lost" ? "Where did you lose it?" : kind === "found" ? "Where did you find it?" : "Where is it?"}
          </h1>
          <PinPicker onChange={setPin} showRadius={kind === "lost"} initial={pin ?? undefined} />
          {kind === "lost" && (
            <div>
              <p className="text-sm text-white/70">When? <span className="text-white/40">(optional)</span></p>
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
              <input type="checkbox" checked={atOffice} onChange={(e) => setAtOffice(e.target.checked)} className="h-5 w-5 accent-cyan-300" />
              I already dropped it at the Lost & Found office
            </label>
          )}
          <p className="text-xs text-white/50">{triaging ? "✨ AI is reading your photo…" : triage ? "✨ AI details ready" : ""}</p>
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
          <div className="flex items-end justify-between">
            <h1 className="text-2xl font-semibold">Look right?</h1>
            {triage?.source && (
              <span className="rounded-full bg-cyan-300/15 px-2 py-0.5 text-xs text-cyan-200">
                ✨ filled by {triage.source === "mock" ? "demo AI" : triage.source === "eaiser" ? "EAiSER" : "AI"}
              </span>
            )}
          </div>
          {!triage ? (
            <p className="py-10 text-center text-white/60">✨ AI is filling in the details…</p>
          ) : (
            <>
              <div className="flex gap-3">
                {preview && (
                  // eslint-disable-next-line @next/next/no-img-element -- local object URL
                  <img src={preview} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
                )}
                <label className="flex-1 text-sm text-white/70">
                  Title
                  <input value={triage.title} onChange={(e) => set("title", e.target.value)} className={field} />
                </label>
              </div>

              {isItem ? (
                <div className="grid grid-cols-2 gap-3">
                  <label className="col-span-2 text-sm text-white/70">
                    Item
                    <input value={triage.issue_type.replace(/_/g, " ")} onChange={(e) => set("issue_type", e.target.value.trim().replace(/\s+/g, "_").toLowerCase())} className={field} />
                  </label>
                  <label className="text-sm text-white/70">
                    Color
                    <input value={triage.color ?? ""} onChange={(e) => set("color", e.target.value || null)} className={field} />
                  </label>
                  <label className="text-sm text-white/70">
                    Brand
                    <input value={triage.brand ?? ""} onChange={(e) => set("brand", e.target.value || null)} className={field} />
                  </label>
                  <label className="col-span-2 text-sm text-white/70">
                    Marks (stickers, case, engraving)
                    <input value={triage.marks ?? ""} onChange={(e) => set("marks", e.target.value || null)} className={field} />
                  </label>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm text-white/70">
                      Category
                      <select value={triage.category} onChange={(e) => set("category", e.target.value as Triage["category"])} className={field}>
                        {CATEGORIES.filter((c) => c !== "lost_found").map((c) => (
                          <option key={c} value={c} className="bg-slate-900">{c}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm text-white/70">
                      Goes to
                      <select value={triage.routed_to ?? ""} onChange={(e) => set("routed_to", e.target.value || null)} className={field}>
                        <option value="" className="bg-slate-900">EAiSER decides</option>
                        {AUTHORITIES.map((a) => (
                          <option key={a} value={a} className="bg-slate-900">{a}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="block text-sm text-white/70">
                    Type
                    <input value={triage.issue_type.replace(/_/g, " ")} onChange={(e) => set("issue_type", e.target.value.trim().replace(/\s+/g, "_").toLowerCase())} className={field} />
                  </label>
                  <div className="text-sm text-white/70">
                    Severity
                    <div className="mt-1 grid grid-cols-5 gap-1.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <button key={s} type="button" onClick={() => set("severity", s)}
                          className={`rounded-lg py-2 ${triage.severity === s ? "bg-cyan-300 font-semibold text-slate-900" : "bg-white/5"}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Chips label="Hazards" options={[...HAZARD_FLAGS]} value={triage.hazard_flags} onToggle={(v) => toggle("hazard_flags", v)} tone="rose" />
                  <Chips label="Blocks access for" options={ACCESS} value={triage.access_impact} onToggle={(v) => toggle("access_impact", v)} tone="amber" />
                  <FixPathBadge path={fixPath({ kind, ...triage })} />
                </div>
              )}

              <label className="flex items-center gap-3 text-sm text-white/70">
                <input type="checkbox" checked={triage.contains_sensitive} onChange={(e) => set("contains_sensitive", e.target.checked)} className="h-5 w-5 accent-cyan-300" />
                Photo shows an ID, card, screen or face (blur it for others)
              </label>

              {error && <p className="text-sm text-rose-300">{error}</p>}
              <button
                type="button"
                disabled={saving || !triage.title.trim()}
                onClick={submit}
                className="w-full rounded-xl bg-cyan-300 py-3.5 text-lg font-semibold text-slate-900 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Confirm"}
              </button>
            </>
          )}
        </section>
      )}

      {step === "done" && saved && (
        <section className="space-y-4 pt-6 text-center">
          <div className="text-5xl">✅</div>
          <h1 className="text-2xl font-semibold">Reported in {elapsed}s</h1>
          <p className="text-white/70">
            {kind === "lost" && "We'll watch every found item for it and ping you the moment there's a likely match."}
            {kind === "found" &&
              (saved.matches.length
                ? "Good news: it looks like someone lost this. We've let them know. Please take it to the Lost & Found office."
                : "Thanks! Please take it to the Lost & Found office. We'll match it as soon as the owner reports it.")}
            {kind === "issue" &&
              `Sent to ${saved.report.routed_to ?? "the right campus team"}. ${
                saved.report.fix_path === "self_fixable" ? "It's also a mission on the map other students can help with." : ""
              }`}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={reset} className="flex-1 rounded-xl border border-white/15 py-3">
              Report another
            </button>
            <Link href="/inbox" className="flex-1 rounded-xl bg-white py-3 font-medium text-slate-900">
              Inbox
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

function Chips({ label, options, value, onToggle, tone }: { label: string; options: string[]; value: string[]; onToggle: (v: string) => void; tone: "rose" | "amber" }) {
  const on = tone === "rose" ? "border-rose-300 bg-rose-300/15 text-rose-200" : "border-amber-300 bg-amber-300/15 text-amber-200";
  return (
    <div className="text-sm text-white/70">
      {label}
      <div className="mt-1 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button key={o} type="button" onClick={() => onToggle(o)}
            className={`rounded-full border px-2.5 py-1 text-xs ${value.includes(o) ? on : "border-white/15 bg-white/5"}`}>
            {o.replace(/_/g, " ")}
          </button>
        ))}
      </div>
    </div>
  );
}

function FixPathBadge({ path }: { path: string }) {
  const text =
    path === "self_fixable"
      ? "🎯 Students can help: this becomes a mission"
      : "🛠️ Staff fix: goes to the campus authority";
  return <p className="rounded-xl bg-white/5 px-3 py-2 text-sm text-white/80">{text}</p>;
}
