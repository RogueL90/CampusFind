"use client";

let ctx: AudioContext | null = null;

/** Unlock audio from a user gesture (iOS won't play otherwise). */
export function primeAudio() {
  if (typeof window === "undefined" || !("AudioContext" in window)) return;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
}

/** Two-tone chime: high-low for "blocks", low-high for "caution". */
export function chime(kind: "blocks" | "caution" | "step" = "caution") {
  primeAudio();
  if (!ctx) return;
  const tones = kind === "blocks" ? [880, 587] : kind === "caution" ? [587, 880] : [660];
  const t0 = ctx.currentTime;
  tones.forEach((freq, i) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = t0 + i * 0.18;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.32);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(start);
    osc.stop(start + 0.34);
  });
}
