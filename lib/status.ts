const LABELS: Record<string, string> = {
  submitted: "Submitted",
  routed: "Sent to staff",
  mission_open: "Mission open",
  in_progress: "A student is on it",
  verifying: "Proof under review",
  verified: "Checked by a student",
  resolved: "Resolved",
  searching: "Searching campus",
  matched: "Possible match found",
  with_finder: "With the finder",
  checked_in: "At the Lost & Found office",
  closed: "Closed",
};

export const statusLabel = (s: string) => LABELS[s] ?? s.replace(/_/g, " ");

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
