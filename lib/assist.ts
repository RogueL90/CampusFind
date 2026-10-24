// Turns what a student says or types into access settings ("My needs") or a place ("Where to?").
// Claude when ANTHROPIC_API_KEY is set; keyword rules and fuzzy name matching otherwise. Server-only.

import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CATEGORIES, CATEGORY_BY_ID } from "./geo/campus";
import { BUILDINGS, buildingByName, findAmenityType, findBuilding, type AmenityType } from "./geo/places";
import type { AccessNeed, Category } from "./types";
import { claude, MODEL } from "./vision";

export const MAX_ASSIST_TEXT = 300;

const NEED_IDS = ["wheelchair", "no_stairs", "low_vision", "crutches"] as const satisfies readonly AccessNeed[];
const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [Category, ...Category[]];
const AMENITY_TYPES = ["water"] as const satisfies readonly AmenityType[];

const NEED_PHRASES: Record<AccessNeed, string> = {
  wheelchair: "wheelchair routes",
  no_stairs: "step-free routes",
  low_vision: "clear walking paths",
  crutches: "short, flat routes",
};

export interface AssistState {
  needs: AccessNeed[];
  /** Map categories currently hidden. */
  hidden: Category[];
}

export interface AlertSettings {
  sound?: boolean;
  vibrate?: boolean;
  voice?: boolean;
}

export interface NeedsResult {
  needs: AccessNeed[];
  /** Categories to show; everything else gets hidden. null leaves the filters as they are. */
  focus: Category[] | null;
  alerts: AlertSettings;
  summary: string;
  source: "ai" | "keywords";
}

export type DestinationResult = (
  | { kind: "building"; name: string; short: string }
  | { kind: "amenity"; type: AmenityType }
  | { kind: "unknown" }
) & { source: "ai" | "keywords" };

export const clampText = (text: unknown) => (typeof text === "string" ? text.trim().slice(0, MAX_ASSIST_TEXT) : "");

// ---------------------------------------------------------------------------
// Keyword fallback
// ---------------------------------------------------------------------------

const NEED_RULES: [AccessNeed, RegExp][] = [
  ["wheelchair", /\b(wheel ?chairs?|scooters?|mobility (device|aid)|power ?chair|rollator)\b/],
  ["low_vision", /\b(blind|low[- ]vision|visually|vision|sight(ed)?|can'?t see|white cane|guide dog|clear (walking )?paths?)\b/],
  ["crutches", /\b(crutch(es)?|walker|(?<!white )cane|injur(ed|y)|sprain(ed)?|cast|limp(ing)?|slow(er)? walk(ing|er)?|broke my (leg|ankle|foot))\b/],
  ["no_stairs", /\b(stairs?|steps?|step[- ]free|ramps?|elevators?|lifts?|strollers?|pram|luggage|cart)\b/],
];

const CATEGORY_RULES: [Category, RegExp][] = [
  ["water", /\b(water|fountains?|bottle( filler)?s?|thirsty|drink(ing)?)\b/],
  ["connectivity", /\b(wi-?fi|internet|signal|eduroam|network)\b/],
  ["waste", /\b(trash|garbage|litter|waste|bins?|recycling)\b/],
  ["pests", /\b(pests?|rats?|mice|bugs?|ants|roach(es)?)\b/],
  ["lost_found", /\b(lost|found|missing)\b/],
  ["paths", /\b(barriers?|obstacles?|obstructions?|hazards?|construction|potholes?|paths?|sidewalks?)\b/],
  ["accessibility", /\b(barriers?|obstacles?|obstructions?|access(ibility)?|ramps?|elevators?|doors?)\b/],
];

const NEGATION = /\b(not|no longer|don'?t|do not|doesn'?t|stop|turn off|switch off|remove|drop|hide|without|never mind|no more)\b/;
const SHOW_ALL = /\b(show (me )?(everything|all)|all (pins|categories|reports)|reset (the )?(map|filters?)|clear (the )?filters?)\b/;
const RESET_NEEDS = /\b(reset|clear|remove) (all |my )?(needs|settings)\b|\bno (special )?needs\b|\bi'?m fine\b/;

/** "No stairs" and "without steps" ask for step-free routes; they aren't negations. */
const stripStepPhrases = (clause: string) => clause.replace(/\b(no|without|avoid(ing)?|can'?t (do|use|climb)) (stairs?|steps?)\b/g, " step-free ");

/** True when the sentence talks about an access need, including "I am not in a wheelchair". */
export function mentionsAccessNeed(text: string): boolean {
  return text
    .toLowerCase()
    .split(/[,.;!?]|\bbut\b|\band\b|\balso\b|\bplus\b/)
    .some((raw) => NEED_RULES.some(([, rule]) => rule.test(stripStepPhrases(raw))));
}

export function keywordNeeds(text: string, current: AssistState): NeedsResult {
  const lower = text.toLowerCase();
  const needs = new Set<AccessNeed>(RESET_NEEDS.test(lower) ? [] : current.needs);
  const shown = new Set<Category>();
  const hidden = new Set<Category>();
  const alerts: AlertSettings = {};
  const talkedAboutNeeds = mentionsAccessNeed(lower);

  for (const raw of lower.split(/[,.;!?]|\bbut\b|\band\b|\balso\b|\bplus\b/)) {
    const clause = stripStepPhrases(raw);
    const negated = NEGATION.test(clause);
    for (const [need, rule] of NEED_RULES) {
      if (rule.test(clause)) {
        if (negated) needs.delete(need);
        else needs.add(need);
      }
    }
    for (const [cat, rule] of CATEGORY_RULES) {
      if (rule.test(clause)) (negated ? hidden : shown).add(cat);
    }
    if (/\b(deaf|hard of hearing|can'?t hear)\b/.test(clause)) Object.assign(alerts, { vibrate: true, sound: false, voice: false });
    if (/\b(vibrat\w*|buzz\w*|haptic\w*)\b/.test(clause)) alerts.vibrate = !negated;
    if (/\b(sounds?|chimes?|beeps?|tones?)\b/.test(clause)) alerts.sound = !negated;
    if (/\b(speak|spoken|read (it |them )?(out|aloud)|talk|voice|say)\b/.test(clause)) alerts.voice = !negated;
    if (/\b(quiet|silent|mute)\b/.test(clause)) Object.assign(alerts, { sound: false, voice: false });
  }
  if (needs.has("low_vision") && !current.needs.includes("low_vision")) {
    alerts.voice ??= true;
    alerts.sound ??= true;
  }

  let focus: Category[] | null = null;
  if (SHOW_ALL.test(lower)) focus = [...CATEGORY_IDS];
  else if (talkedAboutNeeds) {
    // A need, or "I am not in a wheelchair", keeps paths and access and drops water, waste and the rest.
    shown.add("paths").add("accessibility");
    focus = CATEGORY_IDS.filter((c) => shown.has(c) && !hidden.has(c));
  } else if (shown.size) {
    if (needs.size) shown.add("paths").add("accessibility");
    focus = CATEGORY_IDS.filter((c) => shown.has(c) && !hidden.has(c));
  } else if (hidden.size) {
    focus = CATEGORY_IDS.filter((c) => !current.hidden.includes(c) && !hidden.has(c));
  }

  const result = { needs: NEED_IDS.filter((n) => needs.has(n)), focus, alerts, source: "keywords" as const };
  return { ...result, summary: summarizeNeeds(result, current) };
}

const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function summarizeNeeds(r: Pick<NeedsResult, "needs" | "focus" | "alerts">, current: AssistState): string {
  const parts: string[] = [];
  const on = r.needs.map((n) => NEED_PHRASES[n]);
  const off = current.needs.filter((n) => !r.needs.includes(n)).map((n) => NEED_PHRASES[n]);
  const alertsOn = (["voice", "sound", "vibrate"] as const).filter((k) => r.alerts[k]);
  const alertWords = { voice: "spoken warnings", sound: "chimes", vibrate: "vibration" };
  if (on.length) parts.push(`${capitalize(list(on))} on${alertsOn.length ? `, with ${list(alertsOn.map((k) => alertWords[k]))}` : ""}.`);
  else if (alertsOn.length) parts.push(`${capitalize(list(alertsOn.map((k) => alertWords[k])))} on.`);
  if (off.length) parts.push(`${capitalize(list(off))} off.`);
  if (r.focus) {
    if (r.focus.length === CATEGORY_IDS.length) parts.push("Showing every pin.");
    else parts.push(`Showing ${list(r.focus.map((c) => CATEGORY_BY_ID[c].label.toLowerCase()))}. Other pins hidden.`);
  }
  return parts.join(" ") || "No changes. Try “I use a wheelchair” or “show water fountains”.";
}

export function keywordDestination(text: string): DestinationResult {
  const type = findAmenityType(text);
  const building = findBuilding(text);
  // "Water fountain in Clark Hall" is a building with a fountain in it; plain "water" is the nearest one.
  if (type && !building) return { kind: "amenity", type, source: "keywords" };
  if (building) return { kind: "building", name: building.name, short: building.short, source: "keywords" };
  return { kind: "unknown", source: "keywords" };
}

// ---------------------------------------------------------------------------
// Claude
// ---------------------------------------------------------------------------

const NeedsSchema = z.object({
  needs: z.array(z.enum(NEED_IDS)).describe("The full set of access needs after this message, not just the changes."),
  focus: z
    .array(z.enum(CATEGORY_IDS))
    .nullable()
    .describe("Map categories to show (everything else is hidden), or null to leave the filters unchanged."),
  sound: z.boolean().nullable().describe("Chime on obstacle alerts; null = unchanged."),
  vibrate: z.boolean().nullable().describe("Vibrate on obstacle alerts; null = unchanged."),
  voice: z.boolean().nullable().describe("Speak obstacle alerts and directions; null = unchanged."),
  summary: z.string().describe("One or two short sentences read back to the student, e.g. “Step-free routes and water on. Other pins hidden.”"),
});

const NEEDS_SYSTEM = `You set up accessibility settings for a San José State University campus map. Students say or type what they need in their own words; you translate that into settings.

Access needs (ids):
- wheelchair: uses a wheelchair, scooter or other mobility device. Routes avoid stairs and anything that blocks a wheelchair.
- no_stairs: wants step-free routes (stroller, luggage, cart, fatigue, or just asked for no stairs).
- low_vision: blind or low vision; wants clear walking paths without overhead or trip hazards.
- crutches: crutches, a cane, a cast, an injury or slower walking.

Map categories (ids): ${CATEGORIES.map((c) => `${c.id} (${c.label})`).join(", ")}.
"Barriers" or "obstacles" means paths and accessibility.

Rules:
- Return the complete set of needs after the message. Keep current needs unless the student removes them ("I don't need step-free anymore", "I am not in a wheelchair").
- When the student mentions an access need, including saying they do not have one, set focus to paths and accessibility only. Add a category they name ("and water"). Hide one they reject. "Show everything" means every category. Leave focus null only when the message says nothing about needs or pins.
- Blind or low vision students should get voice and sound on. Deaf or hard of hearing students should get vibrate on and sound off.
- Summaries are plain, warm and short. Never mention ids or JSON.`;

async function claudeNeeds(text: string, current: AssistState): Promise<NeedsResult> {
  const c = claude();
  if (!c) throw new Error("ANTHROPIC_API_KEY not set");
  const response = await c.beta.messages.parse({
    model: MODEL,
    max_tokens: 1500,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(NeedsSchema) },
    system: [{ type: "text", text: NEEDS_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Current needs: ${current.needs.join(", ") || "none"}. Hidden categories: ${current.hidden.join(", ") || "none"}.\nStudent: "${text}"`,
      },
    ],
  });
  const out = response.parsed_output;
  if (!out) throw new Error(`No structured output (stop_reason ${response.stop_reason})`);
  const alerts: AlertSettings = {};
  if (out.sound !== null) alerts.sound = out.sound;
  if (out.vibrate !== null) alerts.vibrate = out.vibrate;
  if (out.voice !== null) alerts.voice = out.voice;
  const needs = NEED_IDS.filter((n) => out.needs.includes(n));
  const focus = out.focus ? CATEGORY_IDS.filter((c) => out.focus!.includes(c)) : null;
  return { needs, focus: focus?.length ? focus : null, alerts, summary: out.summary.trim().slice(0, 240) || summarizeNeeds({ needs, focus, alerts }, current), source: "ai" };
}

const DestinationSchema = z.object({
  kind: z.enum(["building", "amenity", "unknown"]),
  building: z.string().nullable().describe("Exact full building name from the list when kind is building."),
  amenity: z.enum(AMENITY_TYPES).nullable().describe("Amenity type when kind is amenity (the nearest working one is chosen)."),
});

const DESTINATION_SYSTEM = `You pick a destination on the San José State University campus map from what a student said or typed. Speech recognition often misspells names ("Maquerie" is MacQuarrie Hall, "MLK" is the library).

Buildings (full name, then nicknames):
${BUILDINGS.map((b) => `- ${b.name}${b.short !== b.name || b.aliases.length ? ` (${[b.short, ...b.aliases].filter((n) => n !== b.name).join(", ")})` : ""}`).join("\n")}

Amenities: water (drinking fountains and bottle fillers). "Water", "fountain", "I'm thirsty" or "fill my bottle" means the nearest working one; use kind amenity.

Return kind building with the exact full name from the list, kind amenity, or kind unknown if nothing fits.`;

async function claudeDestination(text: string): Promise<DestinationResult> {
  const c = claude();
  if (!c) throw new Error("ANTHROPIC_API_KEY not set");
  const response = await c.beta.messages.parse({
    model: MODEL,
    max_tokens: 1000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(DestinationSchema) },
    system: [{ type: "text", text: DESTINATION_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Student: "${text}"` }],
  });
  const out = response.parsed_output;
  if (!out) throw new Error(`No structured output (stop_reason ${response.stop_reason})`);
  if (out.kind === "amenity" && out.amenity) return { kind: "amenity", type: out.amenity, source: "ai" };
  if (out.kind === "building" && out.building) {
    const b = buildingByName(out.building) ?? findBuilding(out.building);
    if (b) return { kind: "building", name: b.name, short: b.short, source: "ai" };
  }
  return { kind: "unknown", source: "ai" };
}

export async function interpretNeeds(text: string, current: AssistState): Promise<NeedsResult> {
  if (!text) return keywordNeeds(text, current);
  const keywords = keywordNeeds(text, current);
  try {
    const ai = await claudeNeeds(text, current);
    // The model sometimes leaves every chip on. A sentence about needs always narrows the pins.
    if (mentionsAccessNeed(text) && keywords.focus) {
      const focus = keywords.focus;
      return { ...ai, focus, summary: summarizeNeeds({ needs: ai.needs, focus, alerts: ai.alerts }, current) };
    }
    return ai;
  } catch (err) {
    if (claude()) console.warn("assist needs fell back to keywords:", (err as Error).message);
    return keywords;
  }
}

export async function interpretDestination(text: string): Promise<DestinationResult> {
  if (!text) return { kind: "unknown", source: "keywords" };
  try {
    const ai = await claudeDestination(text);
    return ai.kind === "unknown" ? { ...keywordDestination(text), source: "ai" } : ai;
  } catch (err) {
    if (claude()) console.warn("assist destination fell back to keywords:", (err as Error).message);
    return keywordDestination(text);
  }
}

export function sanitizeState(raw: unknown): AssistState {
  const s = (raw ?? {}) as { needs?: unknown; hidden?: unknown };
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    needs: NEED_IDS.filter((n) => arr(s.needs).includes(n)),
    hidden: CATEGORY_IDS.filter((c) => arr(s.hidden).includes(c)),
  };
}
