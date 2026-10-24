import { describe, expect, it } from "vitest";
import { categoryScore, colorBrandScore, distanceScore, MATCH_THRESHOLD, scoreMatch, timeScore } from "./matchScore";
import type { Report } from "./types";

const MLK = { lat: 37.33544, lng: -121.88501 };

function report(over: Partial<Report> & Pick<Report, "kind">): Report {
  return {
    id: "r",
    reporter_id: "u",
    category: "lost_found",
    issue_type: "airpods_case",
    severity: 1,
    title: "",
    description: null,
    photo_urls: [],
    lat: MLK.lat,
    lng: MLK.lng,
    footprint: null,
    building: null,
    floor: null,
    fix_path: "lost_found",
    hazard_flags: [],
    access_impact: [],
    routed_to: null,
    cc: [],
    identified: null,
    routing_reason: null,
    report_subject: null,
    report_body: null,
    contains_sensitive: false,
    status: "open",
    created_at: "2026-10-24T18:00:00Z",
    votes: 0,
    mission: null,
    item: null,
    ...over,
  };
}

describe("categoryScore", () => {
  it("matches identical and near-identical item types", () => {
    expect(categoryScore("airpods_case", "AirPods case")).toBe(1);
    expect(categoryScore("airpods_case", "earbuds_case")).toBe(0.5);
    expect(categoryScore("water_bottle", "laptop")).toBe(0);
  });
});

describe("colorBrandScore", () => {
  it("rewards matching color and brand, half credit for unknowns", () => {
    expect(colorBrandScore({ color: "Black", brand: "Apple" }, { color: "matte black", brand: "apple" })).toBe(1);
    expect(colorBrandScore({ color: "black", brand: null }, { color: "black", brand: "Apple" })).toBe(0.75);
    expect(colorBrandScore({ color: "white", brand: "Apple" }, { color: "black", brand: "Sony" })).toBe(0);
  });
});

describe("distanceScore", () => {
  it("is 1 inside the lost circle and falls off outside", () => {
    expect(distanceScore({ ...MLK, radius_m: 50 }, { lat: MLK.lat + 0.0002, lng: MLK.lng })).toBe(1); // ~22 m
    const far = distanceScore({ ...MLK, radius_m: 50 }, { lat: MLK.lat + 0.003, lng: MLK.lng }); // ~333 m
    expect(far).toBeGreaterThan(0);
    expect(far).toBeLessThan(0.5);
    expect(distanceScore({ ...MLK, radius_m: 50 }, { lat: MLK.lat + 0.02, lng: MLK.lng })).toBe(0);
  });
});

describe("timeScore", () => {
  const lost = { created_at: "2026-10-24T18:00:00Z", lost_from: "2026-10-24T14:00:00Z", lost_to: "2026-10-24T16:00:00Z" };
  it("is 1 inside the window, 0 well before it, and decays after it", () => {
    expect(timeScore(lost, "2026-10-24T15:00:00Z")).toBe(1);
    expect(timeScore(lost, "2026-10-24T10:00:00Z")).toBe(0);
    expect(timeScore(lost, "2026-10-25T16:00:00Z")).toBeCloseTo(1 - 24 / 72);
  });
});

describe("scoreMatch", () => {
  it("scores the demo AirPods case above the threshold", () => {
    const lost = report({
      kind: "lost",
      item: { category: "airpods_case", color: "black", brand: "Apple", marks: "sticker", radius_m: 50, lost_from: null, lost_to: null, whereabouts: null },
    });
    const found = report({
      kind: "found",
      created_at: "2026-10-24T19:00:00Z",
      lat: MLK.lat + 0.0001,
      item: { category: "airpods case", color: "Black", brand: "Apple", marks: null, radius_m: 10, lost_from: null, lost_to: null, whereabouts: "with_finder" },
    });
    const s = scoreMatch(lost, found, 0.8);
    expect(s.total).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
    expect(s.total).toBeCloseTo(0.3 + 0.2 + 0.2 + 0.1 + 0.16);
  });

  it("keeps a different item in the same spot below the threshold", () => {
    const lost = report({ kind: "lost", item: { category: "water_bottle", color: "blue", brand: "Hydro Flask", marks: null, radius_m: 50, lost_from: null, lost_to: null, whereabouts: null } });
    const found = report({ kind: "found", issue_type: "laptop", item: { category: "laptop", color: "silver", brand: "Dell", marks: null, radius_m: 10, lost_from: null, lost_to: null, whereabouts: null } });
    expect(scoreMatch(lost, found, 0.1).total).toBeLessThan(MATCH_THRESHOLD);
  });
});
