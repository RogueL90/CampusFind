// In-browser stand-in for lib/db.ts, used when Supabase isn't configured. Same exports and the
// same rules as the Postgres functions in supabase/schema.sql, so screens behave identically.
// State lives in this tab's memory: it survives client-side navigation and resets on reload.
import * as turf from "@turf/turf";
import type { LineString } from "geojson";
import { DEMO_GEOMETRY, type LngLat } from "@/lib/geo/campus";
import { LEO, MAYA, getCurrentUserId, userName } from "@/lib/currentUser";
import type {
  AccessAlert,
  Balance,
  FixPath,
  ItemDetails,
  LedgerEntry,
  Match,
  Mission,
  MissionType,
  NewProof,
  NewReport,
  Notification,
  ProofForReview,
  Redemption,
  Report,
  Reward,
  StatusEvent,
} from "@/lib/types";

const JORDAN = "a0000000-0000-4000-8000-000000000005";
const AVA = "a0000000-0000-4000-8000-000000000006";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const nowIso = () => new Date().toISOString();
let seq = 1000;
const nextId = (prefix: string) => `${prefix}-${++seq}`;
const lcfirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type ReportRow = Omit<Report, "votes" | "mission" | "item" | "last_checked_at" | "last_check_still" | "resolved_votes">;
type ItemRow = ItemDetails & { report_id: string; checkin_code: string | null };
type AlertRow = Omit<AccessAlert, "title" | "category" | "status" | "building" | "floor" | "lat" | "lng" | "footprint">;
type ProofRow = {
  id: string;
  mission_id: string;
  helper_id: string;
  photo_urls: string[];
  speed_test: number | null;
  lat: number;
  lng: number;
  taken_at: string;
  review_status: ProofForReview["review_status"];
};

const reports: ReportRow[] = [];
const missions: Mission[] = [];
const items = new Map<string, ItemRow>();
const voters = new Map<string, Set<string>>();
const checks: { report_id: string; user_id: string; still_there: boolean; at: string }[] = [];
const alerts: AlertRow[] = [];
const matches: Match[] = [];
const proofs: ProofRow[] = [];
const ledger: LedgerEntry[] = [];
const redemptions: (Redemption & { user_id: string })[] = [];
const notifications: Notification[] = [];
const statusEvents: StatusEvent[] = [];
let eventSeq = 1;

const rewards: Reward[] = [
  { id: "e0000000-0000-4000-8000-000000000001", name: "$5 campus meal credit", cost_points: 100, partner: "Campus dining (mock)", stock: null },
  { id: "e0000000-0000-4000-8000-000000000002", name: "$10 campus meal credit", cost_points: 200, partner: "Campus dining (mock)", stock: null },
];

const listeners = new Set<() => void>();
const emit = () => setTimeout(() => listeners.forEach((l) => l()), 0);
function listen(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

const clone = <T>(v: T): T => structuredClone(v);
const delay = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(clone(v)), 60));

// ---------------------------------------------------------------------------
// Helpers mirroring schema.sql
// ---------------------------------------------------------------------------

function reportRow(id: string): ReportRow {
  const r = reports.find((x) => x.id === id);
  if (!r) throw new Error("Report not found");
  return r;
}

function missionRow(id: string): Mission {
  const m = missions.find((x) => x.id === id);
  if (!m) throw new Error("Mission not found");
  return m;
}

const lapsed = (m: Mission) => m.status === "claimed" && !!m.claim_expires_at && Date.parse(m.claim_expires_at) < Date.now();

/** A claim past its 30-minute lock reads as open, same as the reports_geo view. */
function liveMission(m: Mission): Mission {
  return lapsed(m) ? { ...m, status: "open", claimed_by: null, claim_expires_at: null } : m;
}

function toReport(r: ReportRow): Report {
  const m = missions
    .filter((x) => x.report_id === r.id && ["open", "claimed", "submitted"].includes(x.status))
    .sort((a, b) => (a.id < b.id ? 1 : -1))[0];
  const item = items.get(r.id);
  const mine = checks.filter((c) => c.report_id === r.id);
  const last = mine.at(-1) ?? null;
  const lastStill = mine.findLast((c) => c.still_there);
  return {
    ...r,
    votes: voters.get(r.id)?.size ?? 0,
    last_checked_at: last?.at ?? null,
    last_check_still: last?.still_there ?? null,
    resolved_votes: new Set(mine.filter((c) => !c.still_there && (!lastStill || c.at > lastStill.at)).map((c) => c.user_id)).size,
    mission: m ? liveMission(m) : null,
    item: item
      ? {
          category: item.category,
          color: item.color,
          brand: item.brand,
          marks: item.marks,
          radius_m: item.radius_m,
          whereabouts: item.whereabouts,
          lost_from: item.lost_from,
          lost_to: item.lost_to,
        }
      : null,
  };
}

function setStatus(reportId: string, to: string, actor: string | null) {
  const r = reportRow(reportId);
  if (r.status === to) return;
  statusEvents.push({ id: eventSeq++, report_id: reportId, from_status: r.status, to_status: to, actor_id: actor, at: nowIso() });
  r.status = to;
}

function notify(userId: string | null, text: string, link: string | null = null) {
  if (!userId) return;
  notifications.unshift({ id: nextId("n"), user_id: userId, text, link, read: false, created_at: nowIso() });
}

function credit(entry: Omit<LedgerEntry, "id" | "created_at">) {
  ledger.push({ ...entry, id: nextId("l"), created_at: nowIso() });
}

function addMission(reportId: string, type: MissionType, title: string, points: number, proof: string): Mission {
  const m: Mission = {
    id: nextId("m"),
    report_id: reportId,
    mission_type: type,
    title,
    points,
    proof_required: proof,
    status: "open",
    claimed_by: null,
    claimed_at: null,
    claim_expires_at: null,
  };
  missions.push(m);
  return m;
}

/** The mission a self_fixable report gets. Hazards and pests never become missions. */
function createFixMission(reportId: string) {
  const r = reportRow(reportId);
  if (r.fix_path !== "self_fixable" || r.hazard_flags.length > 0 || r.category === "pests") return;
  if (missions.some((m) => m.report_id === reportId && ["open", "claimed", "submitted"].includes(m.status))) return;
  const [type, title, points, proof]: [MissionType, string, number, string] =
    r.category === "waste"
      ? ["tidy", `Quick tidy: ${r.title}`, 10, "Before and after photos"]
      : r.category === "accessibility"
        ? ["access_check", `Is it still blocked? ${r.title}`, 10, "Geotagged photo at the pin"]
        : ["verify", `Verify: ${r.title}`, 5, r.category === "connectivity" ? "Speed test at the pin" : "Geotagged photo at the pin"];
  addMission(reportId, type, title, points, proof);
  setStatus(reportId, "mission_open", null);
}

function genCode(): string {
  let code: string;
  do code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
  while ([...items.values()].some((i) => i.checkin_code === code));
  return code;
}

const obstacleStyleFor = (issueType: string | null): AlertRow["obstacle_style"] =>
  /elevator/.test(issueType ?? "") ? "elevator" : /construction|barricade|fence|road_?work/.test(issueType ?? "") ? "zone" : "pothole";

// ---------------------------------------------------------------------------
// Seed (mirrors supabase/seed.sql: same users, rewards, obstacles and demo story)
// ---------------------------------------------------------------------------

const G = DEMO_GEOMETRY;

type Seed = Partial<ReportRow> & Pick<ReportRow, "id" | "category" | "title"> & {
  at: LngLat;
  votes?: number;
  item?: Partial<ItemRow>;
  mission?: [MissionType, string, number, string];
  minutes?: number;
};

function seed(s: Seed) {
  const { at, votes = 0, item, mission, minutes = 90, ...rest } = s;
  const row: ReportRow = {
    reporter_id: JORDAN,
    kind: "issue",
    issue_type: null,
    severity: 2,
    description: null,
    photo_urls: [],
    footprint: null,
    building: null,
    floor: null,
    fix_path: "staff",
    hazard_flags: [],
    access_impact: [],
    routed_to: "fdo_maintenance",
    cc: [],
    identified: null,
    routing_reason: null,
    report_subject: null,
    report_body: null,
    contains_sensitive: false,
    status: "routed",
    created_at: minutesAgo(minutes),
    ...rest,
    lng: at[0],
    lat: at[1],
  };
  reports.push(row);
  statusEvents.push({ id: eventSeq++, report_id: row.id, from_status: null, to_status: "submitted", actor_id: row.reporter_id, at: row.created_at });
  if (row.status !== "submitted") {
    statusEvents.push({ id: eventSeq++, report_id: row.id, from_status: "submitted", to_status: row.status, actor_id: null, at: minutesAgo(minutes - 2) });
  }
  const pool = [MAYA, JORDAN, AVA, "s-1", "s-2", "s-3", "s-4", "s-5", "s-6", "s-7", "s-8", "s-9"];
  voters.set(row.id, new Set(pool.filter((u) => u !== row.reporter_id).slice(0, votes)));
  if (item) {
    items.set(row.id, {
      report_id: row.id,
      category: row.issue_type,
      color: null,
      brand: null,
      marks: null,
      radius_m: row.kind === "lost" ? 50 : 10,
      whereabouts: row.kind === "found" ? "with_finder" : null,
      lost_from: null,
      lost_to: null,
      checkin_code: null,
      ...item,
    });
  }
  if (mission) addMission(row.id, ...mission);
}

seed({
  id: "r-clark-construction",
  category: "paths",
  issue_type: "construction",
  title: "Construction zone, Clark Hall north entrance",
  description: "Service road and north doors fenced off for utility work.",
  severity: 4,
  at: G.clarkConstruction.center,
  footprint: G.clarkConstruction.footprint,
  building: "Clark Hall",
  hazard_flags: ["construction"],
  access_impact: ["wheelchair", "crutches", "low_vision", "no_stairs"],
  votes: 6,
  minutes: 60 * 26,
});
seed({
  id: "r-paseo-pothole",
  category: "paths",
  issue_type: "pothole",
  title: "Pothole on Paseo de César Chávez",
  severity: 3,
  at: G.paseoPothole.center,
  routed_to: "fdo_grounds",
  access_impact: ["wheelchair", "crutches", "low_vision"],
  votes: 4,
  minutes: 300,
});
seed({
  id: "r-union-ramp",
  reporter_id: AVA,
  category: "accessibility",
  issue_type: "blocked_ramp",
  title: "Ramp blocked by delivery carts, Student Union east entrance",
  severity: 4,
  at: G.unionRamp.center,
  building: "Student Union",
  access_impact: ["wheelchair", "crutches"],
  votes: 3,
  minutes: 45,
  mission: ["access_check", "Is it still blocked? Student Union east ramp", 10, "Geotagged photo at the pin"],
});
seed({
  id: "r-mlk-elevator",
  reporter_id: AVA,
  category: "accessibility",
  issue_type: "elevator_out",
  title: "Elevator out, MLK Library floors 2–5",
  severity: 5,
  at: G.libraryElevator.center,
  building: "MLK Library",
  floor: "2–5",
  access_impact: ["wheelchair", "crutches", "no_stairs"],
  votes: 8,
  minutes: 60 * 5,
});
seed({
  id: "r-mq-door",
  reporter_id: MAYA,
  category: "accessibility",
  issue_type: "door_blocked",
  title: "North doors chained shut, MacQuarrie Hall",
  description: "Accessible north entrance on Paseo de San Carlos is chained; the automatic opener is off.",
  severity: 4,
  at: G.macquarrieDoor.center,
  building: "MacQuarrie Hall",
  floor: "1",
  access_impact: ["wheelchair", "crutches", "no_stairs"],
  votes: 3,
  minutes: 35,
});
seed({
  id: "r-wsq-scaffold",
  category: "paths",
  issue_type: "scaffolding",
  title: "Low scaffolding over sidewalk, Washington Square Hall",
  severity: 2,
  at: G.washingtonSquareScaffold.center,
  building: "Washington Square Hall",
  access_impact: ["low_vision"],
  votes: 2,
  minutes: 60 * 30,
});
seed({
  id: "r-mlk-wifi",
  reporter_id: AVA,
  category: "connectivity",
  issue_type: "slow_wifi",
  title: "Slow Wi-Fi, MLK Library 4th floor study rooms",
  at: [-121.88485, 37.33538],
  building: "MLK Library",
  floor: "4",
  routed_to: "it_services",
  fix_path: "self_fixable",
  status: "mission_open",
  votes: 11,
  mission: ["verify", "Is the Wi-Fi still slow on MLK floor 4?", 5, "Speed test at the pin"],
});
seed({
  id: "r-su-filler",
  category: "water",
  issue_type: "bottle_filler",
  title: "Bottle filler red light, Student Union 2nd floor",
  severity: 1,
  at: [-121.88005, 37.33672],
  building: "Student Union",
  floor: "2",
  fix_path: "self_fixable",
  status: "mission_open",
  votes: 5,
  mission: ["verify", "Verify: Bottle filler red light, Student Union 2nd floor", 5, "Geotagged photo at the pin"],
});
seed({
  id: "r-tower-trash",
  reporter_id: AVA,
  category: "waste",
  issue_type: "overflowing_bin",
  title: "Overflowing trash bins by Tower Lawn",
  at: [-121.8833, 37.33515],
  routed_to: "fdo_custodial",
  votes: 3,
});
seed({
  id: "r-event-litter",
  category: "waste",
  issue_type: "litter",
  title: "Litter after event outside the Event Center",
  severity: 1,
  at: [-121.88035, 37.33545],
  routed_to: "fdo_custodial",
  fix_path: "self_fixable",
  status: "mission_open",
  mission: ["tidy", "Quick tidy: litter outside the Event Center", 10, "Before and after photos"],
});
seed({
  id: "r-dining-rats",
  reporter_id: AVA,
  category: "pests",
  issue_type: "rats",
  title: "Rats near the Dining Commons loading dock",
  severity: 3,
  at: [-121.87845, 37.33395],
  routed_to: "ehs",
  hazard_flags: ["pests"],
  votes: 7,
});
seed({
  id: "r-ccb-chairs",
  category: "waste",
  issue_type: "chairs",
  title: "Chairs piled up in CCB study room 101",
  severity: 1,
  at: [-121.88188, 37.33556],
  building: "Central Classroom Building",
  routed_to: "fdo_custodial",
  fix_path: "self_fixable",
  status: "mission_open",
  mission: ["tidy", "Quick tidy: return the chairs in CCB study room 101", 10, "Before and after photos"],
});
seed({
  id: "r-lost-airpods",
  reporter_id: MAYA,
  kind: "lost",
  category: "lost_found",
  issue_type: "airpods_case",
  title: "Black AirPods case",
  description: "Small cactus sticker inside the lid. Lost between 2 and 4 PM.",
  severity: 1,
  at: [-121.88492, 37.33547],
  building: "MLK Library",
  floor: "3",
  fix_path: "lost_found",
  routed_to: "lost_found",
  status: "searching",
  minutes: 180,
  item: { color: "black", brand: "Apple", marks: "cactus sticker inside the lid", radius_m: 50 },
  mission: ["search", "Keep an eye out for a black AirPods case, MLK Library floor 3", 50, "A matching found report checked in at Lost & Found"],
});
seed({
  id: "r-found-bottle",
  reporter_id: LEO,
  kind: "found",
  category: "lost_found",
  issue_type: "water_bottle",
  title: "Teal Hydro Flask water bottle",
  severity: 1,
  at: [-121.8826, 37.33604],
  building: "Clark Hall",
  fix_path: "lost_found",
  routed_to: "lost_found",
  status: "with_finder",
  minutes: 15,
  item: { color: "teal", brand: "Hydro Flask", checkin_code: "482731" },
});

alerts.push(
  {
    id: "aa-clark",
    report_id: "r-clark-construction",
    affects: ["wheelchair", "crutches", "low_vision", "no_stairs"],
    obstacle_style: "zone",
    impact: "blocks",
    label: "Construction · north entrance closed",
    detour_text: "Use El Paseo de César Chávez to the Clark Hall east entrance. Adds about 2 min.",
    detour_path: G.clarkConstruction.detourPath,
    blocked_path: G.clarkConstruction.blockedPath,
    est_delay_min: 2,
    confirmed: true,
  },
  {
    id: "aa-pothole",
    report_id: "r-paseo-pothole",
    affects: ["wheelchair", "crutches", "low_vision"],
    obstacle_style: "pothole",
    impact: "caution",
    label: "Pothole",
    detour_text: "Keep to the right side of the paseo.",
    detour_path: null,
    blocked_path: null,
    est_delay_min: 0,
    confirmed: true,
  },
  {
    id: "aa-ramp",
    report_id: "r-union-ramp",
    affects: ["wheelchair", "crutches"],
    obstacle_style: "barrier",
    impact: "blocks",
    label: "Ramp blocked",
    detour_text: "Use the northeast doors with the automatic opener. Adds about 1 min.",
    detour_path: G.unionRamp.detourPath,
    blocked_path: G.unionRamp.blockedPath,
    est_delay_min: 1,
    confirmed: true,
  },
  {
    id: "aa-elevator",
    report_id: "r-mlk-elevator",
    affects: ["wheelchair", "crutches", "no_stairs"],
    obstacle_style: "elevator",
    impact: "blocks",
    label: "Elevator out · floors 2–5",
    detour_text: "Use the east elevator bank by the 4th Street entrance.",
    detour_path: null,
    blocked_path: null,
    est_delay_min: 3,
    confirmed: true,
  },
  {
    id: "aa-mq-door",
    report_id: "r-mq-door",
    affects: ["wheelchair", "crutches", "no_stairs"],
    obstacle_style: "barrier",
    impact: "blocks",
    label: "North doors closed",
    detour_text: "Use the south entrance on the 7th Street side. It was checked step-free 25 min ago.",
    detour_path: null,
    blocked_path: G.macquarrieDoor.blockedPath,
    est_delay_min: 1,
    confirmed: true,
  },
  {
    id: "aa-scaffold",
    report_id: "r-wsq-scaffold",
    affects: ["low_vision"],
    obstacle_style: "barrier",
    impact: "caution",
    label: "Low scaffolding",
    detour_text: "Cross to the lawn side of the walkway.",
    detour_path: null,
    blocked_path: G.washingtonSquareScaffold.blockedPath,
    est_delay_min: 0,
    confirmed: true,
  },
);

checks.push(
  { report_id: "r-clark-construction", user_id: AVA, still_there: true, at: minutesAgo(180) },
  { report_id: "r-paseo-pothole", user_id: "s-1", still_there: false, at: minutesAgo(40) },
  { report_id: "r-union-ramp", user_id: LEO, still_there: true, at: minutesAgo(12) },
  { report_id: "r-mq-door", user_id: AVA, still_there: true, at: minutesAgo(8) },
);

// Leo starts at 60 spendable, so one +50 return takes him past the 100-point $5 credit.
ledger.push(
  { id: "l-1", user_id: LEO, delta: 50, reason: "return_checkin", mission_id: null, report_id: null, state: "spendable", created_at: minutesAgo(60 * 24 * 6) },
  { id: "l-2", user_id: LEO, delta: 10, reason: "mission:access_check", mission_id: null, report_id: null, state: "spendable", created_at: minutesAgo(60 * 24 * 4) },
  { id: "l-3", user_id: MAYA, delta: 10, reason: "mission:tidy", mission_id: null, report_id: null, state: "spendable", created_at: minutesAgo(60 * 24 * 5) },
  { id: "l-4", user_id: MAYA, delta: 5, reason: "mission:verify", mission_id: null, report_id: null, state: "spendable", created_at: minutesAgo(60 * 24 * 3) },
);

notifications.push(
  { id: "n-1", user_id: MAYA, text: "Your black AirPods case report is with Lost & Found. Only you and staff can see it.", link: "/?report=r-lost-airpods", read: false, created_at: minutesAgo(120) },
  { id: "n-2", user_id: LEO, text: "+10 points approved: accessibility check at the Student Union.", link: "/missions", read: true, created_at: minutesAgo(60 * 24 * 4) },
);

// ---------------------------------------------------------------------------
// Contract (roles/shared.md)
// ---------------------------------------------------------------------------

export async function getReports(): Promise<Report[]> {
  return delay(
    reports
      .filter((r) => r.status !== "closed")
      .map(toReport)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
  );
}

export async function getReport(reportId: string): Promise<Report | null> {
  const r = reports.find((x) => x.id === reportId);
  return delay(r ? toReport(r) : null);
}

export function subscribeReports(onChange: () => void): () => void {
  return listen(onChange);
}

export async function getAccessAlerts(): Promise<AccessAlert[]> {
  const out: AccessAlert[] = [];
  for (const a of alerts) {
    const r = reports.find((x) => x.id === a.report_id);
    if (!r || ["resolved", "closed"].includes(r.status)) continue;
    out.push({
      ...a,
      confirmed: a.confirmed || (voters.get(r.id)?.size ?? 0) >= 3,
      title: r.title,
      category: r.category,
      status: r.status,
      building: r.building,
      floor: r.floor,
      lat: r.lat,
      lng: r.lng,
      footprint: r.footprint,
    });
  }
  return delay(out);
}

export async function createReport(input: NewReport): Promise<Report> {
  const reporter = getCurrentUserId();
  const at: LngLat = [input.lng, input.lat];

  // Duplicate issue at the same pin within 24 hours: merge as a "Me too" instead of a new pin.
  if (input.kind === "issue") {
    const dup = reports.find(
      (r) =>
        r.kind === "issue" &&
        r.category === input.category &&
        (r.issue_type ?? "") === (input.issue_type ?? "") &&
        Date.parse(r.created_at) > Date.now() - 24 * 3600_000 &&
        !["resolved", "closed"].includes(r.status) &&
        turf.distance(at, [r.lng, r.lat], { units: "meters" }) <= 25,
    );
    if (dup) {
      await voteMeToo(dup.id);
      return delay(toReport(dup));
    }
  }

  const fix: FixPath = input.fix_path ?? (input.kind === "issue" ? "staff" : "lost_found");
  const style = obstacleStyleFor(input.issue_type ?? null);
  const row: ReportRow = {
    id: nextId("r"),
    reporter_id: reporter,
    kind: input.kind,
    category: input.category ?? (input.kind === "issue" ? "other" : "lost_found"),
    issue_type: input.issue_type ?? null,
    severity: input.severity ?? null,
    title: input.title || "Untitled report",
    description: input.description ?? null,
    photo_urls: input.photo_urls ?? [],
    lat: input.lat,
    lng: input.lng,
    // Zones need an area to stand up in 3D; a student pin gets a small one around it.
    footprint: input.kind === "issue" && style === "zone" ? turf.circle(at, 12, { units: "meters", steps: 10 }).geometry : null,
    building: input.building ?? null,
    floor: input.floor ?? null,
    fix_path: fix,
    hazard_flags: input.hazard_flags ?? [],
    access_impact: input.access_impact ?? [],
    routed_to: input.routed_to ?? null,
    cc: input.cc ?? [],
    identified: input.identified ?? null,
    routing_reason: input.routing_reason ?? null,
    report_subject: input.report_subject ?? null,
    report_body: input.report_body ?? null,
    contains_sensitive: input.contains_sensitive ?? false,
    status: "submitted",
    created_at: nowIso(),
  };
  reports.push(row);
  voters.set(row.id, new Set());
  statusEvents.push({ id: eventSeq++, report_id: row.id, from_status: null, to_status: "submitted", actor_id: reporter, at: row.created_at });

  if (row.kind !== "issue") {
    items.set(row.id, {
      report_id: row.id,
      category: input.item_category ?? input.issue_type ?? null,
      color: input.color ?? null,
      brand: input.brand ?? null,
      marks: input.marks ?? null,
      radius_m: input.radius_m ?? (row.kind === "lost" ? 50 : 10),
      whereabouts: row.kind === "found" ? "with_finder" : null,
      lost_from: input.lost_from ?? null,
      lost_to: input.lost_to ?? null,
      checkin_code: row.kind === "found" ? genCode() : null,
    });
    if (row.kind === "lost") {
      const where = [input.building, input.floor && `floor ${input.floor}`].filter(Boolean).join(" ");
      addMission(row.id, "search", `Keep an eye out for ${lcfirst(row.title)}${where ? `, ${where}` : ""}`, 50, "A matching found report checked in at Lost & Found");
      setStatus(row.id, "searching", reporter);
    } else {
      if (input.leave_for_delivery) {
        addMission(row.id, "delivery", `Carry ${lcfirst(row.title)} to Lost & Found`, 50, "Office check-in scan");
      }
      setStatus(row.id, "with_finder", reporter);
    }
  } else if (fix === "self_fixable") {
    createFixMission(row.id);
  } else if (row.routed_to) {
    setStatus(row.id, "routed", null);
  }

  // Student-reported obstacles show on the map and start alerting at 3 "Me too" votes.
  if (row.kind === "issue" && row.access_impact.length > 0) {
    alerts.push({
      id: nextId("aa"),
      report_id: row.id,
      affects: row.access_impact as AccessAlert["affects"],
      obstacle_style: style,
      impact: (row.severity ?? 0) >= 4 ? "blocks" : "caution",
      label: row.title,
      detour_text: null,
      detour_path: null,
      blocked_path: null,
      est_delay_min: null,
      confirmed: false,
    });
  }

  emit();
  return delay(toReport(row));
}

export async function voteMeToo(reportId: string): Promise<void> {
  const set = voters.get(reportId) ?? new Set<string>();
  set.add(getCurrentUserId());
  voters.set(reportId, set);
  if (set.size >= 3) for (const a of alerts) if (a.report_id === reportId) a.confirmed = true;
  emit();
}

export async function checkReport(reportId: string, stillThere: boolean): Promise<void> {
  const r = reportRow(reportId);
  const userId = getCurrentUserId();
  checks.push({ report_id: reportId, user_id: userId, still_there: stillThere, at: nowIso() });
  if (stillThere) {
    const set = voters.get(reportId) ?? new Set<string>();
    if (userId !== r.reporter_id) set.add(userId);
    voters.set(reportId, set);
    if (set.size >= 3) for (const a of alerts) if (a.report_id === reportId) a.confirmed = true;
  } else if (toReport(r).resolved_votes >= 3 && r.kind === "issue") {
    setStatus(reportId, "resolved", null);
    for (const m of missions) if (m.report_id === reportId && ["open", "claimed"].includes(m.status)) m.status = "cancelled";
    if (r.reporter_id) notify(r.reporter_id, `Students say "${r.title}" looks resolved. It's off the map now.`, `/?report=${reportId}`);
  }
  emit();
}

export async function claimMission(missionId: string): Promise<Mission> {
  const user = getCurrentUserId();
  const m = missionRow(missionId);
  if (lapsed(m)) Object.assign(m, { status: "open", claimed_by: null, claim_expires_at: null });
  if (m.status !== "open") throw new Error("Someone else is already on this mission");
  if (reportRow(m.report_id).reporter_id === user) throw new Error("You cannot claim a mission on your own report");
  if (missions.some((x) => x.id !== m.id && x.claimed_by === user && x.status === "claimed" && !lapsed(x))) {
    throw new Error("You already have an active mission. Finish it or let it expire first");
  }
  Object.assign(m, {
    status: "claimed",
    claimed_by: user,
    claimed_at: nowIso(),
    claim_expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
  });
  if (!["search", "delivery"].includes(m.mission_type)) setStatus(m.report_id, "in_progress", user);
  emit();
  return delay(m);
}

export async function submitProof(missionId: string, proof: NewProof): Promise<void> {
  const user = getCurrentUserId();
  const m = missionRow(missionId);
  if (m.claimed_by !== user || m.status !== "claimed") throw new Error("Claim this mission before sending proof");
  if (lapsed(m)) throw new Error("Your 30-minute claim expired. Claim the mission again");
  const r = reportRow(m.report_id);
  const dist = turf.distance([proof.lng, proof.lat], [r.lng, r.lat], { units: "meters" });
  if (dist > 50) throw new Error(`Proof must be taken within 50 m of the pin (you were ${Math.round(dist)} m away)`);

  const p: ProofRow = {
    id: nextId("p"),
    mission_id: m.id,
    helper_id: user,
    photo_urls: proof.photo_urls,
    speed_test: proof.speed_test_mbps ?? null,
    lat: proof.lat,
    lng: proof.lng,
    taken_at: proof.taken_at ?? nowIso(),
    review_status: "pending",
  };
  proofs.push(p);
  m.status = "submitted";
  credit({ user_id: user, delta: m.points, reason: `mission:${m.mission_type}`, mission_id: m.id, proof_id: p.id, report_id: r.id, state: "pending" });
  setStatus(r.id, "verifying", user);
  emit();
}

export async function reviewProof(proofId: string, approve: boolean): Promise<void> {
  const p = proofs.find((x) => x.id === proofId);
  if (!p) throw new Error("Proof not found");
  if (p.review_status !== "pending") throw new Error("This proof was already reviewed");
  const m = missionRow(p.mission_id);
  const r = reportRow(m.report_id);
  p.review_status = approve ? "approved" : "rejected";
  for (const l of ledger) {
    if (l.proof_id === p.id && l.state === "pending") l.state = approve ? "spendable" : "reversed";
  }
  if (approve) {
    Object.assign(m, { status: "completed", completed_at: nowIso() });
    setStatus(r.id, m.mission_type === "tidy" ? "resolved" : "verified", getCurrentUserId());
    notify(p.helper_id, `+${m.points} points approved: ${m.title}`, "/missions");
    if (r.reporter_id && r.reporter_id !== p.helper_id) notify(r.reporter_id, `A student checked your report: ${r.title}`, `/?report=${r.id}`);
  } else {
    Object.assign(m, { status: "open", claimed_by: null, claimed_at: null, claim_expires_at: null });
    setStatus(r.id, "mission_open", getCurrentUserId());
    notify(p.helper_id, `Proof not accepted for "${m.title}". The ${m.points} pending points were reversed.`, "/missions");
  }
  emit();
}

export async function checkInItem(code: string): Promise<{ itemTitle: string; points: number }> {
  const item = [...items.values()].find((i) => i.checkin_code === code.trim());
  if (!item) throw new Error(`No found item with code ${code.trim()}`);
  if (item.whereabouts !== "with_finder") throw new Error("This item was already checked in");
  const r = reportRow(item.report_id);

  // If another student claimed the delivery mission, they carried it in.
  const delivery = missions.find((m) => m.report_id === r.id && m.mission_type === "delivery" && m.status === "claimed" && !lapsed(m));
  const benef = delivery?.claimed_by ?? r.reporter_id;
  if (delivery) Object.assign(delivery, { status: "completed", completed_at: nowIso() });
  for (const m of missions) {
    if (m.report_id === r.id && m.mission_type === "delivery" && ["open", "claimed"].includes(m.status)) m.status = "cancelled";
  }

  const linked = matches.filter((mt) => mt.found_report_id === r.id && mt.status !== "rejected").map((mt) => reportRow(mt.lost_report_id));
  // No return reward for an item you reported lost yourself.
  const points = linked.some((l) => l.reporter_id === benef) ? 0 : 50;
  item.whereabouts = "at_office";
  if (points > 0 && benef) {
    credit({ user_id: benef, delta: points, reason: "return_checkin", mission_id: delivery?.id ?? null, report_id: r.id, state: "spendable" });
    notify(benef, `+${points} points: ${r.title} was checked in at Lost & Found. Thank you!`, "/rewards");
  }
  setStatus(r.id, "checked_in", getCurrentUserId());
  for (const l of linked) {
    setStatus(l.id, "checked_in", getCurrentUserId());
    for (const m of missions) {
      if (m.report_id === l.id && m.mission_type === "search" && ["open", "claimed", "submitted"].includes(m.status)) {
        Object.assign(m, { status: "completed", completed_at: nowIso() });
      }
    }
    notify(l.reporter_id, `Your ${lcfirst(l.title)} is at the Lost & Found office. Bring your student ID to pick it up.`, "/inbox");
  }
  emit();
  return delay({ itemTitle: r.title, points });
}

export async function markPickedUp(reportId: string): Promise<void> {
  const r = reportRow(reportId);
  const foundId =
    r.kind === "found"
      ? r.id
      : matches
          .filter((mt) => mt.lost_report_id === r.id && mt.status !== "rejected")
          .sort((a, b) => Number(b.status === "confirmed") - Number(a.status === "confirmed") || b.score - a.score)[0]?.found_report_id;
  if (!foundId) throw new Error("No found item linked to this report");
  const item = items.get(foundId);
  if (item?.whereabouts !== "at_office") throw new Error("Item is not at the Lost & Found office");
  item.whereabouts = "picked_up";
  const found = reportRow(foundId);
  const benef = ledger.find((l) => l.report_id === foundId && l.reason === "return_checkin")?.user_id;
  if (benef) {
    credit({ user_id: benef, delta: 25, reason: "owner_pickup", mission_id: null, report_id: foundId, state: "spendable" });
    notify(benef, `+25 bonus: the owner picked up ${lcfirst(found.title)}`, "/rewards");
  }
  setStatus(foundId, "closed", getCurrentUserId());
  for (const mt of matches) {
    if (mt.found_report_id === foundId && mt.status !== "rejected") {
      mt.status = "confirmed";
      setStatus(mt.lost_report_id, "closed", getCurrentUserId());
    }
  }
  emit();
}

export async function getBalance(userId: string): Promise<Balance> {
  const mine = ledger.filter((l) => l.user_id === userId);
  const sum = (state: LedgerEntry["state"]) => mine.filter((l) => l.state === state).reduce((s, l) => s + l.delta, 0);
  return delay({ pending: sum("pending"), spendable: sum("spendable") });
}

export async function redeemReward(rewardId: string): Promise<{ code: string }> {
  const user = getCurrentUserId();
  const rw = rewards.find((r) => r.id === rewardId);
  if (!rw) throw new Error("Reward not found");
  if (rw.stock !== null && rw.stock <= 0) throw new Error(`${rw.name} is out of stock`);
  const { spendable } = await getBalance(user);
  if (spendable < rw.cost_points) throw new Error(`Not enough points: you have ${spendable}, this costs ${rw.cost_points}`);
  const week = redemptions
    .filter((r) => r.user_id === user && Date.parse(r.redeemed_at) > Date.now() - 7 * 24 * 3600_000)
    .reduce((s, r) => s + r.points_spent, 0);
  if (week + rw.cost_points > 300) throw new Error(`Weekly limit reached: up to 300 points a week (${week} used)`);

  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code: string;
  do code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  while (redemptions.some((r) => r.code === code));
  redemptions.push({ id: nextId("rd"), user_id: user, reward_id: rw.id, code, points_spent: rw.cost_points, redeemed_at: nowIso() });
  credit({ user_id: user, delta: -rw.cost_points, reason: `redeem:${rw.name}`, mission_id: null, report_id: null, state: "spendable" });
  if (rw.stock !== null) rw.stock -= 1;
  emit();
  return delay({ code });
}

export async function getNotifications(userId: string): Promise<Notification[]> {
  return delay(notifications.filter((n) => n.user_id === userId).slice(0, 50));
}

// ---------------------------------------------------------------------------
// Extras the screens need (same as lib/db.ts)
// ---------------------------------------------------------------------------

export function subscribeBalance(_userId: string, onChange: () => void): () => void {
  return listen(onChange);
}

export function subscribeNotifications(_userId: string, onChange: () => void): () => void {
  return listen(onChange);
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const n = notifications.find((x) => x.id === notificationId);
  if (n) n.read = true;
  emit();
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  for (const n of notifications) if (n.user_id === userId) n.read = true;
  emit();
}

export async function getDemoPath(_name = "clark_walk"): Promise<LineString | null> {
  return delay(DEMO_GEOMETRY.walkPath);
}

/** No storage without Supabase: the photo stays in this tab as a data URL. */
export async function uploadPhoto(file: File | Blob, _folder = "reports"): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Couldn't read the photo"));
    reader.readAsDataURL(file);
  });
}

export async function getOpenLostReports(): Promise<Report[]> {
  return delay(reports.filter((r) => r.kind === "lost" && ["searching", "matched"].includes(r.status)).map(toReport));
}

export async function createMatch(lostReportId: string, foundReportId: string, score: number): Promise<Match> {
  const lost = reportRow(lostReportId);
  const found = reportRow(foundReportId);
  if (lost.kind !== "lost" || found.kind !== "found") throw new Error("create_match needs a lost report and a found report");
  let mt = matches.find((x) => x.lost_report_id === lostReportId && x.found_report_id === foundReportId);
  if (mt) mt.score = Math.max(mt.score, score);
  else {
    mt = { id: nextId("mt"), lost_report_id: lostReportId, found_report_id: foundReportId, score, status: "suggested", created_at: nowIso() };
    matches.push(mt);
  }
  const where =
    items.get(foundReportId)?.whereabouts === "with_finder"
      ? "The finder is bringing it to the Lost & Found office."
      : "It's at the Lost & Found office.";
  notify(lost.reporter_id, `Possible match for your ${lcfirst(lost.title)}. ${where}`, `/matches/${mt.id}`);
  if (lost.status === "searching") setStatus(lost.id, "matched", null);
  emit();
  return delay(mt);
}

export async function getMatch(matchId: string): Promise<{ match: Match; lost: Report; found: Report } | null> {
  const mt = matches.find((x) => x.id === matchId);
  if (!mt) return delay(null);
  return delay({ match: mt, lost: toReport(reportRow(mt.lost_report_id)), found: toReport(reportRow(mt.found_report_id)) });
}

export async function respondToMatch(matchId: string, confirm: boolean): Promise<void> {
  const mt = matches.find((x) => x.id === matchId);
  if (!mt) throw new Error("Match not found");
  const lost = reportRow(mt.lost_report_id);
  if (lost.reporter_id !== getCurrentUserId()) throw new Error("Only the owner can respond to this match");
  mt.status = confirm ? "confirmed" : "rejected";
  if (confirm) {
    const found = reportRow(mt.found_report_id);
    const atOffice = items.get(found.id)?.whereabouts === "at_office";
    notify(
      found.reporter_id,
      `The owner confirmed the ${lcfirst(found.title)} you found is theirs. ${atOffice ? "Thanks for dropping it at Lost & Found!" : "Bring it to the Lost & Found office to earn your points."}`,
      `/?report=${found.id}`,
    );
  } else if (!matches.some((x) => x.lost_report_id === lost.id && x.status !== "rejected")) {
    setStatus(lost.id, "searching", lost.reporter_id);
  }
  emit();
}

export async function getMyMissions(userId: string): Promise<Mission[]> {
  return delay(
    missions
      .filter((m) => m.claimed_by === userId)
      .map((m) => ({ ...liveMission(m), report_title: reportRow(m.report_id).title }))
      .sort((a, b) => (b.claimed_at ?? "").localeCompare(a.claimed_at ?? "")),
  );
}

export async function getLedger(userId: string): Promise<LedgerEntry[]> {
  return delay(ledger.filter((l) => l.user_id === userId).sort((a, b) => b.created_at.localeCompare(a.created_at)));
}

export async function getStatusEvents(reportId: string): Promise<StatusEvent[]> {
  return delay(statusEvents.filter((e) => e.report_id === reportId).sort((a, b) => a.at.localeCompare(b.at)));
}

export async function getCheckinCode(foundReportId: string): Promise<string | null> {
  return delay(items.get(foundReportId)?.checkin_code ?? null);
}

export async function getItemByCode(code: string): Promise<Report | null> {
  const item = [...items.values()].find((i) => i.checkin_code === code.trim());
  return delay(item ? toReport(reportRow(item.report_id)) : null);
}

export async function getItemsAtOffice(): Promise<Report[]> {
  return delay(reports.filter((r) => r.kind === "found" && items.get(r.id)?.whereabouts === "at_office").map(toReport));
}

export async function getItemsOnTheWay(): Promise<Report[]> {
  return delay(reports.filter((r) => r.kind === "found" && items.get(r.id)?.whereabouts === "with_finder").map(toReport));
}

export async function getRewards(): Promise<Reward[]> {
  return delay([...rewards].sort((a, b) => a.cost_points - b.cost_points));
}

export async function getRedemptions(userId: string): Promise<Redemption[]> {
  return delay(
    redemptions
      .filter((r) => r.user_id === userId)
      .map(({ user_id: _u, ...r }) => r)
      .sort((a, b) => b.redeemed_at.localeCompare(a.redeemed_at)),
  );
}

export async function getPendingProofs(): Promise<ProofForReview[]> {
  return delay(
    proofs
      .filter((p) => p.review_status === "pending")
      .sort((a, b) => a.taken_at.localeCompare(b.taken_at))
      .map((p) => {
        const m = missionRow(p.mission_id);
        const r = reportRow(m.report_id);
        return {
          ...p,
          helper_name: userName(p.helper_id),
          distance_m: Math.round(turf.distance([p.lng, p.lat], [r.lng, r.lat], { units: "meters" })),
          mission_type: m.mission_type,
          mission_title: m.title,
          points: m.points,
          report_id: r.id,
          report_title: r.title,
          report_photo_urls: r.photo_urls,
          fix_path: r.fix_path,
        };
      }),
  );
}

export async function overrideFixPath(reportId: string, to: FixPath, _reason?: string): Promise<void> {
  const r = reportRow(reportId);
  if (r.fix_path === to) return;
  r.fix_path = to;
  if (to === "self_fixable") createFixMission(reportId);
  else if (to === "staff") {
    for (const m of missions) if (m.report_id === reportId && ["open", "claimed"].includes(m.status)) m.status = "cancelled";
    setStatus(reportId, "routed", getCurrentUserId());
  }
  emit();
}

export async function getReportsForAuthority(authorityId: string): Promise<Report[]> {
  return delay(
    reports
      .filter((r) => r.routed_to === authorityId || r.cc.includes(authorityId))
      .map(toReport)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
  );
}
