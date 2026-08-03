import { create } from "zustand";
import {
  adminAuthService,
  AdminUser,
  LoginResponse,
  TokenPair,
} from "../services/adminAuthService";

interface AdminAuthState {
  accessToken: string | null;
  refreshToken: string | null;
  admin: AdminUser | null;
  challenge: LoginResponse | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<LoginResponse>;
  verify2Fa: (code: string) => Promise<TokenPair>;
  logout: () => Promise<void>;
  clearChallenge: () => void;
  setup2Fa: () => Promise<{ secret: string; qrCodeUrl: string }>;
  verifySetup2Fa: (code: string) => Promise<boolean>;
  disable2Fa: (code: string) => Promise<boolean>;
  clearError: () => void;
  bootstrap: () => Promise<boolean>;
}

export const useAdminAuthStore = create<AdminAuthState>((set, get) => ({
  accessToken: null,
  refreshToken: null,
  admin: null,
  challenge: null,
  isLoading: false,
  error: null,

  clearChallenge: () => set({ challenge: null, error: null }),
  clearError: () => set({ error: null }),

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const challenge = await adminAuthService.login(email, password);
      set({ challenge, isLoading: false });
      return challenge;
    } catch (err: any) {
      set({ error: err.message || "Login failed", isLoading: false });
      throw err;
    }
  },

  verify2Fa: async (code) => {
    const { challenge } = get();
    if (!challenge || !challenge.challengeToken) {
      const err = new Error("No active login challenge found");
      set({ error: err.message });
      throw err;
    }

    set({ isLoading: true, error: null });
    try {
      const result = await adminAuthService.verify2Fa(code, challenge.challengeToken);

      // Store in state
      set({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        admin: result.admin,
        challenge: null,
        isLoading: false,
      });

      // Persist refresh token securely in localStorage for administrative session tracking
      localStorage.setItem("burgonomics_admin_refresh_token", result.refreshToken);

      return result;
    } catch (err: any) {
      set({ error: err.message || "Verification failed", isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    const { refreshToken } = get();
    set({ isLoading: true });

    if (refreshToken) {
      await adminAuthService.logout(refreshToken);
    }

    localStorage.removeItem("burgonomics_admin_refresh_token");
    set({
      accessToken: null,
      refreshToken: null,
      admin: null,
      challenge: null,
      isLoading: false,
      error: null,
    });
  },

  setup2Fa: async () => {
    const { accessToken } = get();
    if (!accessToken) throw new Error("Not authenticated");
    return adminAuthService.setup2Fa(accessToken);
  },

  verifySetup2Fa: async (code) => {
    const { accessToken, admin } = get();
    if (!accessToken || !admin) throw new Error("Not authenticated");

    set({ isLoading: true });
    try {
      const res = await adminAuthService.verifySetup2Fa(code, accessToken);
      if (res.success && admin.role) {
        set({
          admin: {
            ...admin,
          },
          isLoading: false,
        });
      }
      return res.success;
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      return false;
    }
  },

  disable2Fa: async (code) => {
    const { accessToken, admin } = get();
    if (!accessToken || !admin) throw new Error("Not authenticated");

    set({ isLoading: true });
    try {
      const res = await adminAuthService.disable2Fa(code, accessToken);
      set({ isLoading: false });
      return res.success;
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      return false;
    }
  },

  bootstrap: async () => {
    const persistedRefresh = localStorage.getItem("burgonomics_admin_refresh_token");
    if (!persistedRefresh) return false;

    try {
      const tokens = await adminAuthService.refresh(persistedRefresh);

      // Decode JWT payload (sub, email, role, permissions) safely
      const payloadBase64 = tokens.accessToken.split(".")[1];
      const payload = JSON.parse(atob(payloadBase64));

      const adminUser: AdminUser = {
        id: payload.sub,
        email: payload.email,
        fullName: payload.fullName || "Burgonomics Admin",
        avatar: payload.avatar || null,
        role: {
          name: payload.role,
          permissions: payload.permissions || [],
        },
      };

      set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        admin: adminUser,
        error: null,
      });

      localStorage.setItem("burgonomics_admin_refresh_token", tokens.refreshToken);
      return true;
    } catch (err) {
      console.error("[AdminAuthStore] Session bootstrapping failed:", err);
      localStorage.removeItem("burgonomics_admin_refresh_token");
      set({ accessToken: null, refreshToken: null, admin: null });
      return false;
    }
  },
}));
