import { describe, expect, it } from "vitest";
import { fixPath } from "./fixPath";

describe("fixPath", () => {
  it("sends lost and found reports to matching", () => {
    expect(fixPath({ kind: "lost", category: "lost_found", severity: 1 })).toBe("lost_found");
    expect(fixPath({ kind: "found", category: "lost_found", severity: 1 })).toBe("lost_found");
  });

  it("makes allowlisted, low-severity, hazard-free issues self_fixable", () => {
    expect(fixPath({ kind: "issue", category: "garbage", severity: 1, hazard_flags: [] })).toBe("self_fixable");
    expect(fixPath({ kind: "issue", category: "weak_wifi", severity: 2 })).toBe("self_fixable");
  });

  it("sends categories off the allowlist to staff", () => {
    expect(fixPath({ kind: "issue", category: "pothole", severity: 1 })).toBe("staff");
    expect(fixPath({ kind: "issue", category: "dead_animal", severity: 1 })).toBe("staff");
    expect(fixPath({ kind: "issue", category: "open_manhole", severity: 1 })).toBe("staff");
  });

  it("sends higher severity to staff", () => {
    expect(fixPath({ kind: "issue", category: "garbage", severity: 3 })).toBe("staff");
  });

  it("sends anything with a hazard flag to staff", () => {
    expect(fixPath({ kind: "issue", category: "garbage", severity: 1, hazard_flags: ["broken_glass"] })).toBe("staff");
  });

  it("treats a missing severity as not low", () => {
    expect(fixPath({ kind: "issue", category: "garbage" })).toBe("staff");
  });
});
