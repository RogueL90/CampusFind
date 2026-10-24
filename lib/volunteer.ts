// Student-solvable tasks and the department volunteer programs students join to do them.
// supabase/schema.sql repeats VOLUNTEER_DEPARTMENTS and SERVICE_MINUTES; keep them in sync.
import type { AuthorityId } from "./categories";
import type { FixPath, MissionType, Report } from "./types";

export interface VolunteerProgram {
  /** Name of the volunteer program the department runs. */
  program: string;
  /** What volunteers do for this department. */
  tasks: string;
  /** Rules the student agrees to when registering. */
  rules: string[];
}

/** Applies to every program. */
export const COMMON_RULES = [
  "If anything looks unsafe, stop and report it instead.",
  "Your work is checked from your proof photos before points and service hours count.",
];

export const VOLUNTEER_PROGRAMS = {
  fdo_custodial: {
    program: "Campus Cleanup Crew",
    tasks: "Pick up loose litter, bag trash around overflowing bins and put furniture back.",
    rules: [
      "Wear gloves and use a bag or litter picker.",
      "Never touch needles, broken glass, bodily fluids or anything heavy. Report those instead.",
      "Don't climb into bins or dumpsters.",
    ],
  },
  fdo_grounds: {
    program: "Grounds Helpers",
    tasks: "Clear loose litter and small debris from lawns and walkways.",
    rules: ["Wear gloves.", "Stay off roads and out of planted beds.", "Keep away from mowers and other equipment."],
  },
  fdo_maintenance: {
    program: "Facility Check Volunteers",
    tasks: "Check whether bottle fillers and fixtures still work, and photograph what you see.",
    rules: ["Look and photograph only.", "Don't open panels or touch wiring or plumbing.", "Don't use tools."],
  },
  it_services: {
    program: "Wi-Fi Spot Checkers",
    tasks: "Run a speed test where students report weak Wi-Fi.",
    rules: ["Run the speed test from a public area.", "Don't touch network equipment or enter equipment rooms."],
  },
  housing: {
    program: "Residence Hall Volunteers",
    tasks: "Tidy shared lounges and study rooms in the residence halls.",
    rules: ["Shared areas only, never residents' rooms.", "Wear gloves for any cleanup."],
  },
} as const satisfies Partial<Record<AuthorityId, VolunteerProgram>>;

export type VolunteerDepartment = keyof typeof VOLUNTEER_PROGRAMS;
export const VOLUNTEER_DEPARTMENTS = Object.keys(VOLUNTEER_PROGRAMS) as VolunteerDepartment[];

export const isVolunteerDepartment = (id: string | null | undefined): id is VolunteerDepartment =>
  !!id && VOLUNTEER_DEPARTMENTS.includes(id as VolunteerDepartment);

/** Community service credited when a moderator approves the proof. */
export const SERVICE_MINUTES: Partial<Record<MissionType, number>> = { tidy: 15, verify: 5, access_check: 5 };

/** Student-solvable work needs a volunteer registration. Lost-and-found runs and access checks don't. */
export function isVolunteerTask(fixPath: FixPath, missionType: MissionType): boolean {
  return fixPath === "self_fixable" && (missionType === "tidy" || missionType === "verify");
}

/** The department a student-solvable report's volunteers register with. Unrouted reports go to Maintenance. */
export function volunteerDepartment(r: Pick<Report, "routed_to">): VolunteerDepartment | null {
  if (r.routed_to == null) return "fdo_maintenance";
  return isVolunteerDepartment(r.routed_to) ? r.routed_to : null;
}

export const SOLVABILITY = {
  self_fixable: { label: "Student solvable", hint: "Registered student volunteers can fix this" },
  staff: { label: "Unsolvable", hint: "Needs campus staff. Not a student task" },
} as const;

export function formatServiceTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
