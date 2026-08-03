/**
 * ProfileRepository — the single entry point UI uses to read or
 * mutate the current user's profile. Delegates persistence to
 * `useProfileStore` and validation/latency to `profileService`.
 *
 * Future backend integration points:
 *   - `refresh()`    → GET  /v1/profile
 *   - `update()`     → PATCH /v1/profile
 *   - `requestPhoneChange()` → POST /v1/profile/phone-change
 *   - `requestAccountDeletion()` → POST /v1/profile/deletion
 */
import type { ApiResult } from "@/core/network/http";
import { ok } from "@/core/network/http";
import { profileService } from "@/features/profile/services/profileService";
import { useProfileStore } from "@/features/profile/state/profileStore";
import type { ProfileInput, UserProfile } from "@/features/profile/models";

export class ProfileRepository {
  readonly name = "ProfileRepository";

  get(): UserProfile | null {
    return useProfileStore.getState().profile;
  }

  hydrateFromAuth(user: { id: string; phone: string; name?: string } | null) {
    useProfileStore.getState().hydrateFromAuth(user);
  }

  async refresh(): Promise<ApiResult<UserProfile | null>> {
    return profileService.me();
  }

  async update(patch: ProfileInput): Promise<ApiResult<UserProfile>> {
    useProfileStore.getState().setUpdating(true);
    const res = await profileService.update(patch);
    if (!res.success) {
      useProfileStore.getState().setUpdating(false);
      useProfileStore.getState().setError(res.error.message);
      return res;
    }
    useProfileStore.getState().applyPatch(res.data);
    useProfileStore.getState().setUpdating(false);
    const next = useProfileStore.getState().profile!;
    return ok(next);
  }

  async requestPhoneChange(phone: string) {
    return profileService.requestPhoneChange(phone);
  }

  async requestAccountDeletion() {
    return profileService.requestDeleteAccount();
  }

  clearCache() {
    useProfileStore.getState().clear();
  }
}

export const profileRepository = new ProfileRepository();
