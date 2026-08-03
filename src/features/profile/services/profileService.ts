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
    await delay(180);
    const err = validate(patch);
    if (err) return fail("INVALID_PROFILE", err);
    return ok(patch);
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
    await delay(120);
    // Backend returns the persisted server-side profile. Placeholder returns null
    // so the store keeps the client-cached copy.
    return ok(null);
  },
};
