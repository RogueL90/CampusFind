import { getNotifications, markNotificationsRead } from "@/lib/db";
import { currentUser } from "@/lib/session";

export async function GET() {
  const me = await currentUser();
  return Response.json(await getNotifications(me.id));
}

/** Marks all of the current user's notifications read. */
export async function POST() {
  const me = await currentUser();
  await markNotificationsRead(me.id);
  return Response.json({ ok: true });
}
