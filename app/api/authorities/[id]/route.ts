import { AUTHORITIES } from "@/lib/categories";
import { listReportsForAuthority } from "@/lib/db";

/** The work queue for one campus authority: every report routed or cc'd to it. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!(id in AUTHORITIES)) return Response.json({ error: "Unknown authority" }, { status: 404 });
  return Response.json(await listReportsForAuthority(id));
}
