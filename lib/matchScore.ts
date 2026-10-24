import type { Report } from "./types";

/** Weights from the Person C spec. They sum to 1. */
export const WEIGHTS = {
  category: 0.3,
  colorBrand: 0.2,
  distance: 0.2,
  time: 0.1,
  photo: 0.2,
} as const;

export const MATCH_THRESHOLD = 0.6;

/** Past the lost circle, the distance score falls to 0 over this many meters. */
const DISTANCE_FALLOFF_M = 400;
/** After the lost window ends, the time score falls to 0 over this many hours. */
const TIME_FALLOFF_H = 72;
/** Used when a lost report has no radius. */
const DEFAULT_RADIUS_M = 100;

export type ScoreBreakdown = {
  category: number;
  colorBrand: number;
  distance: number;
  time: number;
  photo: number;
  total: number;
};

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const tokens = (s: string | null | undefined) => new Set(norm(s).split(" ").filter(Boolean));

/** 1 when the item types match, 0.5 when they share a word ("airpods case" vs "earbuds case"), else 0. */
export function categoryScore(a: string | null | undefined, b: string | null | undefined): number {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = tokens(a);
  const tb = tokens(b);
  const shared = [...ta].filter((t) => tb.has(t)).length;
  const jaccard = shared / new Set([...ta, ...tb]).size;
  if (jaccard >= 0.5) return 1;
  return shared > 0 ? 0.5 : 0;
}

/** Fuzzy equality: "Black" vs "matte black" counts. Unknown on either side gives half credit. */
function softEqual(a: string | null | undefined, b: string | null | undefined): number {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0.5;
  if (na === nb || na.includes(nb) || nb.includes(na)) return 1;
  return 0;
}

export function colorBrandScore(
  lost: { color?: string | null; brand?: string | null },
  found: { color?: string | null; brand?: string | null },
): number {
  return (softEqual(lost.color, found.color) + softEqual(lost.brand, found.brand)) / 2;
}

/** Great-circle distance in meters. */
export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 1 inside the lost circle, falling linearly to 0 at DISTANCE_FALLOFF_M past its edge. */
export function distanceScore(
  lost: { lat: number; lng: number; radius_m?: number | null },
  found: { lat: number; lng: number },
): number {
  const radius = lost.radius_m ?? DEFAULT_RADIUS_M;
  const outside = haversineM(lost, found) - radius;
  if (outside <= 0) return 1;
  return Math.max(0, 1 - outside / DISTANCE_FALLOFF_M);
}

/**
 * 1 when the item was found during or shortly after the lost window, falling to 0 over
 * TIME_FALLOFF_H hours afterwards. Found before the window started: 0.
 * With no window we use the lost report's created_at, minus a day for "lost it yesterday".
 */
export function timeScore(
  lost: { created_at: string; lost_from?: string | null; lost_to?: string | null },
  foundAt: string,
): number {
  const found = Date.parse(foundAt);
  const created = Date.parse(lost.created_at);
  const from = lost.lost_from ? Date.parse(lost.lost_from) : created - 24 * 3600_000;
  const to = lost.lost_to ? Date.parse(lost.lost_to) : created;
  // A little grace before the window: clocks and memories are fuzzy.
  if (found < from - 30 * 60_000) return 0;
  if (found <= to) return 1;
  const hoursAfter = (found - to) / 3600_000;
  return Math.max(0, 1 - hoursAfter / TIME_FALLOFF_H);
}

/** Combine the signals. `photo` is the vision model's 0-1 similarity. */
export function scoreMatch(lost: Report, found: Report, photo: number): ScoreBreakdown {
  const li = lost.item;
  const fi = found.item;
  const s = {
    category: categoryScore(li?.category ?? lost.issue_type, fi?.category ?? found.issue_type),
    colorBrand: colorBrandScore({ color: li?.color, brand: li?.brand }, { color: fi?.color, brand: fi?.brand }),
    distance: distanceScore({ lat: lost.lat, lng: lost.lng, radius_m: li?.radius_m }, found),
    time: timeScore({ created_at: lost.created_at, lost_from: li?.lost_from, lost_to: li?.lost_to }, found.created_at),
    photo: Math.min(1, Math.max(0, photo)),
  };
  const total =
    s.category * WEIGHTS.category +
    s.colorBrand * WEIGHTS.colorBrand +
    s.distance * WEIGHTS.distance +
    s.time * WEIGHTS.time +
    s.photo * WEIGHTS.photo;
  return { ...s, total: Math.round(total * 1000) / 1000 };
}
