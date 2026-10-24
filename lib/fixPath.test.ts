import { describe, expect, it } from "vitest";
import { fixPath } from "./fixPath";

describe("fixPath", () => {
  it("sends lost and found reports to matching", () => {
    expect(fixPath({ kind: "lost", issue_type: "airpods_case", severity: 1 })).toBe("lost_found");
    expect(fixPath({ kind: "found", issue_type: "water_bottle", severity: 1 })).toBe("lost_found");
  });

  it("makes allowlisted, low-severity, hazard-free issues self_fixable", () => {
    expect(
      fixPath({ kind: "issue", category: "waste", issue_type: "litter", severity: 1, hazard_flags: [] }),
    ).toBe("self_fixable");
    expect(fixPath({ kind: "issue", category: "connectivity", issue_type: "Slow_WiFi", severity: 2 })).toBe(
      "self_fixable",
    );
  });

  it("sends issue types off the allowlist to staff", () => {
    expect(fixPath({ kind: "issue", category: "paths", issue_type: "pothole", severity: 1 })).toBe("staff");
    expect(fixPath({ kind: "issue", category: "waste", issue_type: "overflowing_bin", severity: 1 })).toBe("staff");
  });

  it("sends higher severity to staff", () => {
    expect(fixPath({ kind: "issue", category: "waste", issue_type: "litter", severity: 3 })).toBe("staff");
  });

  it("sends anything with a hazard flag to staff", () => {
    expect(
      fixPath({ kind: "issue", category: "waste", issue_type: "litter", severity: 1, hazard_flags: ["broken_glass"] }),
    ).toBe("staff");
  });

  it("never makes pests a mission", () => {
    expect(fixPath({ kind: "issue", category: "pests", issue_type: "litter", severity: 1 })).toBe("staff");
  });

  it("treats a missing severity as not low", () => {
    expect(fixPath({ kind: "issue", category: "waste", issue_type: "litter" })).toBe("staff");
  });
});
