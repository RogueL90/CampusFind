import { photoForModel } from "@/lib/db";
import type { ReportKind } from "@/lib/types";
import { triagePhoto } from "@/lib/vision";

/**
 * { photoUrl, note?, kind? } -> Triage JSON
 * {category, issue_type, severity, title, hazard_flags, access_impact, routed_to, contains_sensitive, color, brand, marks}
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { photoUrl?: string; note?: string; kind?: ReportKind };
  const kind: ReportKind = body.kind === "lost" || body.kind === "found" ? body.kind : "issue";
  const image = body.photoUrl ? await photoForModel(body.photoUrl) : null;
  const triage = await triagePhoto(image, body.note?.trim() || null, kind);
  return Response.json(triage);
}
