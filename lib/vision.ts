// Computer vision with Claude: triage a report photo into a routed, written report, and
// compare two item photos for lost & found matching. Server-only.
//
// Needs ANTHROPIC_API_KEY. Without it (or if a call fails) a keyword mock keeps the demo running.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import {
  AUTHORITIES,
  AUTHORITY_IDS,
  authorityName,
  defaultAuthority,
  ISSUE_CATEGORIES,
  ISSUE_CATEGORY_IDS,
  type AuthorityId,
  type IssueCategory,
  type TriageCategory,
} from "./categories";
import { fixPath } from "./fixPath";
import { HAZARD_FLAGS, type ReportKind, type Triage } from "./types";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const ACCESS_NEEDS = ["wheelchair", "low_vision", "no_stairs", "crutches"] as const;

let client: Anthropic | null = null;
export function claude(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic();
  return client;
}

// ---------- triage ----------

const REPORT_KINDS = ["issue", "lost", "found"] as const;

const TriageSchema = z.object({
  report_kind: z.enum(REPORT_KINDS).describe("issue = campus problem; found = an item the student just came across; lost = an item the student is missing."),
  identified: z.string().describe("What is actually visible in the photo, in 1-3 plain sentences."),
  category: z.enum([...ISSUE_CATEGORY_IDS, "lost_found"]),
  issue_type: z
    .string()
    .describe("Short snake_case subtype, or the item type for lost/found (e.g. airpods_case). For construction it starts with construction_ (e.g. construction_fence)."),
  severity: z.number().describe("1 (cosmetic) to 5 (immediate danger or blocks access)."),
  title: z.string().describe("Under 60 characters."),
  hazard_flags: z.array(z.enum(HAZARD_FLAGS)),
  access_impact: z.array(z.enum(ACCESS_NEEDS)),
  routed_to: z.enum(AUTHORITY_IDS),
  cc: z.array(z.enum(AUTHORITY_IDS)),
  routing_reason: z.string().describe("One sentence: why this authority."),
  report_subject: z.string(),
  report_body: z.string(),
  contains_sensitive: z.boolean(),
  student_solvable: z.boolean().describe("True only if a student volunteer could safely fix or check this themselves."),
  solvable_reason: z.string().describe("One short sentence for the student: why they can or can't do this."),
  color: z.string().nullable(),
  brand: z.string().nullable(),
  marks: z.string().nullable(),
});

// Frozen so it caches across requests; per-report details go in the user message.
const TRIAGE_SYSTEM = `You are the triage desk for San José State University's campus reporting app. Students send one photo (and sometimes a short note) of a campus problem, or of a personal item they lost or found. They don't say which: you look at the photo, decide what kind of report it is and what it shows, route it to the right campus authority, and write the report that authority will receive.

Report kind (report_kind):
- issue: the photo shows a problem with the campus itself: construction, potholes, damaged sidewalks, fallen trees, leaks, trash, broken fixtures, blocked ramps, pests, weak Wi-Fi and so on.
- found: the main subject is a personal belonging (bag, phone, keys, ID, bottle, earbuds, laptop, clothing) that looks left behind: lying on a table, bench, floor or seat, photographed where it sits. A photo taken just now with the camera points to found.
- lost: the student is missing the item: the note says lost, missing, can't find or "my ...", or the image is a product or catalog photo, a screenshot, or an older personal photo picked from the gallery rather than the item sitting somewhere on campus.
- When the note and the photo disagree, the note wins. When it's truly unclear whether an item is lost or found, choose found.

Issue categories (pick the closest; use "other" only when nothing fits):
${ISSUE_CATEGORY_IDS.map((id) => `- ${id}: ${ISSUE_CATEGORIES[id].label}`).join("\n")}
Lost and found items always use category "lost_found".

Campus authorities (routed_to is the one that must act; cc is anyone else who needs to know, often empty):
${AUTHORITY_IDS.map((id) => `- ${id}: ${AUTHORITIES[id].name}. Handles ${AUTHORITIES[id].handles}.`).join("\n")}

Routing rules:
- Weak or no Wi-Fi, network or computer problems go to it_services.
- Lost and found items go to lost_found.
- Anything that is an immediate danger to people (open manhole, live wires, flooding near electrics, a fallen tree across a path) adds upd to cc.
- Chemical, biohazard or sewage concerns add ehs to cc.
- Streets and traffic signals the city owns go to city_sj; campus roads, garages and signs go to parking.
- Inside or right next to a residence hall, add housing to cc.
- Blocked ramps, broken elevators and stuck automatic doors use accessibility_barrier, with everyone it blocks in access_impact.
- Fences, barricades or work crews closing a walkway, road or entrance use construction, with everyone it blocks in access_impact. Potholes, damaged sidewalks and fallen trees on a path also list who they block.

Fields:
- identified: describe what you actually see. If the photo doesn't show the problem the note describes, say so and rely on the note.
- severity: 1 cosmetic, 2 minor, 3 needs fixing soon, 4 serious or blocks access, 5 immediate danger. Items are always 1.
- hazard_flags: only hazards you can see or that the category implies (e.g. dead_animal implies biohazard, open_manhole implies heights).
- access_impact: who this blocks (wheelchair, low_vision, no_stairs, crutches); empty if nobody.
- contains_sensitive: true if the photo shows an ID card, payment card, a screen with personal information, a license plate, or a person's face.
- student_solvable: can a student volunteer, registered with the department, safely deal with this themselves in under 20 minutes with only gloves, a trash bag or their phone? True for small, simple jobs: picking up loose litter, bagging trash around an overflowing bin, putting chairs back, checking whether a bottle filler works, running a Wi-Fi speed test. False for anything that needs trained staff, tools, chemicals, ladders or heavy lifting, or that could hurt them: construction, potholes and sidewalk damage, leaks and flooding, anything electrical, broken glass, needles, bodily fluids, pests, dead animals, graffiti removal, broken fixtures and equipment, traffic, restricted areas, and anything with a hazard flag. When unsure, false. Lost and found items are always false.
- solvable_reason: one short, plain sentence the student reads, e.g. "Loose litter, no sharp objects: a volunteer with gloves can bag it." or "Live wiring needs an electrician."
- color, brand, marks: for lost/found items only, null for issues. color is one or two words ("white", "matte black"); brand is just the brand name ("Apple") or null if you can't tell; marks is a short phrase listing identifying marks (stickers, case, engravings, damage) or null if none. These are matched against other reports, so keep them terse.

The report (report_subject, report_body) goes straight to the authority's work queue, so write it for staff, not for the student:
- Subject: category and the key fact, e.g. "Open manhole cover on walkway – fall hazard".
- Body: three short labeled sections, "Observed:", "Impact:" and "Requested action:", plain text, under 120 words in total. Be specific about what is visible. Don't invent details you can't see, and don't include the location, time or reporter: the app appends those.
- For found items, address the Lost & Found office and describe the item so it can be checked in. For lost items, describe the item so the office can recognize it if it's turned in.`;

type ImageSource =
  | { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string }
  | { type: "url"; url: string };

function imageSource(image: string): ImageSource | null {
  if (/^https?:\/\//.test(image)) return { type: "url", url: image };
  const m = image.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/);
  return m ? { type: "base64", media_type: m[1] as "image/jpeg", data: m[2] } : null;
}

/** `kind` is set only when the student corrected the AI's guess; `source` is how the photo was picked. */
export type TriageHint = { kind?: ReportKind | null; source?: "camera" | "gallery" | null };

async function claudeTriage(image: string | null, note: string | null, hint: TriageHint) {
  const c = claude();
  if (!c) throw new Error("ANTHROPIC_API_KEY not set");
  const src = image ? imageSource(image) : null;
  const intro = [
    hint.kind
      ? `The student says this is ${hint.kind === "issue" ? "a campus issue" : `an item they ${hint.kind}`}: use report_kind "${hint.kind}".`
      : "Decide report_kind yourself.",
    hint.source === "camera" ? "The photo was taken just now with the camera." : hint.source === "gallery" ? "The photo was picked from the gallery." : "",
  ]
    .filter(Boolean)
    .join(" ");

  const response = await c.beta.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(TriageSchema) },
    system: [{ type: "text", text: TRIAGE_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          ...(src ? [{ type: "image" as const, source: src }] : []),
          {
            type: "text",
            text: `${intro}\n${note ? `Student's note: "${note}"` : "No note."}${src ? "" : "\nNo photo was attached; work from the note."}`,
          },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("Claude declined to triage this photo");
  if (!response.parsed_output) throw new Error(`No structured output (stop_reason ${response.stop_reason})`);
  return response.parsed_output;
}

/** Coerce a triage (from Claude or the mock) into a valid, consistent shape. */
export function normalizeTriage(raw: Partial<z.infer<typeof TriageSchema>>, forced: ReportKind | null, source: Triage["source"]): Triage {
  const kind: ReportKind = forced ?? (REPORT_KINDS.includes(raw.report_kind as ReportKind) ? (raw.report_kind as ReportKind) : raw.category === "lost_found" ? "found" : "issue");
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const isItem = kind !== "issue";
  const category: TriageCategory = isItem
    ? "lost_found"
    : ISSUE_CATEGORY_IDS.includes(raw.category as IssueCategory)
      ? (raw.category as IssueCategory)
      : "other";
  const validAuthority = (a: unknown): a is AuthorityId => AUTHORITY_IDS.includes(a as AuthorityId);
  const routed_to = isItem ? "lost_found" : validAuthority(raw.routed_to) ? raw.routed_to : defaultAuthority(category);
  const sev = Math.round(Number(raw.severity));
  const severity = isItem ? 1 : Number.isFinite(sev) ? Math.min(5, Math.max(1, sev)) : 3;
  const title = str(raw.title) ?? (isItem ? `${kind === "lost" ? "Lost" : "Found"} item` : "Campus issue");
  const identified = str(raw.identified) ?? "";
  const hazard_flags = raw.hazard_flags ?? [];
  // The model's answer when it gave one; the safety rules alone otherwise. fixPath re-checks either way.
  const passesRules = fixPath({ kind, category, severity, hazard_flags, routed_to }) === "self_fixable";
  const student_solvable = !isItem && passesRules && (typeof raw.student_solvable === "boolean" ? raw.student_solvable : true);

  return {
    kind,
    category,
    issue_type: (str(raw.issue_type) ?? (isItem ? "unknown_item" : category)).toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    severity,
    title,
    hazard_flags,
    access_impact: raw.access_impact ?? [],
    routed_to,
    cc: (raw.cc ?? []).filter((a) => validAuthority(a) && a !== routed_to),
    identified,
    routing_reason: str(raw.routing_reason) ?? `${authorityName(routed_to)} handles this kind of report.`,
    report_subject: str(raw.report_subject) ?? title,
    report_body: str(raw.report_body) ?? (identified ? `Observed: ${identified}` : title),
    contains_sensitive: raw.contains_sensitive === true,
    student_solvable,
    solvable_reason: isItem
      ? "Lost and found items go to the Lost & Found office."
      : student_solvable === (raw.student_solvable === true) && str(raw.solvable_reason)
        ? str(raw.solvable_reason)!
        : student_solvable
          ? "Small and safe: a registered student volunteer can handle it."
          : "Needs trained campus staff, so it isn't a student task.",
    color: isItem ? str(raw.color) : null,
    brand: isItem ? str(raw.brand) : null,
    marks: isItem ? str(raw.marks) : null,
    source,
  };
}

const ITEM_WORDS = ["airpod", "earbud", "headphone", "bottle", "hydro", "wallet", "phone", "keys?", "laptop", "macbook", "backpack", "bag", "id", "card", "umbrella", "jacket", "charger", "calculator", "glasses"];

/** Offline stand-in for Claude's report_kind: lost words win, then item words mean found, else an issue. */
export function guessKind(note: string | null, source?: TriageHint["source"]): ReportKind {
  const n = (note ?? "").toLowerCase();
  const has = (...w: string[]) => w.some((x) => new RegExp(`\\b${x}s?\\b`).test(n));
  if (has("lost", "missing", "can'?t find", "cannot find", "left my", "my")) return "lost";
  if (has(...ITEM_WORDS)) return source === "gallery" && !has("found", "someone left") ? "lost" : "found";
  return "issue";
}

/** Keyword guesses from the note so the demo works offline. Students edit anything that's off. */
export function mockTriage(note: string | null, kind: ReportKind): Partial<z.infer<typeof TriageSchema>> {
  const n = (note ?? "").toLowerCase();
  const has = (...w: string[]) => w.some((x) => new RegExp(`\\b${x}`).test(n));
  const color = ["black", "white", "silver", "blue", "red", "green", "pink", "gray", "purple", "yellow"].find((c) =>
    has(c),
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
    const desc = `${color ? `${color} ` : ""}${type.label}`;
    return {
      report_kind: kind,
      issue_type: type.issue_type,
      title: `${kind === "lost" ? "Lost" : "Found"}: ${desc}`,
      identified: `A ${desc}.`,
      color: color ?? null,
      brand: type.brand,
      marks: n.match(/(?:\w+ )?(?:sticker|engraving|scratch(?:es)?|keychain)\b/)?.[0] ?? null,
      contains_sensitive: type.issue_type === "student_id_card",
      report_subject: `${kind === "lost" ? "Lost" : "Found"} item: ${desc}`,
      report_body:
        kind === "found"
          ? `Observed: A ${desc} was found on campus.\nImpact: Someone is likely looking for it.\nRequested action: Check the item in when it is dropped off and hold it for the owner.`
          : `Observed: A student lost a ${desc}.\nImpact: The owner needs it back.\nRequested action: Watch for it among turned-in items and flag it for the owner.`,
    };
  }

  const pick = (
    category: IssueCategory,
    severity: number,
    extra: Partial<z.infer<typeof TriageSchema>> = {},
  ): Partial<z.infer<typeof TriageSchema>> => {
    const label = ISSUE_CATEGORIES[category].label;
    return {
      report_kind: "issue",
      category,
      issue_type: category,
      severity,
      title: label,
      identified: note ? `Student reports: ${note}` : label,
      routed_to: ISSUE_CATEGORIES[category].authority,
      report_subject: label,
      report_body: `Observed: ${note || label}.\nImpact: Reported by a student; severity ${severity}/5.\nRequested action: Inspect and resolve.`,
      ...extra,
    };
  };

  if (has("construction", "barricade", "fence", "fenced", "road work", "roadwork", "closed off"))
    return pick("construction", 4, { hazard_flags: ["restricted_area"], access_impact: ["wheelchair", "low_vision", "crutches"] });
  if (has("needle", "syringe", "glass", "vomit", "blood"))
    return pick("garbage", 3, { hazard_flags: [has("needle", "syringe", "blood", "vomit") ? "biohazard" : "broken_glass"], student_solvable: false, solvable_reason: "Sharp or biohazard waste needs custodial staff." });
  if (has("wifi", "wi-fi", "internet", "network", "eduroam"))
    return pick("weak_wifi", 2, { student_solvable: true, solvable_reason: "A volunteer can check it with a speed test at the spot." });
  if (has("filler", "fountain"))
    return pick("bottle_filler", 1, { student_solvable: true, solvable_reason: "A volunteer can check whether it works and photograph it." });
  if (has("ramp", "elevator", "automatic door", "door button"))
    return pick("accessibility_barrier", 4, { access_impact: ["wheelchair", "crutches", "no_stairs"] });
  if (has("rats?", "ants", "roach", "bees", "pest")) return pick("pests", 3, { hazard_flags: ["pests"], cc: ["ehs"] });
  if (has("pothole")) return pick("pothole", 3, { access_impact: ["wheelchair"] });
  if (has("manhole")) return pick("open_manhole", 5, { hazard_flags: ["heights"], cc: ["upd"] });
  if (has("streetlight", "light")) return pick("broken_streetlight", 3, { hazard_flags: ["electrical"] });
  if (has("graffiti")) return pick("graffiti", 2);
  if (has("noise", "loud")) return pick("noise_complaint", 2);
  if (has("sidewalk")) return pick("damaged_sidewalk", 3, { access_impact: ["wheelchair", "crutches"] });
  if (has("tree", "branch")) return pick("fallen_tree", 4, { cc: ["upd"], access_impact: ["wheelchair", "crutches"] });
  if (has("drain")) return pick("clogged_drain", 3);
  if (has("flood")) return pick("flooding", 4, { cc: ["ehs"] });
  if (has("leak", "water")) return pick("water_leakage", 3);
  if (has("dead", "animal")) return pick("dead_animal", 3, { hazard_flags: ["biohazard"], cc: ["ehs"] });
  if (has("car", "vehicle")) return pick("abandoned_vehicle", 2);
  if (has("signal")) return pick("broken_traffic_signal", 4);
  if (has("sign")) return pick("damaged_traffic_sign", 2);
  if (has("playground", "bench", "swing")) return pick("park_playground_damage", 2);
  if (has("road", "crack")) return pick("road_damage", 3);
  if (has("trash", "garbage", "litter", "bin", "overflow", "mess", "cleanup", "clean up", "chairs"))
    return pick("garbage", 1, { student_solvable: true, solvable_reason: "Loose trash with nothing sharp: a volunteer with gloves and a bag can tidy it." });
  return pick("other", 2);
}

/** The one entry point for /api/triage. `image` is a public URL or a data URL. */
export async function triagePhoto(image: string | null, note: string | null, hint: TriageHint = {}): Promise<Triage> {
  const forced = hint.kind ?? null;
  if (claude() && (image || note)) {
    try {
      return normalizeTriage(await claudeTriage(image, note, hint), forced, "claude");
    } catch (e) {
      console.warn("[triage] Claude failed, using mock:", (e as Error).message);
    }
  }
  return normalizeTriage(mockTriage(note, forced ?? guessKind(note, hint.source)), forced, "mock");
}

// ---------- photo similarity ----------

const SimilaritySchema = z.object({
  similarity: z.number().describe("0 = clearly different items, 1 = certainly the same physical item."),
  reason: z.string(),
});

const SIMILARITY_PROMPT = `Image 1 is a student's photo of an item they lost (or a product photo of the same model). Image 2 is a photo of an item someone found on campus.
How likely is it that they are the same physical item? Weigh type, model, color, case, stickers and wear; a product photo can't show wear, so don't penalize that.`;

/**
 * Claude's 0-1 similarity of two item photos. Returns `fallback` with no key or no photos,
 * so the other signals decide.
 */
export async function photoSimilarity(lostImage: string | null, foundImage: string | null, fallback = 0.5): Promise<number> {
  const c = claude();
  const a = lostImage ? imageSource(lostImage) : null;
  const b = foundImage ? imageSource(foundImage) : null;
  if (!c || !a || !b) return fallback;
  try {
    const response = await c.beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(SimilaritySchema) },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: a },
            { type: "image", source: b },
            { type: "text", text: SIMILARITY_PROMPT },
          ],
        },
      ],
    });
    const s = response.parsed_output?.similarity;
    return typeof s === "number" && Number.isFinite(s) ? Math.min(1, Math.max(0, s)) : fallback;
  } catch (e) {
    console.warn("[match] photo similarity failed:", (e as Error).message);
    return fallback;
  }
}
