import { createNotification, getMatch, getReport, setMatchStatus, setReportStatus } from "@/lib/db";
import { itemLabel } from "@/lib/matching";
import { currentUser } from "@/lib/session";

async function load(id: string) {
  const match = await getMatch(id);
  if (!match) return null;
  const [lost, found] = await Promise.all([getReport(match.lost_report_id), getReport(match.found_report_id)]);
  return lost && found ? { match, lost, found } : null;
}

/** Match plus both reports, for the owner (or the finder). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const me = await currentUser();
  const data = await load(id);
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });
  if (![data.lost.reporter_id, data.found.reporter_id].includes(me.id))
    return Response.json({ error: "Not your match" }, { status: 403 });
  return Response.json({ ...data, viewer_id: me.id });
}

/** { action: "confirm" | "reject" } from the owner. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const me = await currentUser();
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  const data = await load(id);
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });
  if (data.lost.reporter_id !== me.id) return Response.json({ error: "Only the owner can answer" }, { status: 403 });

  if (action === "confirm") {
    await setMatchStatus(id, "confirmed");
    await setReportStatus(data.lost.id, "matched");
    await setReportStatus(data.found.id, "matched");
    // Handoffs go through the office, so neither side gets the other's contact details.
    await createNotification({
      user_id: data.found.reporter_id,
      title: "Owner found",
      body: `The owner confirmed the ${itemLabel(data.found)} you found is theirs. ${
        data.found.item?.whereabouts === "at_office"
          ? "Thanks for dropping it at Lost & Found!"
          : "Drop it at the Lost & Found office to earn your points."
      }`,
      link: null,
    });
    return Response.json({ status: "confirmed" });
  }
  if (action === "reject") {
    await setMatchStatus(id, "rejected");
    return Response.json({ status: "rejected" });
  }
  return Response.json({ error: "action must be confirm or reject" }, { status: 400 });
}
