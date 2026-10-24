// Real data functions backed by Supabase. Same exports as lib/mock.ts; lib/data.ts picks this
// file when NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set. Rules that must
// be atomic live in Postgres functions (supabase/schema.sql); this file is a thin typed wrapper.
//
// Functions without a userId argument act as the demo user picked in UserSwitcher.
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { getCurrentUserId } from "./currentUser";
import type {
  AccessAlert,
  Balance,
  LedgerEntry,
  Match,
  Mission,
  NewProof,
  NewReport,
  Notification,
  ProofForReview,
  Redemption,
  Report,
  Reward,
  StatusEvent,
} from "./types";
import type { LineString } from "geojson";

let client: SupabaseClient | null = null;
function supabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  client = createClient(url, anonKey, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return client;
}

// Postgres raise messages ("Not enough points: ...") are written for students, so pass them through.
function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

// A row of the reports_geo view
type ReportRow = Omit<Report, "mission" | "item"> & {
  mission_id: string | null;
  mission_type: Mission["mission_type"] | null;
  mission_title: string | null;
  mission_points: number | null;
  proof_required: string | null;
  mission_status: Mission["status"] | null;
  claimed_by: string | null;
  claim_expires_at: string | null;
  item_category: string | null;
  color: string | null;
  brand: string | null;
  marks: string | null;
  radius_m: number | null;
  whereabouts: NonNullable<Report["item"]>["whereabouts"];
  lost_from: string | null;
  lost_to: string | null;
};

function toReport(row: ReportRow): Report {
  const {
    mission_id, mission_type, mission_title, mission_points, proof_required, mission_status,
    claimed_by, claim_expires_at,
    item_category, color, brand, marks, radius_m, whereabouts, lost_from, lost_to,
    ...report
  } = row;
  return {
    ...report,
    cc: report.cc ?? [],
    resolved_votes: report.resolved_votes ?? 0,
    mission: mission_id
      ? {
          id: mission_id,
          report_id: row.id,
          mission_type: mission_type!,
          title: mission_title!,
          points: mission_points!,
          proof_required: proof_required!,
          status: mission_status!,
          claimed_by,
          claim_expires_at,
        }
      : null,
    item:
      report.kind === "issue"
        ? null
        : {
            category: item_category,
            color,
            brand,
            marks,
            radius_m: radius_m ?? 50,
            whereabouts,
            lost_from,
            lost_to,
          },
  };
}

const reportsGeo = () => supabase().from("reports_geo").select("*");

// ---------------------------------------------------------------------------
// Contract (roles/shared.md)
// ---------------------------------------------------------------------------

export async function getReports(): Promise<Report[]> {
  const rows = unwrap(await reportsGeo().neq("status", "closed").order("created_at", { ascending: false })) as ReportRow[];
  return rows.map(toReport);
}

export async function getReport(reportId: string): Promise<Report | null> {
  const row = unwrap(await reportsGeo().eq("id", reportId).maybeSingle()) as ReportRow | null;
  return row ? toReport(row) : null;
}

let channelSeq = 0;
function subscribeTables(tables: string[], onChange: () => void, filter?: string): () => void {
  // Coalesce bursts (one RPC can touch several tables) into a single refresh.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fire = () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, 150);
  };
  const sb = supabase();
  let channel: RealtimeChannel = sb.channel(`cq-${tables.join("-")}-${++channelSeq}`);
  for (const table of tables) {
    channel = channel.on("postgres_changes", { event: "*", schema: "public", table, filter }, fire);
  }
  channel.subscribe();
  return () => {
    clearTimeout(timer);
    void sb.removeChannel(channel);
  };
}

/** Fires when any pin, mission, vote, item or obstacle changes. Call getReports() again in the callback. */
export function subscribeReports(onChange: () => void): () => void {
  return subscribeTables(["reports", "missions", "report_votes", "report_checks", "items", "access_alerts", "matches"], onChange);
}

export async function getAccessAlerts(): Promise<AccessAlert[]> {
  return unwrap(await supabase().from("access_alerts_geo").select("*")) as AccessAlert[];
}

/** Also creates the search / fix mission when fix_path allows, and an unconfirmed obstacle when
 *  access_impact is set. A duplicate issue within 25 m and 24 h is merged as a "Me too". */
export async function createReport(input: NewReport): Promise<Report> {
  const row = unwrap(
    await supabase().rpc("create_report", { p_reporter: getCurrentUserId(), p: input }).single(),
  ) as ReportRow;
  return toReport(row);
}

export async function voteMeToo(reportId: string): Promise<void> {
  unwrap(await supabase().rpc("vote_me_too", { p_report: reportId, p_user: getCurrentUserId() }));
}

/** "Still there" (also a Me too) or "Looks resolved"; 3 resolved checks after the last "still there" resolve it. */
export async function checkReport(reportId: string, stillThere: boolean): Promise<void> {
  unwrap(await supabase().rpc("check_report", { p_report: reportId, p_user: getCurrentUserId(), p_still: stillThere }));
}

export async function claimMission(missionId: string): Promise<Mission> {
  return unwrap(
    await supabase().rpc("claim_mission", { p_mission: missionId, p_user: getCurrentUserId() }),
  ) as Mission;
}

export async function submitProof(missionId: string, proof: NewProof): Promise<void> {
  unwrap(
    await supabase().rpc("submit_proof", {
      p_mission: missionId,
      p_user: getCurrentUserId(),
      p_photo_urls: proof.photo_urls,
      p_lat: proof.lat,
      p_lng: proof.lng,
      p_speed_test: proof.speed_test_mbps ?? null,
      p_taken_at: proof.taken_at ?? new Date().toISOString(),
    }),
  );
}

export async function reviewProof(proofId: string, approve: boolean): Promise<void> {
  unwrap(
    await supabase().rpc("review_proof", { p_proof: proofId, p_approve: approve, p_moderator: getCurrentUserId() }),
  );
}

export async function checkInItem(code: string): Promise<{ itemTitle: string; points: number }> {
  const rows = unwrap(
    await supabase().rpc("check_in_item", { p_code: code.trim(), p_actor: getCurrentUserId() }),
  ) as { item_title: string; points: number }[];
  return { itemTitle: rows[0].item_title, points: rows[0].points };
}

/** Accepts the found report id or the matched lost report id. */
export async function markPickedUp(reportId: string): Promise<void> {
  unwrap(await supabase().rpc("mark_picked_up", { p_report: reportId, p_actor: getCurrentUserId() }));
}

export async function getBalance(userId: string): Promise<Balance> {
  const row = unwrap(
    await supabase().from("balances").select("pending, spendable").eq("user_id", userId).maybeSingle(),
  ) as Balance | null;
  return row ?? { pending: 0, spendable: 0 };
}

export async function redeemReward(rewardId: string): Promise<{ code: string }> {
  const code = unwrap(
    await supabase().rpc("redeem_reward", { p_reward: rewardId, p_user: getCurrentUserId() }),
  ) as string;
  return { code };
}

export async function getNotifications(userId: string): Promise<Notification[]> {
  return unwrap(
    await supabase()
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
  ) as Notification[];
}

// ---------------------------------------------------------------------------
// Extras the screens need (lib/mock.ts has matching versions)
// ---------------------------------------------------------------------------

/** Live HUD balance: fires when this user's points change. Call getBalance() again in the callback. */
export function subscribeBalance(userId: string, onChange: () => void): () => void {
  return subscribeTables(["points_ledger"], onChange, `user_id=eq.${userId}`);
}

export function subscribeNotifications(userId: string, onChange: () => void): () => void {
  return subscribeTables(["notifications"], onChange, `user_id=eq.${userId}`);
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  unwrap(await supabase().from("notifications").update({ read: true }).eq("id", notificationId));
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  unwrap(await supabase().from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false));
}

/** The "Simulate walk" path. */
export async function getDemoPath(name = "clark_walk"): Promise<LineString | null> {
  const row = unwrap(
    await supabase().from("demo_paths_geo").select("path").eq("name", name).maybeSingle(),
  ) as { path: LineString } | null;
  return row?.path ?? null;
}

/** Photo upload to the public "photos" bucket. Returns the public URL. */
export async function uploadPhoto(file: File | Blob, folder = "reports"): Promise<string> {
  const ext = file instanceof File && file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const sb = supabase();
  unwrap(await sb.storage.from("photos").upload(path, file, { contentType: file.type || "image/jpeg" }));
  return sb.storage.from("photos").getPublicUrl(path).data.publicUrl;
}

/** Candidates for /api/match. */
export async function getOpenLostReports(): Promise<Report[]> {
  const rows = unwrap(await reportsGeo().eq("kind", "lost").in("status", ["searching", "matched"])) as ReportRow[];
  return rows.map(toReport);
}

/** Call at score >= 0.6. Inserts the match and notifies the owner. */
export async function createMatch(lostReportId: string, foundReportId: string, score: number): Promise<Match> {
  return unwrap(
    await supabase().rpc("create_match", { p_lost: lostReportId, p_found: foundReportId, p_score: score }),
  ) as Match;
}

export async function getMatch(matchId: string): Promise<{ match: Match; lost: Report; found: Report } | null> {
  const match = unwrap(await supabase().from("matches").select("*").eq("id", matchId).maybeSingle()) as Match | null;
  if (!match) return null;
  const [lost, found] = await Promise.all([getReport(match.lost_report_id), getReport(match.found_report_id)]);
  return lost && found ? { match, lost, found } : null;
}

/** Owner's Confirm / Not mine. Confirm tells the finder to bring it to the office. */
export async function respondToMatch(matchId: string, confirm: boolean): Promise<void> {
  unwrap(
    await supabase().rpc("respond_to_match", { p_match: matchId, p_confirm: confirm, p_user: getCurrentUserId() }),
  );
}

/** Missions claimed by this user (active and completed), newest first. */
export async function getMyMissions(userId: string): Promise<Mission[]> {
  const rows = unwrap(
    await supabase()
      .from("missions")
      .select("*, reports(title)")
      .eq("claimed_by", userId)
      .order("claimed_at", { ascending: false }),
  ) as (Mission & { reports: { title: string } | null })[];
  return rows.map(({ reports, ...m }) => ({
    ...m,
    // a lapsed claim reads as open, same as on the map
    status: m.status === "claimed" && m.claim_expires_at && new Date(m.claim_expires_at) < new Date() ? "open" : m.status,
    report_title: reports?.title,
  }));
}

export async function getLedger(userId: string): Promise<LedgerEntry[]> {
  return unwrap(
    await supabase().from("points_ledger").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
  ) as LedgerEntry[];
}

export async function getStatusEvents(reportId: string): Promise<StatusEvent[]> {
  return unwrap(
    await supabase().from("status_events").select("*").eq("report_id", reportId).order("at"),
  ) as StatusEvent[];
}

/** The 6-digit code / QR payload on the finder's "Bring it to Lost & Found" card. */
export async function getCheckinCode(foundReportId: string): Promise<string | null> {
  const row = unwrap(
    await supabase().from("items").select("checkin_code").eq("report_id", foundReportId).maybeSingle(),
  ) as { checkin_code: string | null } | null;
  return row?.checkin_code ?? null;
}

/** Office console preview after scanning, before pressing Check in. */
export async function getItemByCode(code: string): Promise<Report | null> {
  const item = unwrap(
    await supabase().from("items").select("report_id").eq("checkin_code", code.trim()).maybeSingle(),
  ) as { report_id: string } | null;
  return item ? getReport(item.report_id) : null;
}

/** Office console lists: items waiting at the desk, and items finders are still carrying in. */
export async function getItemsAtOffice(): Promise<Report[]> {
  const rows = unwrap(await reportsGeo().eq("kind", "found").eq("whereabouts", "at_office")) as ReportRow[];
  return rows.map(toReport);
}

export async function getItemsOnTheWay(): Promise<Report[]> {
  const rows = unwrap(await reportsGeo().eq("kind", "found").eq("whereabouts", "with_finder")) as ReportRow[];
  return rows.map(toReport);
}

export async function getRewards(): Promise<Reward[]> {
  return unwrap(await supabase().from("rewards").select("*").order("cost_points")) as Reward[];
}

export async function getRedemptions(userId: string): Promise<Redemption[]> {
  return unwrap(
    await supabase().from("redemptions").select("*").eq("user_id", userId).order("redeemed_at", { ascending: false }),
  ) as Redemption[];
}

/** Moderator queue. */
export async function getPendingProofs(): Promise<ProofForReview[]> {
  return unwrap(
    await supabase().from("proofs_review").select("*").eq("review_status", "pending").order("taken_at"),
  ) as ProofForReview[];
}

/** Moderator fix_path override (logged in fix_path_overrides). */
export async function overrideFixPath(reportId: string, to: Report["fix_path"], reason?: string): Promise<void> {
  unwrap(
    await supabase().rpc("override_fix_path", {
      p_report: reportId,
      p_to: to,
      p_moderator: getCurrentUserId(),
      p_reason: reason ?? null,
    }),
  );
}

/** Staff view: reports routed or cc'd to one campus authority. */
export async function getReportsForAuthority(authorityId: string): Promise<Report[]> {
  if (!/^[a-z_]+$/.test(authorityId)) return [];
  const rows = unwrap(
    await reportsGeo()
      .or(`routed_to.eq.${authorityId},cc.cs.{${authorityId}}`)
      .order("created_at", { ascending: false })
      .limit(100),
  ) as ReportRow[];
  return rows.map(toReport);
}
