import { describe, expect, it } from "vitest";
import { formatServiceTime, isVolunteerDepartment, isVolunteerTask, volunteerDepartment } from "./volunteer";

describe("volunteer programs", () => {
  it("lists only departments that run a student program", () => {
    expect(isVolunteerDepartment("fdo_custodial")).toBe(true);
    expect(isVolunteerDepartment("it_services")).toBe(true);
    expect(isVolunteerDepartment("upd")).toBe(false);
    expect(isVolunteerDepartment("ehs")).toBe(false);
    expect(isVolunteerDepartment(null)).toBe(false);
  });

  it("needs a volunteer registration for student-solvable tidy and verify work", () => {
    expect(isVolunteerTask("self_fixable", "tidy")).toBe(true);
    expect(isVolunteerTask("self_fixable", "verify")).toBe(true);
    expect(isVolunteerTask("self_fixable", "access_check")).toBe(false);
    expect(isVolunteerTask("lost_found", "delivery")).toBe(false);
    expect(isVolunteerTask("staff", "tidy")).toBe(false);
  });

  it("registers volunteers with the report's department", () => {
    expect(volunteerDepartment({ routed_to: "fdo_custodial" })).toBe("fdo_custodial");
    expect(volunteerDepartment({ routed_to: "upd" })).toBeNull();
    expect(volunteerDepartment({ routed_to: null })).toBe("fdo_maintenance");
  });

  it("formats service hours", () => {
    expect(formatServiceTime(15)).toBe("15 min");
    expect(formatServiceTime(60)).toBe("1 h");
    expect(formatServiceTime(75)).toBe("1 h 15 min");
  });
});
