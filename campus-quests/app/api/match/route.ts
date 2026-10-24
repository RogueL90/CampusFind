import { MATCH_THRESHOLD, scoreMatch, WEIGHTS, type ScoreBreakdown } from "@/lib/matchScore";
import { photoForModel } from "@/lib/photoForModel";
import type { Report } from "@/lib/types";
import { photoSimilarity } from "@/lib/vision";

const MAX_CANDIDATES = 40;

export type MatchScore = { lost_report_id: string; score: ScoreBreakdown };

/**
 * { found, candidates } -> { results } with each lost report's score. Scoring only: the client
 * saves matches at >= MATCH_THRESHOLD through createMatch, which also notifies the owner.
 */
export async function POST(req: Request) {
  const { found, candidates } = (await req.json().catch(() => ({}))) as { found?: Report; candidates?: Report[] };
  if (!found || found.kind !== "found" || !Array.isArray(candidates)) {
    return Response.json({ error: "Send a found report and its lost candidates" }, { status: 400 });
  }

  const foundImage = await photoForModel(found.photo_urls?.[0]);
  const results: MatchScore[] = await Promise.all(
    candidates.slice(0, MAX_CANDIDATES).filter((l) => l.kind === "lost").map(async (lost) => {
      // The photo call is the slow, paid one: skip it when the other signals can't reach the bar.
      const cheap = scoreMatch(lost, found, 0);
      const photo =
        cheap.total + WEIGHTS.photo >= MATCH_THRESHOLD
          ? await photoSimilarity(await photoForModel(lost.photo_urls?.[0]), foundImage)
          : 0;
      return { lost_report_id: lost.id, score: scoreMatch(lost, found, photo) };
    }),
  );
  return Response.json({ results });
}
