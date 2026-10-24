"use client";

// PLACEHOLDER until Person A's map-based PinPicker lands. Same props and onChange shape,
// so swapping it in is a one-line import change. Lat/lng text boxes, a few SJSU presets
// and "use my location" are enough to run the demo loop.

import { useEffect, useState } from "react";

export type PinValue = { lat: number; lng: number; radiusM?: number; building?: string };

export const SJSU_SPOTS = [
  { name: "MLK Library", lat: 37.33544, lng: -121.88501 },
  { name: "Student Union", lat: 37.33631, lng: -121.88128 },
  { name: "Engineering Building", lat: 37.3373, lng: -121.88182 },
  { name: "Clark Hall", lat: 37.33604, lng: -121.88219 },
  { name: "Tower Lawn", lat: 37.33536, lng: -121.8838 },
  { name: "Event Center", lat: 37.33509, lng: -121.88024 },
];

type Props = {
  onChange: (v: PinValue) => void;
  /** Lost reports draw an area instead of a point. */
  showRadius?: boolean;
  initial?: PinValue;
};

export default function PinPicker({ onChange, showRadius, initial }: Props) {
  const [lat, setLat] = useState(initial ? String(initial.lat) : "");
  const [lng, setLng] = useState(initial ? String(initial.lng) : "");
  const [radiusM, setRadiusM] = useState(initial?.radiusM ?? 100);
  const [building, setBuilding] = useState<string | undefined>(initial?.building);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    const la = parseFloat(lat);
    const ln = parseFloat(lng);
    if (Number.isFinite(la) && Number.isFinite(ln))
      onChange({ lat: la, lng: ln, radiusM: showRadius ? radiusM : undefined, building });
    // onChange is a prop callback; re-running on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, radiusM, building, showRadius]);

  function pick(s: (typeof SJSU_SPOTS)[number]) {
    setLat(String(s.lat));
    setLng(String(s.lng));
    setBuilding(s.name);
  }

  function locate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLat(p.coords.latitude.toFixed(6));
        setLng(p.coords.longitude.toFixed(6));
        setBuilding(undefined);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {SJSU_SPOTS.map((s) => (
          <button
            key={s.name}
            type="button"
            onClick={() => pick(s)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              building === s.name ? "border-cyan-300 bg-cyan-300/15 text-cyan-200" : "border-white/15 bg-white/5"
            }`}
          >
            {s.name}
          </button>
        ))}
        <button
          type="button"
          onClick={locate}
          className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm"
        >
          {locating ? "Locating…" : "📍 My location"}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-white/60">
          Lat
          <input
            inputMode="decimal"
            value={lat}
            onChange={(e) => {
              setLat(e.target.value);
              setBuilding(undefined);
            }}
            className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
            placeholder="37.3354"
          />
        </label>
        <label className="text-xs text-white/60">
          Lng
          <input
            inputMode="decimal"
            value={lng}
            onChange={(e) => {
              setLng(e.target.value);
              setBuilding(undefined);
            }}
            className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
            placeholder="-121.8850"
          />
        </label>
      </div>
      {showRadius && (
        <label className="block text-sm">
          <span className="flex justify-between text-white/70">
            Somewhere within <b className="text-white">{radiusM} m</b>
          </span>
          <input
            type="range"
            min={25}
            max={500}
            step={25}
            value={radiusM}
            onChange={(e) => setRadiusM(Number(e.target.value))}
            className="mt-2 w-full accent-cyan-300"
          />
        </label>
      )}
    </div>
  );
}
