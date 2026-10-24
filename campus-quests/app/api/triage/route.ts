import { photoForModel } from "@/lib/photoForModel";
import type { ReportKind } from "@/lib/types";
import { triagePhoto } from "@/lib/vision";

/** { photo (data URL or Supabase Storage URL), note?, kind? } -> Triage JSON */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { photo?: string; note?: string; kind?: ReportKind };
  const kind: ReportKind = body.kind === "lost" || body.kind === "found" ? body.kind : "issue";
  const image = await photoForModel(body.photo);
  const triage = await triagePhoto(image, body.note?.trim().slice(0, 500) || null, kind);
  return Response.json(triage);
}
