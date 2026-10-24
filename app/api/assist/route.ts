import { clampText, interpretDestination, interpretNeeds, sanitizeState } from "@/lib/assist";

/**
 * { mode: "needs", text, current?: { needs, hidden } } -> NeedsResult
 * { mode: "destination", text } -> DestinationResult
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { mode?: string; text?: unknown; current?: unknown };
  const text = clampText(body.text);
  if (body.mode === "needs") return Response.json(await interpretNeeds(text, sanitizeState(body.current)));
  if (body.mode === "destination") return Response.json(await interpretDestination(text));
  return Response.json({ error: 'mode must be "needs" or "destination"' }, { status: 400 });
}
