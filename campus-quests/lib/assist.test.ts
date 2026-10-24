import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clampText, interpretDestination, interpretNeeds, keywordDestination, keywordNeeds, sanitizeState, type AssistState } from "./assist";

const NONE: AssistState = { needs: [], hidden: [] };

describe("keywordNeeds", () => {
  it("turns on wheelchair routing", () => {
    const r = keywordNeeds("I use a wheelchair", NONE);
    expect(r.needs).toEqual(["wheelchair"]);
    expect(r.focus).toBeNull();
    expect(r.summary).toMatch(/wheelchair routes on/i);
  });

  it("handles blind + water, with voice and sound", () => {
    const r = keywordNeeds("I'm blind and want water", NONE);
    expect(r.needs).toEqual(["low_vision"]);
    expect(r.alerts).toMatchObject({ voice: true, sound: true });
    expect(r.focus).toEqual(expect.arrayContaining(["water", "paths", "accessibility"]));
    expect(r.focus).not.toContain("waste");
    expect(r.summary).toMatch(/Other pins hidden/);
  });

  it("reads 'no stairs' as a need, not a negation", () => {
    expect(keywordNeeds("no stairs please", NONE).needs).toEqual(["no_stairs"]);
    expect(keywordNeeds("I can't do steps", NONE).needs).toEqual(["no_stairs"]);
  });

  it("deselects a need", () => {
    const r = keywordNeeds("I don't need step-free anymore", { needs: ["no_stairs", "crutches"], hidden: [] });
    expect(r.needs).toEqual(["crutches"]);
    expect(r.summary).toMatch(/step-free routes off/i);
  });

  it("keeps current needs and adds new ones", () => {
    expect(keywordNeeds("I'm on crutches", { needs: ["low_vision"], hidden: [] }).needs).toEqual(["low_vision", "crutches"]);
  });

  it("shows barriers only", () => {
    const r = keywordNeeds("show barriers", NONE);
    expect(r.focus).toEqual(["paths", "accessibility"]);
  });

  it("hides a category and keeps the rest", () => {
    const r = keywordNeeds("hide waste", { needs: [], hidden: ["pests"] });
    expect(r.focus).not.toContain("waste");
    expect(r.focus).not.toContain("pests");
    expect(r.focus).toContain("water");
  });

  it("shows everything again", () => {
    expect(keywordNeeds("show everything", { needs: [], hidden: ["waste"] }).focus).toHaveLength(8);
  });

  it("maps deaf to vibration", () => {
    expect(keywordNeeds("I'm deaf", NONE).alerts).toEqual({ vibrate: true, sound: false, voice: false });
  });
});

describe("keywordDestination", () => {
  it.each([
    ["Maquerie hall", "MacQuarrie Hall"],
    ["take me to macquarie", "MacQuarrie Hall"],
    ["mlk", "Doctor Martin Luther King Junior Library"],
    ["the library", "Doctor Martin Luther King Junior Library"],
    ["student union", "Diaz Compean Student Union"],
    ["SU", "Diaz Compean Student Union"],
    ["clark", "Robert D. Clark Hall"],
  ])("%s -> %s", (text, name) => {
    expect(keywordDestination(text)).toMatchObject({ kind: "building", name });
  });

  it("finds the nearest water", () => {
    expect(keywordDestination("water fountain")).toMatchObject({ kind: "amenity", type: "water" });
    expect(keywordDestination("I'm thirsty")).toMatchObject({ kind: "amenity", type: "water" });
  });

  it("gives up on nonsense", () => {
    expect(keywordDestination("purple elephant")).toMatchObject({ kind: "unknown" });
  });
});

describe("without an API key", () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });
  afterEach(() => {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  });

  it("falls back to keywords", async () => {
    expect(await interpretNeeds("wheelchair", NONE)).toMatchObject({ needs: ["wheelchair"], source: "keywords" });
    expect(await interpretDestination("Maquerie hall")).toMatchObject({ kind: "building", name: "MacQuarrie Hall", source: "keywords" });
  });
});

describe("input checks", () => {
  it("caps text at 300 characters", () => {
    expect(clampText("x".repeat(500))).toHaveLength(300);
    expect(clampText(42)).toBe("");
  });

  it("drops unknown needs and categories", () => {
    expect(sanitizeState({ needs: ["wheelchair", "jetpack"], hidden: ["water", 7, "lava"] })).toEqual({ needs: ["wheelchair"], hidden: ["water"] });
  });
});
