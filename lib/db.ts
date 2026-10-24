// Data access for reports, matches, notifications and photos. Server-only.
//
// With NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set, everything goes to
// Supabase (schema in supabase/schema.sql, photos in the public "photos" bucket).
// Without them, an in-memory store is used so the whole flow runs on mock data; it
// lives as long as the dev server and is shared by every phone hitting that server.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fixPath } from "./fixPath";
import type { Item, Match, MatchStatus, NewReport, Notification, Report } from "./types";
import { reportFooter } from "./reportFooter";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const PHOTO_BUCKET = "photos";

let supabase: SupabaseClient | null = null;
function sb(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  supabase ??= createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  return supabase;
}

export const usingSupabase = () => sb() !== null;

// ---------- in-memory store ----------

type Mem = {
  reports: Map<string, Report>;
  matches: Map<string, Match>;
  notifications: Map<string, Notification>;
  photos: Map<string, { bytes: Uint8Array; contentType: string }>;
};
const g = globalThis as unknown as { __cqMem?: Mem };
const mem: Mem = (g.__cqMem ??= {
  reports: new Map(),
  matches: new Map(),
  notifications: new Map(),
  photos: new Map(),
});

const now = () => new Date().toISOString();
const byNewest = <T extends { created_at: string }>(a: T, b: T) => b.created_at.localeCompare(a.created_at);

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// ---------- reports ----------

const ITEM_COLS = "category, color, brand, marks, radius_m, lost_from, lost_to, whereabouts";
const REPORT_SELECT = `id, reporter_id, kind, category, issue_type, severity, title, description, photo_urls, lat, lng,
  building, floor, fix_path, hazard_flags, access_impact, routed_to, cc, identified, routing_reason,
  report_subject, report_body, contains_sensitive, status, created_at,
  items(${ITEM_COLS})`;

type ReportRow = Omit<Report, "item"> & { items: Item | Item[] | null };
function fromRow(row: ReportRow): Report {
  const { items, ...rest } = row;
  return { ...rest, item: Array.isArray(items) ? (items[0] ?? null) : items };
}

/**
 * Saves a report (and its item details for lost/found). fix_path is always computed here,
 * and the location/time footer is appended to the authority report.
 */
export async function createReport(input: NewReport): Promise<Report> {
  const { item, ...fields } = input;
  const createdAt = now();
  const base = {
    ...fields,
    report_body:
      (fields.report_body ?? "") +
      "\n" +
      reportFooter({ ...fields, created_at: createdAt, photo: fields.photo_urls[0] ?? null }),
    fix_path: fixPath(fields),
    status: input.status ?? (input.kind === "issue" ? "submitted" : "open"),
  };

  const client = sb();
  if (!client) {
    const report: Report = { ...base, id: crypto.randomUUID(), created_at: createdAt, item: item ?? null };
    mem.reports.set(report.id, report);
    return report;
  }

  const row = must(
    await client.from("reports").insert({ ...base, created_at: createdAt }).select("id").single(),
  ) as { id: string };
  if (item) must(await client.from("items").insert({ report_id: row.id, ...item }));
  return (await getReport(row.id))!;
}

export async function getReport(id: string): Promise<Report | null> {
  const client = sb();
  if (!client) return mem.reports.get(id) ?? null;
  const row = must(await client.from("reports").select(REPORT_SELECT).eq("id", id).maybeSingle());
  return row ? fromRow(row as unknown as ReportRow) : null;
}

/** Lost reports still waiting for their item, newest first. Expire after 30 days (MASTER.md rules). */
export async function listOpenLostReports(): Promise<Report[]> {
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const client = sb();
  if (!client) {
    return [...mem.reports.values()]
      .filter((r) => r.kind === "lost" && r.status === "open" && r.created_at >= since)
      .sort(byNewest);
  }
  const rows = must(
    await client
      .from("reports")
      .select(REPORT_SELECT)
      .eq("kind", "lost")
      .eq("status", "open")
      .gte("created_at", since)
      .order("created_at", { ascending: false }),
  );
  return (rows as unknown as ReportRow[]).map(fromRow);
}

export async function listReportsBy(userId: string): Promise<Report[]> {
  const client = sb();
  if (!client) return [...mem.reports.values()].filter((r) => r.reporter_id === userId).sort(byNewest);
  const rows = must(
    await client.from("reports").select(REPORT_SELECT).eq("reporter_id", userId).order("created_at", { ascending: false }),
  );
  return (rows as unknown as ReportRow[]).map(fromRow);
}

/** Reports routed to (or cc'd to) an authority: what lands in its work queue. */
export async function listReportsForAuthority(authorityId: string): Promise<Report[]> {
  const client = sb();
  if (!client) {
    return [...mem.reports.values()]
      .filter((r) => r.routed_to === authorityId || r.cc.includes(authorityId))
      .sort(byNewest);
  }
  const rows = must(
    await client
      .from("reports")
      .select(REPORT_SELECT)
      .or(`routed_to.eq.${authorityId},cc.cs.{${authorityId}}`)
      .order("created_at", { ascending: false })
      .limit(100),
  );
  return (rows as unknown as ReportRow[]).map(fromRow);
}

export async function setReportStatus(id: string, status: string): Promise<void> {
  const client = sb();
  if (!client) {
    const r = mem.reports.get(id);
    if (r) r.status = status;
    return;
  }
  must(await client.from("reports").update({ status }).eq("id", id));
}

// ---------- matches ----------

export async function findMatch(lostId: string, foundId: string): Promise<Match | null> {
  const client = sb();
  if (!client) {
    return [...mem.matches.values()].find((m) => m.lost_report_id === lostId && m.found_report_id === foundId) ?? null;
  }
  return must(
    await client.from("matches").select("*").eq("lost_report_id", lostId).eq("found_report_id", foundId).maybeSingle(),
  ) as Match | null;
}

export async function createMatch(lostId: string, foundId: string, score: number): Promise<Match> {
  const client = sb();
  if (!client) {
    const m: Match = {
      id: crypto.randomUUID(),
      lost_report_id: lostId,
      found_report_id: foundId,
      score,
      status: "suggested",
      created_at: now(),
    };
    mem.matches.set(m.id, m);
    return m;
  }
  return must(
    await client.from("matches").insert({ lost_report_id: lostId, found_report_id: foundId, score }).select("*").single(),
  ) as Match;
}

export async function getMatch(id: string): Promise<Match | null> {
  const client = sb();
  if (!client) return mem.matches.get(id) ?? null;
  return must(await client.from("matches").select("*").eq("id", id).maybeSingle()) as Match | null;
}

export async function setMatchStatus(id: string, status: MatchStatus): Promise<void> {
  const client = sb();
  if (!client) {
    const m = mem.matches.get(id);
    if (m) m.status = status;
    return;
  }
  must(await client.from("matches").update({ status }).eq("id", id));
}

// ---------- notifications ----------

export async function createNotification(n: Pick<Notification, "user_id" | "title" | "body" | "link">): Promise<void> {
  const client = sb();
  if (!client) {
    const row: Notification = { ...n, id: crypto.randomUUID(), read_at: null, created_at: now() };
    mem.notifications.set(row.id, row);
    return;
  }
  must(await client.from("notifications").insert(n));
}

export async function getNotifications(userId: string): Promise<Notification[]> {
  const client = sb();
  if (!client) return [...mem.notifications.values()].filter((n) => n.user_id === userId).sort(byNewest);
  return must(
    await client.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
  ) as Notification[];
}

export async function markNotificationsRead(userId: string): Promise<void> {
  const client = sb();
  const at = now();
  if (!client) {
    for (const n of mem.notifications.values()) if (n.user_id === userId && !n.read_at) n.read_at = at;
    return;
  }
  must(await client.from("notifications").update({ read_at: at }).eq("user_id", userId).is("read_at", null));
}

// ---------- photos ----------

/** Stores a photo and returns a URL the browser (and the vision model, via loadPhoto) can read. */
export async function savePhoto(bytes: Uint8Array, contentType: string): Promise<string> {
  const ext = contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  const name = `${crypto.randomUUID()}.${ext}`;
  const client = sb();
  if (!client) {
    mem.photos.set(name, { bytes, contentType });
    return `/api/photos/${name}`;
  }
  must(await client.storage.from(PHOTO_BUCKET).upload(name, bytes, { contentType }));
  return client.storage.from(PHOTO_BUCKET).getPublicUrl(name).data.publicUrl;
}

export function getMemPhoto(name: string) {
  return mem.photos.get(name) ?? null;
}

/**
 * Turns a stored photo URL into a data URL for the vision model. Remote photos (Supabase
 * Storage) are fetched here rather than handed to the API as URLs, so a slow or
 * bot-blocking host can't fail the triage.
 */
export async function photoForModel(url: string): Promise<string | null> {
  if (url.startsWith("data:")) return url;
  if (/^https?:\/\//.test(url)) {
    const res = await fetch(url);
    if (!res.ok) return null;
    const type = res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  }
  const m = url.match(/^\/api\/photos\/(.+)$/);
  const p = m ? mem.photos.get(m[1]) : null;
  if (!p) return null;
  return `data:${p.contentType};base64,${Buffer.from(p.bytes).toString("base64")}`;
}
