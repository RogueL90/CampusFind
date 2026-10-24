import { DEMO_GEOMETRY, type LngLat } from "@/lib/geo/campus";
import { DEMO_USERS, getCurrentUserId } from "@/lib/currentUser";
import type {
  AccessAlert,
  Balance,
  LedgerEntry,
  Mission,
  MissionType,
  NewProof,
  NewReport,
  Notification,
  Proof,
  Report,
  ReportStatus,
  Reward,
  User,
} from "@/lib/types";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
let seq = 1000;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

type Seed = Partial<Report> &
  Pick<Report, "id" | "category" | "title" | "issue_type"> & { at: LngLat; mission?: Mission | null };

function makeReport(s: Seed): Report {
  const { at, ...rest } = s;
  return {
    reporter_id: "u-maya",
    kind: "issue",
    severity: 2,
    description: "",
    photo_urls: [],
    footprint: null,
    area_radius_m: null,
    building: null,
    floor: null,
    fix_path: "staff",
    hazard_flags: [],
    access_impact: [],
    routed_to: "Facilities",
    status: "routed",
    votes: 0,
    created_at: minutesAgo(90),
    mission: null,
    ...rest,
    lng: at[0],
    lat: at[1],
  };
}

function makeMission(reportId: string, type: MissionType, points: number, proof: string): Mission {
  return {
    id: `m-${reportId}`,
    report_id: reportId,
    mission_type: type,
    points,
    proof_required: proof,
    claimed_by: null,
    claim_expires_at: null,
    status: "open",
  };
}

const G = DEMO_GEOMETRY;

const reports: Report[] = [
  makeReport({
    id: "r-clark-construction",
    category: "paths",
    issue_type: "construction",
    title: "Construction at Clark Hall north entrance",
    description: "Service road and north doors fenced off for utility work.",
    severity: 4,
    at: G.clarkConstruction.center,
    footprint: G.clarkConstruction.footprint,
    building: "Clark Hall",
    routed_to: "Facilities Development & Operations",
    status: "being_fixed",
    votes: 6,
    access_impact: ["wheelchair", "crutches", "low_vision", "no_stairs"],
    hazard_flags: ["construction"],
    created_at: minutesAgo(60 * 26),
  }),
  makeReport({
    id: "r-paseo-pothole",
    category: "paths",
    issue_type: "pothole",
    title: "Pothole on Paseo de César Chávez",
    severity: 3,
    at: G.paseoPothole.center,
    routed_to: "Grounds",
    votes: 4,
    access_impact: ["wheelchair", "crutches", "low_vision"],
    created_at: minutesAgo(300),
  }),
  makeReport({
    id: "r-union-ramp",
    category: "accessibility",
    issue_type: "blocked_ramp",
    title: "Ramp blocked by delivery carts, Student Union east entrance",
    severity: 4,
    at: G.unionRamp.center,
    building: "Student Union",
    routed_to: "Student Union Facilities",
    votes: 3,
    access_impact: ["wheelchair", "crutches"],
    created_at: minutesAgo(45),
    mission: makeMission("r-union-ramp", "access_check", 10, "Geotagged photo at the ramp"),
  }),
  makeReport({
    id: "r-mlk-elevator",
    category: "accessibility",
    issue_type: "broken_elevator",
    title: "Elevator out of service, MLK Library",
    severity: 4,
    at: G.libraryElevator.center,
    building: "MLK Library",
    floor: "2–5",
    routed_to: "Library Facilities",
    votes: 8,
    access_impact: ["wheelchair", "crutches", "no_stairs"],
    created_at: minutesAgo(60 * 5),
  }),
  makeReport({
    id: "r-wsq-scaffold",
    category: "paths",
    issue_type: "scaffolding",
    title: "Low scaffolding over sidewalk, Washington Square Hall",
    severity: 2,
    at: G.washingtonSquareScaffold.center,
    building: "Washington Square Hall",
    routed_to: "Facilities",
    votes: 2,
    access_impact: ["low_vision"],
    created_at: minutesAgo(60 * 30),
  }),
  makeReport({
    id: "r-mlk-wifi",
    category: "connectivity",
    issue_type: "slow_wifi",
    title: "Wi-Fi crawling on MLK floor 4 study rooms",
    at: [-121.88485, 37.33538],
    building: "MLK Library",
    floor: "4",
    routed_to: "IT Services",
    fix_path: "self_fixable",
    status: "open_mission",
    votes: 11,
    severity: 3,
    mission: makeMission("r-mlk-wifi", "verify", 5, "In-app speed test at the pin"),
  }),
  makeReport({
    id: "r-su-filler",
    category: "water",
    issue_type: "broken_filler",
    title: "Bottle filler red light, Student Union 2nd floor",
    at: [-121.88095, 37.33652],
    building: "Student Union",
    floor: "2",
    routed_to: "Student Union Facilities",
    fix_path: "self_fixable",
    status: "open_mission",
    votes: 5,
    mission: makeMission("r-su-filler", "verify", 5, "Photo of the filler"),
  }),
  makeReport({
    id: "r-tower-trash",
    category: "waste",
    issue_type: "overflowing_bin",
    title: "Overflowing bins by Tower Lawn",
    at: [-121.8833, 37.33515],
    routed_to: "Grounds",
    votes: 3,
    severity: 2,
  }),
  makeReport({
    id: "r-event-litter",
    category: "waste",
    issue_type: "litter",
    title: "Litter after event outside Event Center",
    at: [-121.88035, 37.33545],
    fix_path: "self_fixable",
    status: "open_mission",
    severity: 1,
    mission: makeMission("r-event-litter", "tidy", 10, "Before and after photos"),
  }),
  makeReport({
    id: "r-dining-rats",
    category: "pests",
    issue_type: "rats",
    title: "Rats near Dining Commons loading dock",
    at: [-121.87845, 37.33395],
    routed_to: "Housing Facilities",
    votes: 7,
    severity: 3,
    hazard_flags: ["pests"],
  }),
  makeReport({
    id: "r-lost-airpods",
    kind: "lost",
    category: "lost_found",
    issue_type: "earbuds",
    title: "Lost: black AirPods case",
    description: "Black case with a small Spartans sticker. Lost between 2 and 4 PM.",
    at: [-121.88492, 37.33547],
    area_radius_m: 50,
    building: "MLK Library",
    floor: "3",
    fix_path: "lost_found",
    routed_to: null,
    status: "lost_open",
    severity: 1,
    created_at: minutesAgo(40),
    mission: makeMission("r-lost-airpods", "search", 50, "A found report that matches it"),
  }),
  makeReport({
    id: "r-found-bottle",
    kind: "found",
    reporter_id: "u-leo",
    category: "lost_found",
    issue_type: "water_bottle",
    title: "Found: teal Hydro Flask",
    at: [-121.8826, 37.33604],
    building: "Clark Hall",
    fix_path: "lost_found",
    routed_to: null,
    status: "submitted",
    severity: 1,
    created_at: minutesAgo(15),
    mission: makeMission("r-found-bottle", "return", 50, "Office check-in scan"),
  }),
  makeReport({
    id: "r-ccb-chairs",
    category: "waste",
    issue_type: "chairs",
    title: "Chairs piled in CCB study room 101",
    at: [-121.88188, 37.33556],
    building: "Central Classroom Building",
    fix_path: "self_fixable",
    status: "open_mission",
    severity: 1,
    mission: makeMission("r-ccb-chairs", "tidy", 10, "Before and after photos"),
  }),
];

const accessAlerts: AccessAlert[] = [
  {
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
];

const ledger: LedgerEntry[] = [
  {
    id: "l-seed-leo",
    user_id: "u-leo",
    delta: 60,
    reason: "Earlier missions",
    mission_id: null,
    state: "spendable",
    created_at: minutesAgo(60 * 48),
  },
];

const rewards: Reward[] = [
  { id: "rw-meal-5", name: "$5 campus meal credit", cost_points: 100, partner: "Spartan Eats", stock: 200 },
  { id: "rw-coffee", name: "Free coffee at Peet's (Student Union)", cost_points: 60, partner: "Peet's", stock: 50 },
];

const notifications: Notification[] = [];

const proofs: Proof[] = [];

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const clone = <T>(v: T): T => structuredClone(v);
const delay = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(clone(v)), 80));

function findMission(missionId: string) {
  const report = reports.find((r) => r.mission?.id === missionId);
  if (!report?.mission) throw new Error("Mission not found");
  return { report, mission: report.mission };
}

function setStatus(report: Report, status: ReportStatus) {
  report.status = status;
}

function notify(userId: string, text: string, link: string | null = null) {
  notifications.unshift({
    id: nextId("n"),
    user_id: userId,
    text,
    link,
    read: false,
    created_at: new Date().toISOString(),
  });
}

function credit(userId: string, delta: number, reason: string, missionId: string | null, state: LedgerEntry["state"]) {
  ledger.push({
    id: nextId("l"),
    user_id: userId,
    delta,
    reason,
    mission_id: missionId,
    state,
    created_at: new Date().toISOString(),
  });
}

export function checkinCodeFor(reportId: string): string {
  let h = 0;
  for (const ch of reportId) h = (h * 31 + ch.charCodeAt(0)) % 1_000_000;
  return String(h).padStart(6, "0");
}

export async function getUsers(): Promise<User[]> {
  return delay(DEMO_USERS);
}

export async function getReports(): Promise<Report[]> {
  const now = Date.now();
  for (const r of reports) {
    const m = r.mission;
    if (m?.status === "claimed" && m.claim_expires_at && Date.parse(m.claim_expires_at) < now) {
      m.status = "open";
      m.claimed_by = null;
      m.claim_expires_at = null;
    }
  }
  return delay(reports);
}

export function subscribeReports(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export async function getAccessAlerts(): Promise<AccessAlert[]> {
  return delay(accessAlerts);
}

export async function createReport(input: NewReport): Promise<Report> {
  const id = nextId("r");
  const status: ReportStatus =
    input.fix_path === "staff"
      ? "routed"
      : input.fix_path === "self_fixable"
        ? "open_mission"
        : input.kind === "lost"
          ? "lost_open"
          : "submitted";
  const mission =
    input.fix_path === "self_fixable"
      ? makeMission(id, "verify", 5, "Photo at the pin")
      : input.kind === "lost"
        ? makeMission(id, "search", 50, "A found report that matches it")
        : input.kind === "found"
          ? makeMission(id, "return", 50, "Office check-in scan")
          : null;
  const report = makeReport({
    ...input,
    id,
    at: [input.lng, input.lat],
    description: input.description ?? "",
    status,
    created_at: new Date().toISOString(),
    mission,
  });
  reports.push(report);
  emit();
  return delay(report);
}

export async function voteMeToo(reportId: string): Promise<void> {
  const r = reports.find((x) => x.id === reportId);
  if (r) r.votes += 1;
  emit();
}

export async function claimMission(missionId: string): Promise<Mission> {
  const userId = getCurrentUserId();
  const { report, mission } = findMission(missionId);
  if (report.reporter_id === userId) throw new Error("You can't claim a mission on your own report.");
  if (mission.status !== "open") throw new Error("Someone already claimed this mission.");
  const active = reports.some((r) => r.mission?.claimed_by === userId && r.mission.status === "claimed");
  if (active) throw new Error("Finish your active mission first.");
  mission.status = "claimed";
  mission.claimed_by = userId;
  mission.claim_expires_at = new Date(Date.now() + 30 * 60_000).toISOString();
  if (report.status === "open_mission") setStatus(report, "claimed");
  emit();
  return delay(mission);
}

export async function submitProof(missionId: string, proof: NewProof): Promise<void> {
  const { report, mission } = findMission(missionId);
  proofs.push({
    ...proof,
    id: nextId("p"),
    mission_id: missionId,
    review_status: "pending",
    taken_at: new Date().toISOString(),
  });
  mission.status = "proof_uploaded";
  setStatus(report, "proof_uploaded");
  credit(proof.helper_id, mission.points, `Mission: ${report.title}`, missionId, "pending");
  emit();
}

export async function getPendingProofs(): Promise<(Proof & { report: Report })[]> {
  const pending = proofs
    .filter((p) => p.review_status === "pending")
    .map((p) => ({ ...p, report: findMission(p.mission_id).report }));
  return delay(pending);
}

export async function reviewProof(proofId: string, approve: boolean): Promise<void> {
  const proof = proofs.find((p) => p.id === proofId);
  if (!proof) throw new Error("Proof not found");
  const { report, mission } = findMission(proof.mission_id);
  proof.review_status = approve ? "approved" : "rejected";
  const entry = ledger.find((l) => l.mission_id === mission.id && l.state === "pending");
  if (entry) entry.state = approve ? "spendable" : "reversed";
  if (approve) {
    mission.status = "verified";
    setStatus(report, "verified");
    notify(proof.helper_id, `+${mission.points} points: "${report.title}" verified.`, "/rewards");
  } else {
    mission.status = "open";
    mission.claimed_by = null;
    mission.claim_expires_at = null;
    setStatus(report, "open_mission");
    notify(proof.helper_id, `Proof for "${report.title}" was not accepted.`, "/missions");
  }
  emit();
}

export async function getCheckinCode(reportId: string): Promise<string> {
  return checkinCodeFor(reportId);
}

export async function checkInItem(code: string): Promise<{ itemTitle: string; points: number }> {
  const report = reports.find((r) => r.kind === "found" && checkinCodeFor(r.id) === code.trim());
  if (!report) throw new Error("No found item with that code.");
  if (report.status === "checked_in" || report.status === "picked_up") throw new Error("Already checked in.");
  const points = report.mission?.points ?? 50;
  setStatus(report, "checked_in");
  if (report.mission) report.mission.status = "verified";
  credit(report.reporter_id, points, `Returned: ${report.title}`, report.mission?.id ?? null, "spendable");
  notify(report.reporter_id, `+${points} points: ${report.title} checked in at Lost & Found.`, "/rewards");
  emit();
  return delay({ itemTitle: report.title, points });
}

export async function markPickedUp(reportId: string): Promise<void> {
  const report = reports.find((r) => r.id === reportId);
  if (!report) throw new Error("Report not found");
  setStatus(report, "picked_up");
  credit(report.reporter_id, 25, `Owner picked up: ${report.title}`, report.mission?.id ?? null, "spendable");
  notify(report.reporter_id, `+25 bonus: the owner picked up ${report.title}.`, "/rewards");
  emit();
}

export async function getBalance(userId: string): Promise<Balance> {
  const mine = ledger.filter((l) => l.user_id === userId);
  const sum = (state: LedgerEntry["state"]) =>
    mine.filter((l) => l.state === state).reduce((s, l) => s + l.delta, 0);
  return delay({ pending: sum("pending"), spendable: sum("spendable") });
}

export async function getRewards(): Promise<Reward[]> {
  return delay(rewards);
}

export async function redeemReward(rewardId: string): Promise<{ code: string }> {
  const userId = getCurrentUserId();
  const reward = rewards.find((r) => r.id === rewardId);
  if (!reward) throw new Error("Reward not found");
  const { spendable } = await getBalance(userId);
  if (spendable < reward.cost_points) throw new Error("Not enough spendable points yet.");
  credit(userId, -reward.cost_points, `Redeemed: ${reward.name}`, null, "spendable");
  reward.stock -= 1;
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  emit();
  return delay({ code });
}

export async function getNotifications(userId: string): Promise<Notification[]> {
  return delay(notifications.filter((n) => n.user_id === userId));
}
