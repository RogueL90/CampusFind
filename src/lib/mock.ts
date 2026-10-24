import type { Mission, NewProof, Notification, Report, Reward } from "@/lib/types";

const now = Date.now();
let reports: Report[] = [
  { id: "r-lost", title: "Black AirPods case · MLK Library, floor 3", category: "Lost item", type: "lost", status: "open", routed_to: "Lost & Found", photo_url: "", lat: 37.3356, lng: -121.8852, created_at: new Date(now - 3600000).toISOString(), status_events: [{ label: "Report submitted", at: "Today · 10:42 AM", complete: true }, { label: "Searching campus", at: "Mission available", complete: false }], votes: 0, reporter_name: "Maya Chen" },
  { id: "r-found", title: "Found: black AirPods case", category: "Found item", type: "found", status: "open", routed_to: "Lost & Found office", photo_url: "", lat: 37.3353, lng: -121.8855, created_at: new Date(now - 900000).toISOString(), status_events: [{ label: "Found by Leo", at: "Today · 11:18 AM", complete: true }, { label: "Checked in at office", at: "Waiting", complete: false }, { label: "Owner pickup", at: "Waiting", complete: false }], votes: 2, finder_code: "482731", finder_name: "Leo Rivera" },
  { id: "r-fix", title: "Bottle filler red light · Student Union 2F", category: "Facilities", type: "issue", status: "open", routed_to: "Facilities", photo_url: "", lat: 37.3361, lng: -121.8813, created_at: new Date(now - 7200000).toISOString(), status_events: [{ label: "Report submitted", at: "Today · 9:06 AM", complete: true }, { label: "Mission available", at: "Earn 40 points", complete: false }], votes: 4 },
];
let missions: Mission[] = [
  { id: "m-lost", report_id: "r-lost", report_title: "Help Maya find her AirPods case", points: 50, proof_needed: "Photo of the item at the Lost & Found desk", status: "available" },
  { id: "m-fix", report_id: "r-fix", report_title: "Check the Student Union bottle filler", points: 40, proof_needed: "Photo showing the red indicator light", status: "active", claimed_at: new Date(now - 14 * 60000).toISOString(), claim_expires_at: new Date(now + 16 * 60000).toISOString(), user_id: "leo" },
  { id: "m-done", report_id: "r-old", report_title: "Returned a student ID to the office", points: 50, proof_needed: "Checked in", status: "completed" },
];
let spendable = 60;
let pending = 40;
const notifications: Notification[] = [{ id: "n1", text: "Your check-in earned +50 points. Nice work, Leo!", read: false, created_at: new Date(now - 1200000).toISOString() }];
export const rewards: Reward[] = [{ id: "meal-5", title: "$5 campus dining credit", points_cost: 100, description: "Redeem at participating campus dining locations." }];
const STORAGE_KEY = "campus-quests-demo-state";
function hydrateMock() {
  if (typeof window === "undefined") return;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const state = JSON.parse(saved) as { reports?: Report[]; missions?: Mission[]; spendable?: number; pending?: number };
    if (Array.isArray(state.reports) && Array.isArray(state.missions) && typeof state.spendable === "number" && typeof state.pending === "number") {
      reports = state.reports;
      missions = state.missions;
      spendable = state.spendable;
      pending = state.pending;
    }
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}
export async function getReports() { hydrateMock(); return reports; }
export function subscribeReports(onChange: () => void) { const listener = () => onChange(); if (typeof window !== "undefined") window.addEventListener("campus-quests:update", listener); return () => { if (typeof window !== "undefined") window.removeEventListener("campus-quests:update", listener); }; }
export async function getMissions() { hydrateMock(); return missions; }
export async function getReport(id: string) { hydrateMock(); return reports.find((report) => report.id === id); }
export async function claimMission(missionId: string) { hydrateMock(); const mission = missions.find((item) => item.id === missionId);
  if (!mission || mission.status !== "available") throw new Error("This mission is no longer available.");
  mission.status = "active";
  mission.claimed_at = new Date().toISOString();
  mission.claim_expires_at = new Date(Date.now() + 30 * 60000).toISOString();
  mission.user_id = "leo";
  dispatch();
  return mission;
}
export async function submitProof(missionId: string, proof: NewProof) { hydrateMock(); const mission = missions.find((item) => item.id === missionId);
  if (!mission || mission.status !== "active") throw new Error("An active mission is required to submit proof.");
  if (mission.claim_expires_at && Date.now() > new Date(mission.claim_expires_at).getTime()) throw new Error("The 30-minute claim window has expired.");
  mission.status = "proof_pending";
  mission.proof = proof;
  const report = reports.find((item) => item.id === mission.report_id);
  if (report) report.status = "proof_pending";
  pending += mission.points;
  dispatch();
}
export async function reviewProof(proofId: string, approve: boolean) { hydrateMock(); const mission = missions.find((item) => item.id === proofId);
  if (!mission || mission.status !== "proof_pending") throw new Error("Proof is no longer awaiting review.");
  if (approve) {
    mission.status = "completed";
    pending = Math.max(0, pending - mission.points);
    spendable += mission.points;
  } else {
    mission.status = "active";
    pending = Math.max(0, pending - mission.points);
  }
  dispatch();
}
export async function checkInItem(code: string) { hydrateMock(); const report = reports.find((item) => item.finder_code === code);
  if (!report) throw new Error("No item matches that check-in code.");
  if (report.status !== "open") throw new Error("This item has already been checked in.");
  report.status = "at_office";
  spendable += 50;
  const checkInEvent = report.status_events.find((event) => event.label === "Checked in at office");
  if (checkInEvent) {
    checkInEvent.at = "Just now";
    checkInEvent.complete = true;
  } else report.status_events.push({ label: "Checked in at office", at: "Just now", complete: true });
  dispatch();
  return { itemTitle: report.title, points: 50 };
}
export async function markPickedUp(reportId: string) { hydrateMock(); const report = reports.find((item) => item.id === reportId);
  if (!report || report.status !== "at_office") throw new Error("This item is not waiting for owner pickup.");
  report.status = "picked_up";
  const pickupEvent = report.status_events.find((event) => event.label === "Owner pickup");
  if (pickupEvent) {
    pickupEvent.at = "Just now";
    pickupEvent.complete = true;
  } else report.status_events.push({ label: "Owner picked up", at: "Just now", complete: true });
  spendable += 25;
  dispatch();
}
export async function getBalance(_userId: string) { hydrateMock(); return { pending, spendable }; }
export async function redeemReward(rewardId: string) { hydrateMock(); const reward = rewards.find((item) => item.id === rewardId);
  if (!reward || spendable < reward.points_cost) throw new Error("You need more spendable points to redeem this reward.");
  spendable -= reward.points_cost;
  dispatch();
  return { code: `CQ-${Math.random().toString(36).slice(2, 8).toUpperCase()}` };
}
export async function getNotifications(_userId: string) { hydrateMock(); return notifications; }
export function getProofQueue() { hydrateMock(); return missions.filter((mission) => mission.status === "proof_pending"); }
export function getReportSync(id: string) { hydrateMock(); return reports.find((report) => report.id === id); }
function dispatch() { if (typeof window !== "undefined") { try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ reports, missions, spendable, pending })); } catch { console.warn("Demo state could not be persisted; clear older demo proof data if storage is full."); } window.dispatchEvent(new Event("campus-quests:update")); } }
