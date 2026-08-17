import { create } from "zustand";
import { adminAuthService, AdminUser, LoginResponse } from "../services/adminAuthService";
import { auth } from "@/core/config/firebase";
import { onAuthStateChanged } from "firebase/auth";

interface AdminAuthState {
  admin: AdminUser | null;
  accessToken: string | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  clearError: () => void;
  bootstrap: () => Promise<boolean>;
}

export const useAdminAuthStore = create<AdminAuthState>((set, get) => ({
  admin: null,
  accessToken: null,
  isLoading: true,
  error: null,

  clearError: () => set({ error: null }),

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await adminAuthService.login(email, password);
      set({ admin: response.admin, accessToken: response.accessToken, isLoading: false });
      return response;
    } catch (err: any) {
      set({ error: err.message || "Login failed", isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    await adminAuthService.logout();
    set({
      admin: null,
      accessToken: null,
      isLoading: false,
      error: null,
    });
  },

  bootstrap: async () => {
    set({ isLoading: true });

    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
          const authState = await adminAuthService.checkAuthState();
          if (authState) {
            set({
              admin: authState.admin,
              accessToken: authState.accessToken,
              isLoading: false,
              error: null,
            });
            resolve(true);
          } else {
            set({ admin: null, accessToken: null, isLoading: false });
            resolve(false);
          }
        } else {
          set({ admin: null, accessToken: null, isLoading: false });
          resolve(false);
        }
        unsubscribe();
      });
    });
  },
}));
