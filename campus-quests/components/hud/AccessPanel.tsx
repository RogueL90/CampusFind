"use client";

import { ACCESS_NEEDS } from "@/lib/geo/campus";
import type { AccessNeed } from "@/lib/types";

export interface AccessProfile {
  alertsOn: boolean;
  needs: AccessNeed[];
  voice: boolean;
  flat: boolean;
}

export const DEFAULT_ACCESS_PROFILE: AccessProfile = { alertsOn: true, needs: [], voice: true, flat: false };

function Toggle({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-2">
      <span>
        <span className="block text-sm text-white">{label}</span>
        {hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
      </span>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 accent-cyan-400" />
    </label>
  );
}

export default function AccessPanel({
  profile,
  onChange,
  onClose,
}: {
  profile: AccessProfile;
  onChange: (patch: Partial<AccessProfile>) => void;
  onClose: () => void;
}) {
  const toggleNeed = (n: AccessNeed) =>
    onChange({ needs: profile.needs.includes(n) ? profile.needs.filter((x) => x !== n) : [...profile.needs, n] });

  return (
    <div className="absolute inset-0 z-30 flex items-end bg-black/50 sm:items-center sm:justify-center" onClick={onClose}>
      <div
        className="hud-panel w-full rounded-t-2xl p-4 sm:max-w-sm sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Accessibility alerts"
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-mono text-xs uppercase tracking-widest text-cyan-300">Accessibility alerts</h2>
          <button onClick={onClose} className="text-slate-400" aria-label="Close">
            ✕
          </button>
        </div>
        <p className="mb-2 text-[11px] text-slate-400">Private to this phone. Never shown to anyone, no documentation needed.</p>
        <Toggle label="Obstacle alerts" hint="Vibrate and warn within 150 m" on={profile.alertsOn} onChange={(v) => onChange({ alertsOn: v })} />
        <div className="my-1 border-t border-slate-700/60 pt-2 text-[11px] uppercase tracking-wider text-slate-400">What should count as an obstacle?</div>
        {ACCESS_NEEDS.map((n) => (
          <Toggle key={n.id} label={n.label} on={profile.needs.includes(n.id)} onChange={() => toggleNeed(n.id)} />
        ))}
        <div className="my-1 border-t border-slate-700/60" />
        <Toggle label="Read alerts aloud" on={profile.voice} onChange={(v) => onChange({ voice: v })} />
        <Toggle label="Flat 2D map" hint="Easier for screen readers and older phones" on={profile.flat} onChange={(v) => onChange({ flat: v })} />
      </div>
    </div>
  );
}
