import { matchFoundReport } from "@/lib/matching";

/** { foundReportId } -> scores against every open lost report; inserts matches + notifications at >= 0.6. */
export async function POST(req: Request) {
  const { foundReportId } = (await req.json().catch(() => ({}))) as { foundReportId?: string };
  if (!foundReportId) return Response.json({ error: "foundReportId required" }, { status: 400 });
  try {
    return Response.json({ results: await matchFoundReport(foundReportId) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
