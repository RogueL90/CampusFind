import { describe, expect, it } from "vitest";
import * as mock from "../mock";
import type { AccessNeed } from "../types";
import { alertSpeech, buildObstacles } from "./obstacles";
import { brokenAmenities, destinationBarriers, needsStepFree, progressAlong, currentStep, routeToAmenity, routeToBuilding } from "./route";
import type { LngLat } from "./campus";

const MLK_CORNER: LngLat = [-121.88516, 37.336112];
const SU_NE_DOORS: LngLat = [-121.879599, 37.336804];
const TOWER_LAWN: LngLat = [-121.8833, 37.3352];

async function setup(needs: AccessNeed[]) {
  const [reports, alerts] = await Promise.all([mock.getReports(), mock.getAccessAlerts()]);
  return { reports, obstacles: buildObstacles(reports, alerts, needs), needs };
}

const ids = (xs: { report: { id: string } }[]) => xs.map((o) => o.report.id);

describe("routeToBuilding", () => {
  it("finds a walking route with steps that ends at the building", async () => {
    const { obstacles, needs } = await setup([]);
    const r = routeToBuilding(MLK_CORNER, "MacQuarrie Hall", { needs, obstacles })!;
    expect(r).not.toBeNull();
    expect(r.destination.building).toBe("MacQuarrie Hall");
    expect(r.distanceM).toBeGreaterThan(200);
    expect(r.distanceM).toBeLessThan(900);
    expect(r.steps[0].text).toMatch(/^Head /);
    expect(r.steps.at(-1)!.text).toMatch(/^Arrive at MacQuarrie Hall/);
    expect(r.path.coordinates[0]).toEqual(MLK_CORNER);
  });

  it("sends a wheelchair user to the verified south entrance when the north doors are blocked", async () => {
    const { obstacles, needs } = await setup(["wheelchair"]);
    const r = routeToBuilding(MLK_CORNER, "MacQuarrie Hall", { needs, obstacles })!;
    expect(r.stepFree).toBe(true);
    expect(r.destination.entrance?.label).toMatch(/South entrance/);
    expect(r.destination.entrance?.verifiedMinAgo).not.toBeNull();
  });

  it("only avoids obstacles that affect the student's needs", async () => {
    const lowVision = await setup(["low_vision"]);
    const r = routeToBuilding(MLK_CORNER, "MacQuarrie Hall", { needs: lowVision.needs, obstacles: lowVision.obstacles })!;
    expect(ids(r.avoided)).not.toContain("r-mq-door");
  });

  it("routes around the Clark Hall construction zone for a wheelchair user", async () => {
    const { obstacles, needs } = await setup(["wheelchair"]);
    const r = routeToBuilding(MLK_CORNER, "Clark Hall", { needs, obstacles })!;
    expect(r).not.toBeNull();
    const zone = obstacles.find((o) => o.report.id === "r-clark-construction")!;
    const ring = zone.report.footprint!.coordinates[0];
    const [minX, maxX] = [Math.min(...ring.map((p) => p[0])), Math.max(...ring.map((p) => p[0]))];
    const [minY, maxY] = [Math.min(...ring.map((p) => p[1])), Math.max(...ring.map((p) => p[1]))];
    const inside = r.path.coordinates.some(([x, y]) => x > minX && x < maxX && y > minY && y < maxY);
    expect(inside).toBe(false);
  });

  it("returns null for an unknown building", async () => {
    const { obstacles, needs } = await setup([]);
    expect(routeToBuilding(MLK_CORNER, "Hogwarts", { needs, obstacles })).toBeNull();
  });
});

describe("routeToAmenity", () => {
  it("skips the broken Student Union filler and goes to a working fountain", async () => {
    const { reports, obstacles, needs } = await setup([]);
    expect(brokenAmenities(reports).has("w-su")).toBe(true);
    const r = routeToAmenity(SU_NE_DOORS, "water", reports, { needs, obstacles })!;
    expect(r.destination.kind).toBe("amenity");
    expect(r.destination.amenity?.id).not.toBe("w-su");
    expect(r.skipped.map((a) => a.id)).toContain("w-su");
    expect(r.steps.at(-1)!.text).toMatch(/^Arrive: /);
  });

  it("doesn't mention broken fountains that were farther away anyway", async () => {
    const { reports, obstacles, needs } = await setup(["wheelchair"]);
    expect(routeToAmenity(MLK_CORNER, "water", reports, { needs, obstacles })!.skipped).toEqual([]);
  });

  it("picks a nearby fountain from the middle of campus", async () => {
    const { reports, obstacles, needs } = await setup(["wheelchair"]);
    const r = routeToAmenity(TOWER_LAWN, "water", reports, { needs, obstacles })!;
    expect(r.distanceM).toBeLessThan(250);
  });
});

describe("helpers", () => {
  it("knows which needs rule out stairs", () => {
    expect(needsStepFree(["wheelchair"])).toBe(true);
    expect(needsStepFree(["crutches"])).toBe(true);
    expect(needsStepFree(["low_vision"])).toBe(false);
    expect(needsStepFree([])).toBe(false);
  });

  it("tracks progress and the current step along a route", async () => {
    const { obstacles, needs } = await setup([]);
    const r = routeToBuilding(MLK_CORNER, "Clark Hall", { needs, obstacles })!;
    expect(progressAlong(r, MLK_CORNER)).toBeCloseTo(0, 0);
    expect(currentStep(r, 0)).toBe(0);
    expect(currentStep(r, r.distanceM)).toBe(r.steps.length - 1);
    const end = r.path.coordinates.at(-1) as LngLat;
    expect(progressAlong(r, end)).toBeCloseTo(r.distanceM, 0);
  });

  it("lists reported barriers at the destination", async () => {
    const { reports, obstacles } = await setup(["wheelchair"]);
    const r = routeToBuilding(MLK_CORNER, "MacQuarrie Hall", { needs: ["wheelchair"], obstacles })!;
    expect(destinationBarriers(r.destination, reports).map((x) => x.id)).toContain("r-mq-door");
  });

  it("words spoken warnings by place", async () => {
    const { obstacles } = await setup(["wheelchair"]);
    const read = (id: string) => ({ id, distance: 42.4, bearing: 0, obstacle: obstacles.find((o) => o.report.id === id)! });
    expect(alertSpeech(read("r-union-ramp"))).toMatch(/^Reported obstruction ahead near the Student Union entrance: Ramp blocked, 42 meters\. Use the northeast doors/);
    expect(alertSpeech(read("r-paseo-pothole"))).toMatch(/^Reported hazard ahead on your route: Pothole, 42 meters/);
    expect(alertSpeech(read("r-mlk-elevator"))).toMatch(/inside MLK Library: Elevator out, floors 2–5/);
  });
});
