// Triage and photo comparison. Server-only.
//
// Order of preference: EAiSER's API (EAISER_API_URL), then OpenAI (OPENAI_API_KEY), then
// Gemini (GEMINI_API_KEY), then a keyword mock so the demo works with no keys at all.
// Every backend is normalized to the same Triage shape.

import { SELF_FIX_ALLOWLIST } from "./fixPath";
import { CATEGORIES, HAZARD_FLAGS, type Category, type ReportKind, type Triage } from "./types";

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
export const AUTHORITIES = ["Facilities", "IT", "Grounds", "Housing", "Lost & Found office"];

const TRIAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "category",
    "issue_type",
    "severity",
    "title",
    "hazard_flags",
    "access_impact",
    "routed_to",
    "contains_sensitive",
    "color",
    "brand",
    "marks",
  ],
  properties: {
    category: { type: "string", enum: CATEGORIES },
    issue_type: { type: "string" },
    severity: { type: "integer" },
    title: { type: "string" },
    hazard_flags: { type: "array", items: { type: "string", enum: [...HAZARD_FLAGS] } },
    access_impact: { type: "array", items: { type: "string" } },
    routed_to: { type: ["string", "null"] },
    contains_sensitive: { type: "boolean" },
    color: { type: ["string", "null"] },
    brand: { type: ["string", "null"] },
    marks: { type: ["string", "null"] },
  },
} as const;

function triagePrompt(kind: ReportKind, note: string | null) {
  const item = kind !== "issue";
  return `You triage campus reports at San Jose State University from a single photo.
Report kind: ${kind}${item ? ` (a ${kind} personal item)` : " (a campus problem)"}.
${note ? `Student's note: "${note}"` : "No note."}

Return JSON only, matching the schema.
- category: one of ${CATEGORIES.join(", ")}.${item ? ' Use "lost_found" for this report.' : ""}
- issue_type: short snake_case. ${
    item
      ? 'The item type, e.g. "airpods_case", "water_bottle", "student_id_card", "laptop", "keys".'
      : `Prefer one of: ${[...SELF_FIX_ALLOWLIST].join(", ")}, overflowing_bin, pothole, cracked_sidewalk, construction_zone, broken_elevator, blocked_ramp, broken_door_button, rats, insects.`
  }
- severity: 1 (cosmetic) to 5 (dangerous or blocks access).${item ? " Use 1 for items." : ""}
- title: under 60 characters, plain, e.g. "${item ? "Black AirPods Pro case with a smiley sticker" : "Overflowing trash can by the SU entrance"}".
- hazard_flags: any of ${HAZARD_FLAGS.join(", ")} that apply, else [].
- access_impact: who this blocks, from wheelchair, low_vision, no_stairs, crutches; [] if none.
- routed_to: ${item ? '"Lost & Found office"' : `the campus authority, one of ${AUTHORITIES.slice(0, 4).join(", ")}`}.
- contains_sensitive: true if the photo shows an ID card, payment card, a screen with personal info, or a face.
- color, brand, marks: ${item ? "the item's main color, brand if visible, and identifying marks (stickers, cases, engravings, damage)" : "null"}.`;
}

/** Coerce whatever a backend returned into a valid Triage. */
export function normalizeTriage(raw: Record<string, unknown>, kind: ReportKind, source: Triage["source"]): Triage {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const item = kind !== "issue";
  const category: Category = item
    ? "lost_found"
    : CATEGORIES.includes(raw.category as Category) && raw.category !== "lost_found"
      ? (raw.category as Category)
      : "waste";
  const sev = Math.round(Number(raw.severity));
  return {
    category,
    issue_type: (str(raw.issue_type) ?? (item ? "unknown_item" : "other")).toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    severity: item ? 1 : Number.isFinite(sev) ? Math.min(5, Math.max(1, sev)) : 3,
    title: str(raw.title) ?? (item ? `${kind === "lost" ? "Lost" : "Found"} item` : "Campus issue"),
    hazard_flags: arr(raw.hazard_flags),
    access_impact: arr(raw.access_impact),
    routed_to: item ? "Lost & Found office" : str(raw.routed_to),
    contains_sensitive: raw.contains_sensitive === true,
    color: item ? str(raw.color) : null,
    brand: item ? str(raw.brand) : null,
    marks: item ? str(raw.marks) : null,
    source,
  };
}

// ---------- backends ----------

async function eaiserTriage(photoUrl: string, note: string | null, kind: ReportKind) {
  const res = await fetch(process.env.EAISER_API_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.EAISER_API_KEY ? { Authorization: `Bearer ${process.env.EAISER_API_KEY}` } : {}),
    },
    body: JSON.stringify({ image_url: photoUrl, note, kind }),
  });
  if (!res.ok) throw new Error(`EAiSER ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

async function openaiJson(content: unknown[], schemaName: string, schema: object) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: "user", content }],
      response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content) as Record<string, unknown>;
}

/** Gemini wants inline base64, so fetch public URLs first. */
async function toInlineData(image: string) {
  if (image.startsWith("data:")) {
    const [head, b64] = image.split(",");
    return { mime_type: head.slice(5).split(";")[0], data: b64 };
  }
  const res = await fetch(image);
  const buf = Buffer.from(await res.arrayBuffer());
  return { mime_type: res.headers.get("content-type") ?? "image/jpeg", data: buf.toString("base64") };
}

/** Gemini's responseSchema is an OpenAPI subset: no additionalProperties, nullable instead of type arrays. */
function toGeminiSchema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(toGeminiSchema);
  if (!s || typeof s !== "object") return s;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === "additionalProperties") continue;
    if (k === "type" && Array.isArray(v)) {
      out.type = v.find((t) => t !== "null");
      out.nullable = true;
    } else out[k] = toGeminiSchema(v);
  }
  return out;
}

async function geminiJson(prompt: string, images: string[], schema: object) {
  const parts = [{ text: prompt }, ...(await Promise.all(images.map(async (i) => ({ inline_data: await toInlineData(i) }))))];
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: "application/json", responseSchema: toGeminiSchema(schema) },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return JSON.parse(data.candidates[0].content.parts[0].text) as Record<string, unknown>;
}

/** Keyword guesses from the note, so the flow works offline. Students edit anything that's off. */
export function mockTriage(note: string | null, kind: ReportKind): Record<string, unknown> {
  const n = (note ?? "").toLowerCase();
  const has = (...w: string[]) => w.some((x) => n.includes(x));
  const color = ["black", "white", "silver", "blue", "red", "green", "pink", "gray", "purple", "yellow"].find((c) =>
    n.includes(c),
  );
  if (kind !== "issue") {
    const type = has("airpod", "earbud")
      ? { issue_type: "airpods_case", brand: "Apple", label: "AirPods case" }
      : has("bottle", "hydro")
        ? { issue_type: "water_bottle", brand: has("hydro") ? "Hydro Flask" : null, label: "water bottle" }
        : has("id", "card")
          ? { issue_type: "student_id_card", brand: null, label: "ID card" }
          : has("key")
            ? { issue_type: "keys", brand: null, label: "keys" }
            : has("laptop", "macbook")
              ? { issue_type: "laptop", brand: has("macbook") ? "Apple" : null, label: "laptop" }
              : { issue_type: "unknown_item", brand: null, label: "item" };
    return {
      issue_type: type.issue_type,
      title: `${kind === "lost" ? "Lost" : "Found"}: ${color ? `${color} ` : ""}${type.label}`,
      color: color ?? null,
      brand: type.brand,
      marks: n.match(/(?:\w+ )?(?:sticker|engraving|scratch(?:es)?|keychain)\b/)?.[0] ?? null,
      contains_sensitive: type.issue_type === "student_id_card",
    };
  }
  if (has("wifi", "wi-fi", "internet")) return { category: "connectivity", issue_type: "slow_wifi", severity: 2, title: "Slow Wi-Fi", routed_to: "IT" };
  if (has("filler", "fountain", "filter")) return { category: "water", issue_type: "bottle_filler_broken", severity: 2, title: "Bottle filler not working", routed_to: "Facilities" };
  if (has("rat", "mouse", "roach", "insect")) return { category: "pests", issue_type: "rats", severity: 4, title: "Pests sighted", hazard_flags: ["pests"], routed_to: "Facilities" };
  if (has("pothole")) return { category: "paths", issue_type: "pothole", severity: 3, title: "Pothole", access_impact: ["wheelchair"], routed_to: "Grounds" };
  if (has("construction")) return { category: "paths", issue_type: "construction_zone", severity: 4, title: "Construction blocking path", access_impact: ["wheelchair", "low_vision"], routed_to: "Facilities" };
  if (has("elevator")) return { category: "accessibility", issue_type: "broken_elevator", severity: 4, title: "Elevator out of service", access_impact: ["wheelchair", "no_stairs"], routed_to: "Facilities" };
  if (has("ramp")) return { category: "accessibility", issue_type: "blocked_ramp", severity: 4, title: "Ramp blocked", access_impact: ["wheelchair"], routed_to: "Facilities" };
  if (has("glass")) return { category: "waste", issue_type: "litter", severity: 3, title: "Broken glass on walkway", hazard_flags: ["broken_glass"], routed_to: "Grounds" };
  if (has("overflow", "full")) return { category: "waste", issue_type: "overflowing_bin", severity: 2, title: "Overflowing trash can", routed_to: "Grounds" };
  return { category: "waste", issue_type: "litter", severity: 1, title: "Litter", routed_to: "Grounds" };
}

/** The one entry point for /api/triage. `image` is a public URL or a data URL. */
export async function triagePhoto(image: string | null, note: string | null, kind: ReportKind): Promise<Triage> {
  const attempts: [Triage["source"], () => Promise<Record<string, unknown>>][] = [];
  if (process.env.EAISER_API_URL && image) attempts.push(["eaiser", () => eaiserTriage(image, note, kind)]);
  if (process.env.OPENAI_API_KEY && image)
    attempts.push([
      "openai",
      () =>
        openaiJson(
          [
            { type: "text", text: triagePrompt(kind, note) },
            { type: "image_url", image_url: { url: image } },
          ],
          "triage",
          TRIAGE_SCHEMA,
        ),
    ]);
  if (process.env.GEMINI_API_KEY && image)
    attempts.push(["gemini", () => geminiJson(triagePrompt(kind, note), [image], TRIAGE_SCHEMA)]);

  for (const [source, run] of attempts) {
    try {
      return normalizeTriage(await run(), kind, source);
    } catch (e) {
      console.warn(`[triage] ${source} failed, trying next:`, (e as Error).message);
    }
  }
  return normalizeTriage(mockTriage(note, kind), kind, "mock");
}

const SIMILARITY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["similarity", "reason"],
  properties: { similarity: { type: "number" }, reason: { type: "string" } },
} as const;

const SIMILARITY_PROMPT = `Image 1 is a student's photo of an item they lost (or a product photo of the same model).
Image 2 is a photo of an item someone found on campus.
How likely is it that they are the same physical item? Consider type, model, color, case, stickers and wear.
Return similarity from 0 (clearly different) to 1 (certainly the same), and a one-sentence reason.`;

/**
 * Vision-model similarity of two item photos, 0-1. Returns `fallback` with no model or no
 * photos, so the other signals decide.
 */
export async function photoSimilarity(lostImage: string | null, foundImage: string | null, fallback = 0.5): Promise<number> {
  if (!lostImage || !foundImage) return fallback;
  try {
    let out: Record<string, unknown> | null = null;
    if (process.env.OPENAI_API_KEY) {
      out = await openaiJson(
        [
          { type: "text", text: SIMILARITY_PROMPT },
          { type: "image_url", image_url: { url: lostImage } },
          { type: "image_url", image_url: { url: foundImage } },
        ],
        "similarity",
        SIMILARITY_SCHEMA,
      );
    } else if (process.env.GEMINI_API_KEY) {
      out = await geminiJson(SIMILARITY_PROMPT, [lostImage, foundImage], SIMILARITY_SCHEMA);
    }
    const s = Number(out?.similarity);
    return Number.isFinite(s) ? Math.min(1, Math.max(0, s)) : fallback;
  } catch (e) {
    console.warn("[match] photo similarity failed:", (e as Error).message);
    return fallback;
  }
}
