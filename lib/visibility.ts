import { isStaff } from "./currentUser";
import type { Report, User } from "./types";

/**
 * What a viewer may see of a report. Students never see other people's lost or found items:
 * public photos, marks and places make false claims and targeted searching easy. Matching and
 * staff screens read the full data; the owner sees their own reports.
 *
 * Exception: an open delivery mission shows as a generic task (no photo or description), and the
 * student who claims it sees it in full so they can carry it to the office.
 */
export function forViewer(r: Report, user: User): Report | null {
  if (r.kind === "issue" || isStaff(user.role) || r.reporter_id === user.id) return r;
  const delivery = r.kind === "found" && r.mission?.mission_type === "delivery" ? r.mission : null;
  if (delivery?.claimed_by === user.id) return r;
  if (delivery?.status === "open") {
    return {
      ...r,
      title: "Found item to deliver",
      description: null,
      photo_urls: [],
      identified: null,
      report_subject: null,
      report_body: null,
      item: r.item && { ...r.item, category: null, color: null, brand: null, marks: null },
      mission: { ...delivery, title: "Carry a found item to Lost & Found" },
    };
  }
  return null;
}
