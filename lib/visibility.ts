import { isStaff } from "./currentUser";
import type { Report, User } from "./types";

/** Stored on a lost or found report when the student turns off "Show on everyone's map". */
export const PRIVATE_LISTING = "__private";

/** Lost and found are public unless the reporter opted out. Issues are always public. */
export function isListedPublicly(r: Report) {
  if (r.kind !== "lost" && r.kind !== "found") return true;
  return r.public_map !== false && !r.cc?.includes(PRIVATE_LISTING);
}

/**
 * What a viewer may see of a report. Lost and found items are on everyone's map unless the
 * reporter turned that off: then only staff and the owner see them.
 *
 * An anonymous found item left for delivery still shows as a generic task (no photo or
 * description). The student who claims it sees it in full so they can carry it in.
 */
export function forViewer(r: Report, user: User): Report | null {
  if (r.kind === "issue" || isStaff(user.role) || r.reporter_id === user.id) return r;
  if (isListedPublicly(r)) return r;
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
