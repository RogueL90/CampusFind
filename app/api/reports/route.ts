import { createReport, listReportsBy } from "@/lib/db";
import { matchFoundReport } from "@/lib/matching";
import { currentUser } from "@/lib/session";
import type { Item, NewReport, ReportKind, Triage } from "@/lib/types";

type Body = {
  kind: ReportKind;
  triage: Triage;
  photoUrl: string | null;
  note?: string | null;
  lat: number;
  lng: number;
  radiusM?: number | null;
  lostFrom?: string | null;
  lostTo?: string | null;
  building?: string | null;
  floor?: string | null;
  atOffice?: boolean;
};

export async function GET() {
  const me = await currentUser();
  return Response.json(await listReportsBy(me.id));
}

/** Saves a confirmed report. Found reports are matched right away. */
export async function POST(req: Request) {
  const me = await currentUser();
  const b = (await req.json()) as Body;
  if (!["issue", "lost", "found"].includes(b.kind)) return Response.json({ error: "Bad kind" }, { status: 400 });
  if (!Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return Response.json({ error: "Place a pin" }, { status: 400 });

  const t = b.triage;
  const isItem = b.kind !== "issue";
  const item: Item | null = isItem
    ? {
        category: t.issue_type,
        color: t.color,
        brand: t.brand,
        marks: t.marks,
        radius_m: b.kind === "lost" ? (b.radiusM ?? 100) : null,
        lost_from: b.kind === "lost" ? (b.lostFrom ?? null) : null,
        lost_to: b.kind === "lost" ? (b.lostTo ?? null) : null,
        whereabouts: b.kind === "found" ? (b.atOffice ? "at_office" : "with_finder") : null,
      }
    : null;

  const input: NewReport = {
    reporter_id: me.id,
    kind: b.kind,
    category: isItem ? "lost_found" : t.category,
    issue_type: t.issue_type,
    severity: t.severity,
    title: t.title,
    description: b.note ?? null,
    photo_urls: b.photoUrl ? [b.photoUrl] : [],
    lat: b.lat,
    lng: b.lng,
    building: b.building ?? null,
    floor: b.floor ?? null,
    hazard_flags: t.hazard_flags,
    access_impact: t.access_impact,
    routed_to: t.routed_to,
    contains_sensitive: t.contains_sensitive,
    item,
  };
  const report = await createReport(input);

  let matches: Awaited<ReturnType<typeof matchFoundReport>> = [];
  if (report.kind === "found") {
    try {
      matches = await matchFoundReport(report.id);
    } catch (e) {
      console.error("[reports] matching failed", e);
    }
  }
  return Response.json({ report, matches: matches.filter((m) => m.match_id) });
}
