import type { AccessNeed } from "@/lib/types";

/** Private to this phone. "My needs" can change it; there is no settings panel. */
export interface AccessProfile {
  needs: AccessNeed[];
  voice: boolean;
  sound: boolean;
  vibrate: boolean;
  flat: boolean;
}

export const DEFAULT_ACCESS_PROFILE: AccessProfile = { needs: [], voice: true, sound: true, vibrate: true, flat: false };
