/** Location, time and photo appended to the report body when it's saved. */
export function reportFooter(r: { building?: string | null; lat: number; lng: number; created_at: string; photo?: string | null }) {
  return [
    "",
    "—",
    `Location: ${r.building ? `${r.building} ` : ""}(${r.lat.toFixed(5)}, ${r.lng.toFixed(5)})`,
    `Reported: ${new Date(r.created_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}`,
    r.photo ? "Photo: attached" : null,
    "Sent via CampusFind",
  ]
    .filter((l) => l !== null)
    .join("\n");
}
