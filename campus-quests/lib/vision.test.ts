import { describe, expect, it } from "vitest";
import { guessKind, mockTriage, normalizeTriage, triagePhoto } from "./vision";

describe("guessKind", () => {
  it("treats campus problems as issues", () => {
    expect(guessKind("construction fence blocking the path")).toBe("issue");
    expect(guessKind("big pothole near the garage")).toBe("issue");
    expect(guessKind("broken tree branch across the walkway")).toBe("issue");
  });

  it("treats items as found unless the student says they lost them", () => {
    expect(guessKind("black airpods case on a bench")).toBe("found");
    expect(guessKind("I lost my keys")).toBe("lost");
    expect(guessKind("can't find my water bottle")).toBe("lost");
  });

  it("leans lost for a gallery photo of an item", () => {
    expect(guessKind("blue hydro flask", "gallery")).toBe("lost");
    expect(guessKind("found a blue hydro flask", "gallery")).toBe("found");
  });
});

describe("triage kind", () => {
  it("routes construction to maintenance with an access alert", () => {
    const t = normalizeTriage(mockTriage("construction fence closed off the path", "issue"), null, "mock");
    expect(t.kind).toBe("issue");
    expect(t.category).toBe("construction");
    expect(t.access_impact.length).toBeGreaterThan(0);
  });

  it("uses the model's report_kind, and a correction overrides it", () => {
    expect(normalizeTriage({ report_kind: "found", title: "Found: keys" }, null, "claude").category).toBe("lost_found");
    expect(normalizeTriage({ report_kind: "found" }, "lost", "claude").kind).toBe("lost");
  });

  it("detects the kind offline without being told", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect((await triagePhoto(null, "fallen tree on the path")).kind).toBe("issue");
      expect((await triagePhoto(null, "found black airpods case")).kind).toBe("found");
      expect((await triagePhoto(null, "I lost my laptop")).kind).toBe("lost");
    } finally {
      if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
    }
  });
});
