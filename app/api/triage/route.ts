import { photoForModel } from "@/lib/photoForModel";
import type { ReportKind } from "@/lib/types";
import { triagePhoto } from "@/lib/vision";

const KINDS: ReportKind[] = ["issue", "lost", "found"];

/** { photo (data URL or Supabase Storage URL), note?, source?, kind? (only to correct the AI) } -> Triage JSON */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { photo?: string; note?: string; kind?: ReportKind; source?: string };
  const kind = KINDS.includes(body.kind as ReportKind) ? (body.kind as ReportKind) : null;
  const source = body.source === "camera" || body.source === "gallery" ? body.source : null;
  const image = await photoForModel(body.photo);
  const triage = await triagePhoto(image, body.note?.trim().slice(0, 500) || null, { kind, source });
  return Response.json(triage);
}
