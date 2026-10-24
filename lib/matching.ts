// Runs a found report against every open lost report and notifies owners of strong matches.

import { createMatch, createNotification, findMatch, getReport, listOpenLostReports, photoForModel } from "./db";
import { MATCH_THRESHOLD, scoreMatch, WEIGHTS, type ScoreBreakdown } from "./matchScore";
import type { Report } from "./types";
import { photoSimilarity } from "./vision";

/** "airpods_case" -> "AirPods case" */
export function itemLabel(r: Pick<Report, "issue_type" | "item">): string {
  const raw = (r.item?.category ?? r.issue_type ?? "item").replace(/_/g, " ").trim();
  return raw.replace(/\bairpods\b/i, "AirPods").replace(/\bid\b/i, "ID") || "item";
}

export function matchMessage(lost: Report, found: Report): string {
  const where =
    found.item?.whereabouts === "with_finder"
      ? "It's on its way to the Lost & Found office."
      : "It's at the Lost & Found office.";
  return `Possible match for your ${itemLabel(lost)}. ${where}`;
}

export type MatchResult = { lost_report_id: string; score: ScoreBreakdown; match_id: string | null };

export async function matchFoundReport(foundId: string): Promise<MatchResult[]> {
  const found = await getReport(foundId);
  if (!found || found.kind !== "found") throw new Error("Not a found report");

  // Don't let anyone match (and later claim a reward on) their own lost item.
  const candidates = (await listOpenLostReports()).filter((l) => l.reporter_id !== found.reporter_id);
  const foundImage = found.photo_urls[0] ? await photoForModel(found.photo_urls[0]) : null;

  const results = await Promise.all(
    candidates.map(async (lost) => {
      // The photo call is the slow, paid one: skip it when the other signals can't reach the bar.
      const cheap = scoreMatch(lost, found, 0);
      const photo =
        cheap.total + WEIGHTS.photo >= MATCH_THRESHOLD
          ? await photoSimilarity(lost.photo_urls[0] ? await photoForModel(lost.photo_urls[0]) : null, foundImage)
          : 0;
      const score = scoreMatch(lost, found, photo);

      if (score.total < MATCH_THRESHOLD) return { lost, score, match_id: null, isNew: false };
      const existing = await findMatch(lost.id, found.id);
      if (existing) return { lost, score, match_id: existing.id, isNew: false };
      const match = await createMatch(lost.id, found.id, score.total);
      return { lost, score, match_id: match.id, isNew: true };
    }),
  );

  // One ping per owner per found item, pointing at their best match.
  const best = new Map<string, (typeof results)[number]>();
  for (const r of results) {
    if (!r.isNew) continue;
    const cur = best.get(r.lost.reporter_id);
    if (!cur || r.score.total > cur.score.total) best.set(r.lost.reporter_id, r);
  }
  for (const r of best.values()) {
    await createNotification({
      user_id: r.lost.reporter_id,
      title: "Possible match",
      body: matchMessage(r.lost, found),
      link: `/matches/${r.match_id}`,
    });
  }

  return results.map(({ lost, score, match_id }) => ({ lost_report_id: lost.id, score, match_id }));
}
