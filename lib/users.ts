// Demo identities until real SJSU sign-in lands. The current user is kept in the
// `cq_user` cookie and switched from the header. IDs match the seed rows in supabase/schema.sql.

export type DemoUser = { id: string; name: string; email: string; role: "student" | "office" };

export const DEMO_USERS: DemoUser[] = [
  { id: "00000000-0000-4000-8000-000000000001", name: "Maya", email: "maya@sjsu.edu", role: "student" },
  { id: "00000000-0000-4000-8000-000000000002", name: "Leo", email: "leo@sjsu.edu", role: "student" },
  { id: "00000000-0000-4000-8000-000000000003", name: "L&F Office", email: "lostandfound@sjsu.edu", role: "office" },
];

export const USER_COOKIE = "cq_user";

export function userById(id: string | null | undefined): DemoUser {
  return DEMO_USERS.find((u) => u.id === id) ?? DEMO_USERS[0];
}
