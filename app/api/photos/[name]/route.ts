import { getMemPhoto } from "@/lib/db";

/** Serves photos from the in-memory store (mock mode only; Supabase serves its own). */
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const photo = getMemPhoto(name);
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(photo.bytes), {
    headers: { "Content-Type": photo.contentType, "Cache-Control": "private, max-age=3600" },
  });
}
