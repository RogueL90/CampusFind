import { describe, expect, it } from "vitest";
import { DEMO_USERS, LEO, MAYA } from "./currentUser";
import type { Mission, Report } from "./types";
import { forViewer, PRIVATE_LISTING } from "./visibility";

const [maya, leo, office, moderator] = DEMO_USERS;

const report = (over: Partial<Report>): Report => ({
  id: "r-1",
  reporter_id: MAYA,
  kind: "lost",
  category: "lost_found",
  issue_type: "airpods_case",
  severity: 1,
  title: "Black AirPods case",
  description: "Cactus sticker inside the lid",
  photo_urls: ["data:image/png;base64,AAAA"],
  lat: 37.335,
  lng: -121.885,
  footprint: null,
  building: "MLK Library",
  floor: "3",
  fix_path: "lost_found",
  hazard_flags: [],
  access_impact: [],
  routed_to: "lost_found",
  cc: [],
  identified: null,
  routing_reason: null,
  report_subject: null,
  report_body: null,
  contains_sensitive: false,
  status: "searching",
  created_at: new Date().toISOString(),
  votes: 0,
  last_checked_at: null,
  last_check_still: null,
  resolved_votes: 0,
  mission: null,
  item: { category: "airpods_case", color: "black", brand: "Apple", marks: "cactus sticker", radius_m: 50, whereabouts: null, lost_from: null, lost_to: null },
  ...over,
});

const delivery = (over: Partial<Mission> = {}): Mission => ({
  id: "m-1",
  report_id: "r-2",
  mission_type: "delivery",
  title: "Carry black AirPods case to Lost & Found",
  points: 50,
  proof_required: "Office check-in scan",
  status: "open",
  claimed_by: null,
  claim_expires_at: null,
  ...over,
});

describe("forViewer", () => {
  it("shows campus issues to everyone", () => {
    const issue = report({ kind: "issue", category: "connectivity", reporter_id: MAYA });
    expect(forViewer(issue, leo)).toBe(issue);
  });

  it("shows other students a lost item that is listed on the map", () => {
    expect(forViewer(report({}), leo)?.title).toBe("Black AirPods case");
  });

  it("hides an anonymous lost item from other students", () => {
    expect(forViewer(report({ public_map: false }), leo)).toBeNull();
    expect(forViewer(report({ cc: [PRIVATE_LISTING] }), leo)).toBeNull();
  });

  it("hides an anonymous found item from other students", () => {
    expect(forViewer(report({ kind: "found", reporter_id: LEO, status: "with_finder", public_map: false }), maya)).toBeNull();
  });

  it("shows owners their own reports in full", () => {
    const lost = report({});
    expect(forViewer(lost, maya)).toBe(lost);
  });

  it("shows staff everything", () => {
    const lost = report({});
    expect(forViewer(lost, office)).toBe(lost);
    expect(forViewer(lost, moderator)).toBe(lost);
  });

  it("shows an open delivery mission as a generic task with no identifying details", () => {
    const found = report({ id: "r-2", kind: "found", reporter_id: LEO, status: "with_finder", public_map: false, mission: delivery() });
    const seen = forViewer(found, maya);
    expect(seen?.title).toBe("Found item to deliver");
    expect(seen?.mission?.title).toBe("Carry a found item to Lost & Found");
    expect(seen?.photo_urls).toEqual([]);
    expect(seen?.description).toBeNull();
    expect(seen?.item).toMatchObject({ category: null, color: null, brand: null, marks: null });
  });

  it("shows a claimed delivery in full to its carrier only", () => {
    const found = report({ id: "r-2", kind: "found", reporter_id: LEO, public_map: false, mission: delivery({ status: "claimed", claimed_by: MAYA }) });
    expect(forViewer(found, maya)).toBe(found);
    expect(forViewer({ ...found, reporter_id: "someone-else" }, leo)).toBeNull();
  });
});
