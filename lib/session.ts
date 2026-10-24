import { cookies } from "next/headers";
import { USER_COOKIE, userById, type DemoUser } from "./users";

/** The demo user picked in the header. Swap for real auth once Supabase Auth is wired up. */
export async function currentUser(): Promise<DemoUser> {
  const jar = await cookies();
  return userById(jar.get(USER_COOKIE)?.value);
}
