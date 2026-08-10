import { create } from "zustand";
import { authRepository } from "@/features/auth/repositories/AuthRepository";
import { isJwtExpired } from "@/features/auth/utils/mockJwt";
import { secureStorage, SECURE_KEYS } from "@/core/storage/secureStorage";
import { useProfileStore } from "@/features/profile/state/profileStore";
import { profileRepository } from "@/features/profile/repositories/ProfileRepository";
import { isDev } from "@/core/config/env";

export type AuthStatus =
  | "idle" // initial, pre-bootstrap
  | "guest" // browsing without an account (default post-bootstrap)
  | "unauthenticated" // explicitly signed out, transient (login flow entered)
  | "authenticating" // requesting OTP
  | "otp_sent" // awaiting user code entry
  | "verifying" // verifying OTP
  | "authenticated"
  | "session_expired"
  | "error";

export interface AuthUser {
  id: string;
  phone: string;
  name?: string;
}

interface OtpChallenge {
  otpToken: string;
  phone: string;
  requestedAt: number;
  resendAfterSec: number;
  code?: string;
  deliveryMethod?: "whatsapp" | "sms";
}

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  challenge: OtpChallenge | null;
  isBootstrapped: boolean;
  error: string | null;

  // Actions
  bootstrap: () => Promise<void>;
  requestOtp: (
    phone: string,
    deliveryMethod?: "whatsapp" | "sms",
    otpToken?: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  verifyOtp: (code: string) => Promise<{ ok: boolean; error?: string }>;
  resendOtp: () => Promise<{ ok: boolean; error?: string }>;
  changePhone: () => void;
  logout: () => Promise<void>;
  clearError: () => void;
}

/**
 * Session persistence goes through `secureStorage` (see
 * shared/services/secureStorage.ts) so the swap to native Keychain /
 * Keystore is a single-file change. We deliberately do NOT use
 * Zustand's `persist` middleware here because tokens must round-trip
 * through the secure abstraction, not raw `localStorage`.
 */

async function persistSession(user: AuthUser, accessToken: string, refreshToken: string) {
  await Promise.all([
    secureStorage.set(SECURE_KEYS.ACCESS_TOKEN, accessToken),
    secureStorage.set(SECURE_KEYS.REFRESH_TOKEN, refreshToken),
    secureStorage.set(SECURE_KEYS.USER, JSON.stringify(user)),
  ]);
}

async function clearPersistedSession() {
  await Promise.all([
    secureStorage.remove(SECURE_KEYS.ACCESS_TOKEN),
    secureStorage.remove(SECURE_KEYS.REFRESH_TOKEN),
    secureStorage.remove(SECURE_KEYS.USER),
  ]);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "idle",
  user: null,
  accessToken: null,
  refreshToken: null,
  challenge: null,
  isBootstrapped: false,
  error: null,

  async bootstrap() {
    if (get().isBootstrapped) return;
    try {
      const [accessToken, refreshToken, userJson] = await Promise.all([
        secureStorage.get(SECURE_KEYS.ACCESS_TOKEN),
        secureStorage.get(SECURE_KEYS.REFRESH_TOKEN),
        secureStorage.get(SECURE_KEYS.USER),
      ]);

      if (!accessToken || !refreshToken || !userJson) {
        set({ status: "guest", isBootstrapped: true });
        return;
      }

      const user = JSON.parse(userJson) as AuthUser;

      if (!isJwtExpired(accessToken)) {
        useProfileStore.getState().hydrateFromAuth(user);
        profileRepository.refresh().catch(console.error);
        set({
          status: "authenticated",
          user,
          accessToken,
          refreshToken,
          isBootstrapped: true,
        });
        return;
      }

      // Try to refresh silently.
      const refreshed = await authRepository.refresh(refreshToken);
      if (refreshed.success) {
        await persistSession(user, refreshed.data.accessToken, refreshed.data.refreshToken);
        useProfileStore.getState().hydrateFromAuth(user);
        profileRepository.refresh().catch(console.error);
        set({
          status: "authenticated",
          user,
          accessToken: refreshed.data.accessToken,
          refreshToken: refreshed.data.refreshToken,
          isBootstrapped: true,
        });
      } else {
        await clearPersistedSession();
        set({
          status: "session_expired",
          user: null,
          accessToken: null,
          refreshToken: null,
          isBootstrapped: true,
        });
      }
    } catch {
      set({ status: "guest", isBootstrapped: true });
    }
  },

  async requestOtp(phone, deliveryMethod = "whatsapp", otpToken) {
    set({ status: "authenticating", error: null });
    const res = await authRepository.requestOtp(phone, deliveryMethod, otpToken);
    if (!res.success) {
      set({ status: "error", error: res.error.message });
      return { ok: false, error: res.error.message };
    }
    set({
      status: "otp_sent",
      challenge: {
        otpToken: res.data.otpToken,
        phone,
        requestedAt: Date.now(),
        resendAfterSec: res.data.resendAfterSec,
        code: res.data.code,
        deliveryMethod: res.data.deliveryMethod || deliveryMethod,
      },
    });
    return { ok: true };
  },

  async verifyOtp(code) {
    const { challenge } = get();
    if (!challenge) {
      return { ok: false, error: "Please request an OTP first." };
    }
    set({ status: "verifying", error: null });
    const res = await authRepository.verifyOtp(challenge.otpToken, code);
    if (!res.success) {
      set({ status: "otp_sent", error: res.error.message });
      return { ok: false, error: res.error.message };
    }
    await persistSession(res.data.user, res.data.accessToken, res.data.refreshToken);
    useProfileStore.getState().hydrateFromAuth(res.data.user);
    profileRepository.refresh().catch(console.error);
    set({
      status: "authenticated",
      user: res.data.user,
      accessToken: res.data.accessToken,
      refreshToken: res.data.refreshToken,
      challenge: null,
      error: null,
    });
    return { ok: true };
  },

  async resendOtp() {
    const { challenge } = get();
    if (!challenge) return { ok: false, error: "No active OTP request." };
    return get().requestOtp(challenge.phone, challenge.deliveryMethod || "whatsapp");
  },

  changePhone() {
    set({
      status: "unauthenticated",
      challenge: null,
      error: null,
    });
  },

  async logout() {
    const { refreshToken } = get();
    await authRepository.logout(refreshToken);
    await clearPersistedSession();
    profileRepository.clearCache();
    set({
      status: "guest",
      user: null,
      accessToken: null,
      refreshToken: null,
      challenge: null,
      error: null,
    });
  },

  clearError() {
    set({ error: null });
  },
}));

// Selector helpers to avoid re-renders.
export const selectIsAuthenticated = (s: AuthState) =>
  s.status === "authenticated" && !!s.accessToken;

export const selectIsGuest = (s: AuthState) => s.status !== "authenticated";

if (typeof window !== "undefined" && isDev()) {
  (window as any).useAuthStore = useAuthStore;
}
