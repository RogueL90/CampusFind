"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

export type AskMode = "needs" | "destination";

const PROMPTS: Record<AskMode, { pill: string; icon: string; placeholder: string; label: string }> = {
  needs: { pill: "My needs", icon: "♿", placeholder: "e.g. I use a wheelchair, show water", label: "Describe your access needs" },
  destination: { pill: "Where to?", icon: "📍", placeholder: "e.g. MacQuarrie Hall, water fountain", label: "Where do you want to go?" },
};

interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

interface Recognizer {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognizerCtor = new () => Recognizer;

function recognizerCtor(): RecognizerCtor | null {
  if (typeof window === "undefined" || !window.isSecureContext) return null;
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noopSubscribe = () => () => {};

export default function AskBar({
  busy,
  onSubmit,
}: {
  busy: AskMode | null;
  onSubmit: (mode: AskMode, text: string) => Promise<void> | void;
}) {
  const micSupported = useSyncExternalStore(noopSubscribe, () => recognizerCtor() !== null, () => false);
  const [mode, setMode] = useState<AskMode | null>(null);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const recognizer = useRef<Recognizer | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => recognizer.current?.abort(), []);

  const close = () => {
    recognizer.current?.abort();
    setMode(null);
    setText("");
    setMicError(null);
  };

  const submit = async (m: AskMode, value: string) => {
    const t = value.trim();
    if (!t) return;
    await onSubmit(m, t);
    close();
  };

  const open = (m: AskMode) => {
    setMode(m);
    setText("");
    setMicError(null);
    requestAnimationFrame(() => input.current?.focus());
  };

  const listen = () => {
    const Ctor = recognizerCtor();
    if (!Ctor || !mode) return;
    if (listening) {
      recognizer.current?.stop();
      return;
    }
    const r = new Ctor();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = false;
    let heard = "";
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) heard += t;
        else interim += t;
      }
      setText((heard + interim).trim());
    };
    r.onerror = (e) =>
      setMicError(e.error === "not-allowed" ? "Microphone blocked. Allow it in the browser, or type instead." : e.error === "no-speech" ? "Didn't catch that. Try again." : null);
    r.onend = () => {
      setListening(false);
      recognizer.current = null;
      if (heard.trim()) void submit(mode, heard);
    };
    recognizer.current = r;
    setMicError(null);
    setListening(true);
    r.start();
  };

  if (!mode) {
    return (
      <div className="flex justify-center gap-2">
        {(Object.keys(PROMPTS) as AskMode[]).map((m) => (
          <button
            key={m}
            onClick={() => open(m)}
            disabled={busy !== null}
            className="hud-panel flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-cyan-100 disabled:opacity-60"
          >
            <span aria-hidden>{PROMPTS[m].icon}</span>
            {busy === m ? "Thinking…" : PROMPTS[m].pill}
          </button>
        ))}
      </div>
    );
  }

  const p = PROMPTS[mode];
  return (
    <form
      className="hud-panel mx-auto w-full max-w-md rounded-2xl p-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(mode, text);
      }}
    >
      <div className="mb-1 flex items-center justify-between px-1 font-mono text-[10px] uppercase tracking-widest text-cyan-300">
        <span>
          {p.icon} {p.pill}
        </span>
        <button type="button" onClick={close} className="text-slate-400" aria-label="Close">
          ✕
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          placeholder={listening ? "Listening…" : p.placeholder}
          aria-label={p.label}
          className="min-w-0 flex-1 rounded-xl border border-slate-600/60 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
        />
        {micSupported && (
          <button
            type="button"
            onClick={listen}
            aria-label={listening ? "Stop listening" : "Speak"}
            aria-pressed={listening}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base ${listening ? "animate-pulse bg-rose-500 text-white" : "border border-slate-600/60 text-slate-100"}`}
          >
            🎤
          </button>
        )}
        <button
          type="submit"
          disabled={!text.trim() || busy !== null}
          className="h-9 shrink-0 rounded-xl bg-cyan-400 px-3 text-xs font-semibold text-slate-950 disabled:opacity-50"
        >
          {busy === mode ? "…" : "Go"}
        </button>
      </div>
      {micError && <p className="mt-1 px-1 text-[11px] text-amber-200">{micError}</p>}
      {!micSupported && <p className="mt-1 px-1 text-[10px] text-slate-500">Voice input needs Chrome or Safari on https or localhost. Typing works everywhere.</p>}
    </form>
  );
}
