// Server-only: turns a report photo into a data URL for the vision model.

const MAX_BYTES = 8 * 1024 * 1024;

/** Only the project's own Supabase Storage is fetched, so the API can't be pointed at arbitrary hosts. */
function allowedRemote(url: URL): boolean {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabase) return false;
  const origin = new URL(supabase).origin;
  return url.origin === origin && url.pathname.startsWith("/storage/v1/object/public/");
}

/**
 * Data URLs pass through; Supabase Storage URLs are fetched here rather than handed to the
 * API as URLs, so a slow host can't fail the triage. Anything else returns null.
 */
export async function photoForModel(src: string | null | undefined): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith("data:image/")) return src.length <= MAX_BYTES * 1.4 ? src : null;

  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  if (!allowedRemote(url)) return null;

  const res = await fetch(url, { redirect: "error" }).catch(() => null);
  if (!res?.ok) return null;
  const type = res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
  if (!type.startsWith("image/")) return null;
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) return null;
  return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
}
