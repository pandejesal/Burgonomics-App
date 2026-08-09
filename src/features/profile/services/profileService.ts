/**
 * ProfileService — mock implementation of the future
 *   GET   /v1/profile
 *   PATCH /v1/profile
 * endpoints. Latency + validation only; state lives in the store.
 */
import { delay, fail, ok, type ApiResult } from "@/core/network/http";
import type { ProfileInput, UserProfile } from "@/features/profile/models";

function validate(patch: ProfileInput): string | null {
  if (patch.fullName !== undefined && !patch.fullName.trim()) return "Full name is required.";
  if (patch.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.email))
    return "Enter a valid email address.";
  if (patch.dateOfBirth) {
    const d = new Date(patch.dateOfBirth);
    if (Number.isNaN(d.getTime())) return "Enter a valid date of birth.";
    if (d.getTime() > Date.now()) return "Date of birth cannot be in the future.";
  }
  return null;
}

export const profileService = {
  async update(patch: ProfileInput): Promise<ApiResult<ProfileInput>> {
    const err = validate(patch);
    if (err) return fail("INVALID_PROFILE", err);

    try {
      const { db, auth } = await import("@/core/config/firebase");
      const { doc, setDoc } = await import("firebase/firestore");
      const user = auth.currentUser;
      if (!user) return fail("UNAUTHORIZED", "Not logged in");

      const userRef = doc(db, "users", user.uid);
      
      // Firestore does not support undefined values, so we filter them out.
      const cleanPatch = Object.fromEntries(
        Object.entries(patch).filter(([_, v]) => v !== undefined)
      );
      
      await setDoc(userRef, {
        ...cleanPatch,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      return ok(patch);
    } catch (error: any) {
      console.error("Firestore profile update error:", error);
      return fail("SERVER_ERROR", `Failed to update profile in database: ${error?.message || error}`);
    }
  },

  async requestPhoneChange(_phone: string): Promise<ApiResult<{ challengeId: string }>> {
    await delay(150);
    // Placeholder — the future backend triggers an OTP challenge.
    return fail("NOT_IMPLEMENTED", "Phone changes require verification. Coming soon.");
  },

  async requestDeleteAccount(): Promise<ApiResult<{ ticketId: string }>> {
    await delay(200);
    return ok({ ticketId: `del_${Date.now().toString(36)}` });
  },

  async me(): Promise<ApiResult<UserProfile | null>> {
    try {
      const { db, auth } = await import("@/core/config/firebase");
      const { doc, getDoc } = await import("firebase/firestore");
      const user = auth.currentUser;
      if (!user) return ok(null);

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const data = userSnap.data();
        return ok(data as UserProfile);
      }
      return ok(null);
    } catch (error) {
      console.error("Firestore profile fetch error:", error);
      return ok(null);
    }
  },
};
