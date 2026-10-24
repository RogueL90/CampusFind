// The one data import for every screen: `import { getReports } from "@/lib/data"`.
// Uses Supabase (lib/db.ts) when both public keys are in .env.local, otherwise the in-browser
// mock (lib/mock.ts). The annotation below fails the build if the two drift apart.
import { getCurrentUser } from "./currentUser";
import * as db from "./db";
import * as mock from "./mock";
import { forViewer } from "./visibility";

export const usingSupabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const api: typeof mock = usingSupabase ? db : mock;

// Map, sheets and mission lists only get what the current user may see (lib/visibility.ts).
// Demo-level: with Supabase the same rule belongs in a view or row-level security.
export const getReports: typeof api.getReports = async () => {
  const user = getCurrentUser();
  return (await api.getReports()).flatMap((r) => forViewer(r, user) ?? []);
};

export const getReport: typeof api.getReport = async (reportId) => {
  const r = await api.getReport(reportId);
  return r && forViewer(r, getCurrentUser());
};

export const {
  subscribeReports,
  getAccessAlerts,
  createReport,
  voteMeToo,
  checkReport,
  claimMission,
  submitProof,
  reviewProof,
  checkInItem,
  markPickedUp,
  getBalance,
  redeemReward,
  getNotifications,
  subscribeBalance,
  subscribeNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  deleteAllNotifications,
  getDemoPath,
  uploadPhoto,
  getOpenLostReports,
  createMatch,
  getMatch,
  respondToMatch,
  getMyMissions,
  getLedger,
  getStatusEvents,
  getCheckinCode,
  getItemByCode,
  getItemsAtOffice,
  getItemsOnTheWay,
  getRewards,
  getRedemptions,
  getPendingProofs,
  overrideFixPath,
  getReportsForAuthority,
  getVolunteering,
  registerVolunteer,
} = api;
