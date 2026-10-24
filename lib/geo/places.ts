import * as turf from "@turf/turf";
import type { Feature, LineString } from "geojson";
import placesData from "./data/campus-places.json";
import type { LngLat } from "./campus";

/**
 * Campus places for navigation. Buildings and mapped entrances come from the OpenStreetMap snapshot
 * (scripts/fetch-campus-osm.mjs). Nicknames, step-free verifications and water fountains are curated
 * demo data: OpenStreetMap has no fountains on this campus.
 */

export interface Building {
  name: string;
  short: string;
  aliases: string[];
  center: LngLat;
  outline: LngLat[];
}

export interface Entrance {
  id: string;
  building: string;
  pos: LngLat;
  label: string;
  /** true = step-free, false = has steps, null = unknown. */
  stepFree: boolean | null;
  /** Minutes before page load that someone last confirmed it step-free. */
  verifiedMinAgo: number | null;
  source: "osm" | "campus";
}

export type AmenityType = "water";

export interface Amenity {
  id: string;
  type: AmenityType;
  label: string;
  building: string;
  pos: LngLat;
}

type RawPlaces = {
  buildings: { name: string; center: number[]; outline: number[][] }[];
  entrances: { building: string; pos: number[]; kind: string; label: string | null; wheelchair: string | null }[];
};
const raw = placesData as RawPlaces;

const NICKNAMES: Record<string, [short: string, ...aliases: string[]]> = {
  "Doctor Martin Luther King Junior Library": ["MLK Library", "mlk", "king library", "library", "martin luther king library"],
  "Diaz Compean Student Union": ["Student Union", "su", "union", "student union"],
  "Robert D. Clark Hall": ["Clark Hall", "clark"],
  "MacQuarrie Hall": ["MacQuarrie Hall", "mq", "mqh", "macquarrie", "mac quarrie"],
  "Spartan Recreation and Aquatic Center": ["SRAC", "srac", "rec center", "gym", "aquatic center"],
  "Washington Square Hall": ["Washington Square Hall", "wsq"],
  "Central Classroom Building": ["Central Classroom Building", "ccb"],
  "Dudley Moorhead Hall": ["Dudley Moorhead Hall", "dmh"],
  "Hugh Gillis Hall": ["Hugh Gillis Hall", "hgh"],
  "Dwight Bentel Hall": ["Dwight Bentel Hall", "dbh"],
  "Boccardo Business Center": ["Boccardo Business Center", "bbc", "business center"],
  "Business Tower": ["Business Tower", "bt"],
  "Yoshihiro Uchida Hall": ["Yoshihiro Uchida Hall", "uchida", "yuh"],
  "Interdisciplinary Science Building": ["Interdisciplinary Science Building", "isb"],
  "Industrial Studies Building": ["Industrial Studies Building", "is building"],
  "Event Center": ["Event Center", "provident credit union event center"],
  "Dining Commons": ["Dining Commons", "dining", "dining hall"],
  "Student Health Center": ["Student Health Center", "health center"],
  "Student Wellness Center": ["Student Wellness Center", "wellness center"],
  "Administration Building": ["Administration Building", "admin"],
  "Tower Hall": ["Tower Hall", "tower"],
  "Science Building": ["Science Building"],
  "Duncan Hall": ["Duncan Hall", "dh"],
  "Music Building": ["Music Building", "music"],
  "Art Building": ["Art Building", "art"],
  "Joe West Hall": ["Joe West Hall", "joe west"],
  "Susan and Phil Hammer Theatre Center": ["Hammer Theatre", "hammer theatre"],
};

export const BUILDINGS: Building[] = raw.buildings.map((b) => {
  const [short, ...aliases] = NICKNAMES[b.name] ?? [b.name];
  return { name: b.name, short, aliases, center: b.center as LngLat, outline: b.outline as LngLat[] };
});

const BY_NAME = new Map(BUILDINGS.flatMap((b) => [[b.short, b] as const, [b.name, b] as const]));
/** Full OSM name or short name ("Clark Hall"). */
export const buildingByName = (name: string) => BY_NAME.get(name) ?? null;

/** Step-free entrances the campus has confirmed (demo data). */
const CAMPUS_ENTRANCES: Omit<Entrance, "id" | "source">[] = [
  { building: "Robert D. Clark Hall", label: "East entrance", pos: [-121.881895, 37.336197], stepFree: true, verifiedMinAgo: 180 },
  { building: "Diaz Compean Student Union", label: "Northeast doors (automatic opener)", pos: [-121.879599, 37.336804], stepFree: true, verifiedMinAgo: 40 },
  { building: "Doctor Martin Luther King Junior Library", label: "4th Street entrance", pos: [-121.884673, 37.335263], stepFree: true, verifiedMinAgo: 95 },
  { building: "MacQuarrie Hall", label: "North entrance (Paseo de San Carlos)", pos: [-121.881814, 37.333878], stepFree: true, verifiedMinAgo: null },
  { building: "MacQuarrie Hall", label: "South entrance (7th Street side)", pos: [-121.881793, 37.333182], stepFree: true, verifiedMinAgo: 25 },
];

const SIDES = ["North", "Northeast", "East", "Southeast", "South", "Southwest", "West", "Northwest"];
function sideOf(b: Building, pos: LngLat): string {
  const bearing = (turf.bearing(b.center, pos) + 360) % 360;
  return SIDES[Math.round(bearing / 45) % 8];
}

const ENTRANCES: Entrance[] = (() => {
  const out: Entrance[] = CAMPUS_ENTRANCES.map((e, i) => ({ ...e, id: `campus-${i}`, source: "campus" }));
  raw.entrances.forEach((e, i) => {
    const b = BY_NAME.get(e.building);
    if (!b) return;
    const pos = e.pos as LngLat;
    if (out.some((c) => c.building === e.building && turf.distance(c.pos, pos, { units: "meters" }) < 8)) return;
    const side = sideOf(b, pos);
    out.push({
      id: `osm-${i}`,
      building: e.building,
      pos,
      label: e.label ?? (e.kind === "main" ? `Main entrance (${side.toLowerCase()})` : `${side} ${e.kind === "approach" ? "side" : "entrance"}`),
      stepFree: e.wheelchair === "yes" ? true : e.wheelchair === "no" ? false : null,
      verifiedMinAgo: null,
      source: "osm",
    });
  });
  return out;
})();

/** Verified step-free first, then mapped entrances, then approach points. */
export function entrancesFor(building: string): Entrance[] {
  const rank = (e: Entrance) => (e.verifiedMinAgo !== null ? 0 : e.stepFree ? 1 : e.source === "campus" ? 2 : e.label.includes("side") ? 4 : 3);
  return ENTRANCES.filter((e) => e.building === building).sort((a, b) => rank(a) - rank(b));
}

const FOUNTAINS: { id: string; building: string; label: string; pos?: LngLat }[] = [
  { id: "w-mlk", building: "Doctor Martin Luther King Junior Library", label: "Bottle filler, MLK Library 1st floor" },
  { id: "w-su", building: "Diaz Compean Student Union", label: "Bottle filler, Student Union 2nd floor", pos: [-121.88005, 37.33672] },
  { id: "w-clark", building: "Robert D. Clark Hall", label: "Bottle filler, Clark Hall lobby" },
  { id: "w-srac", building: "Spartan Recreation and Aquatic Center", label: "Bottle filler, SRAC lobby", pos: [-121.88002, 37.33425] },
  { id: "w-tower", building: "Tower Hall", label: "Drinking fountain, Tower Hall" },
  { id: "w-ccb", building: "Central Classroom Building", label: "Bottle filler, CCB 1st floor" },
  { id: "w-wsq", building: "Washington Square Hall", label: "Drinking fountain, Washington Square Hall" },
  { id: "w-hgh", building: "Hugh Gillis Hall", label: "Bottle filler, Hugh Gillis Hall" },
  { id: "w-mqh", building: "MacQuarrie Hall", label: "Bottle filler, MacQuarrie Hall lobby" },
  { id: "w-duncan", building: "Duncan Hall", label: "Drinking fountain, Duncan Hall" },
  { id: "w-dining", building: "Dining Commons", label: "Bottle filler, Dining Commons" },
  { id: "w-event", building: "Event Center", label: "Drinking fountain, Event Center" },
  { id: "w-bbc", building: "Boccardo Business Center", label: "Bottle filler, Boccardo Business Center" },
  { id: "w-isb", building: "Interdisciplinary Science Building", label: "Bottle filler, ISB lobby" },
];

export const AMENITIES: Amenity[] = FOUNTAINS.flatMap((f) => {
  const pos = f.pos ?? entrancesFor(f.building)[0]?.pos ?? BY_NAME.get(f.building)?.center;
  return pos ? [{ id: f.id, type: "water" as const, label: f.label, building: f.building, pos }] : [];
});

export const AMENITY_LABELS: Record<AmenityType, string> = { water: "water fountain or bottle filler" };

/** Building the point is inside, else the closest one within `maxM`. Returns the short name. */
export function nearestBuilding(lat: number, lng: number, maxM = 40): string | null {
  const pt = turf.point([lng, lat]);
  let best: { b: Building; d: number } | null = null;
  for (const b of BUILDINGS) {
    const poly = turf.polygon([b.outline]);
    if (turf.booleanPointInPolygon(pt, poly)) return b.short;
    const d = turf.pointToLineDistance(pt, turf.polygonToLine(poly) as Feature<LineString>, { units: "meters" });
    if (d <= maxM && (!best || d < best.d)) best = { b, d };
  }
  return best?.b.short ?? null;
}

// ---------------------------------------------------------------------------
// Fuzzy matching ("Maquerie hall" -> MacQuarrie Hall)
// ---------------------------------------------------------------------------

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(the|to|take me|go|navigate|directions|please|i want|want|get|me|nearest|closest)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

const similarity = (a: string, b: string) => (a && b ? 1 - levenshtein(a, b) / Math.max(a.length, b.length) : 0);
const GENERIC = /\b(hall|building|center|centre)\b/g;

function scoreName(query: string, candidate: string): number {
  const c = normalize(candidate);
  if (!c) return 0;
  if (query === c) return 1;
  const core = (s: string) => s.replace(GENERIC, "").replace(/\s+/g, " ").trim();
  const qc = core(query);
  const cc = core(c);
  let best = Math.max(similarity(query, c), qc && cc ? similarity(qc, cc) : 0);
  // Every query word close to some word of the name, e.g. "clark" in "robert d clark hall".
  const qWords = qc.split(" ").filter((w) => w.length > 1);
  const cWords = cc.split(" ").filter(Boolean);
  if (qWords.length && cWords.length) {
    const perWord = qWords.map((w) => Math.max(...cWords.map((x) => similarity(w, x))));
    best = Math.max(best, (perWord.reduce((s, v) => s + v, 0) / perWord.length) * 0.95);
  }
  return best;
}

/** Best building for free text, or null when nothing is close enough. */
export function findBuilding(text: string, minScore = 0.72): Building | null {
  const q = normalize(text);
  if (!q) return null;
  let best: { b: Building; s: number } | null = null;
  for (const b of BUILDINGS) {
    const s = Math.max(...[b.name, b.short, ...b.aliases].map((n) => scoreName(q, n)));
    if (!best || s > best.s) best = { b, s };
  }
  return best && best.s >= minScore ? best.b : null;
}

const AMENITY_WORDS: Record<AmenityType, RegExp> = {
  water: /\b(water|fountains?|bottle|refill|fill(er)?|drink(ing)?|thirsty|hydrat\w*)\b/,
};

export function findAmenityType(text: string): AmenityType | null {
  const t = text.toLowerCase();
  for (const [type, re] of Object.entries(AMENITY_WORDS) as [AmenityType, RegExp][]) if (re.test(t)) return type;
  return null;
}
