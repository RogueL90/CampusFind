// The one data import for every screen: `import { getReports } from "@/lib/data"`.
// Uses Supabase (lib/db.ts) when both public keys are in .env.local, otherwise the in-browser
// mock (lib/mock.ts). The annotation below fails the build if the two drift apart.
import * as db from "./db";
import * as mock from "./mock";

export const usingSupabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const api: typeof mock = usingSupabase ? db : mock;

export const {
  getReports,
  getReport,
  subscribeReports,
  getAccessAlerts,
  createReport,
  voteMeToo,
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
} = api;
