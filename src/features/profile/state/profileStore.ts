/**
 * Profile state — persisted local cache of the authenticated user's
 * profile. Stays in sync with the auth session via `hydrateFromAuth`
 * so the UI can render the dashboard the instant the OTP verifies.
 *
 * When the backend lands, seed with `profileRepository.refresh()`
 * after auth bootstrap; the store shape does not change.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ProfileCompletion, ProfileInput, UserProfile } from "@/features/profile/models";

export type ProfileStatus = "idle" | "loading" | "refreshing" | "updating" | "error";

interface ProfileState {
  profile: UserProfile | null;
  status: ProfileStatus;
  error: string | null;

  hydrateFromAuth: (user: { id: string; phone: string; name?: string } | null) => void;
  applyPatch: (patch: ProfileInput) => void;
  setStatus: (s: ProfileStatus) => void;
  setUpdating: (v: boolean) => void;
  setError: (msg: string | null) => void;
  clear: () => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      profile: null,
      status: "idle",
      error: null,

      hydrateFromAuth: (user) => {
        if (!user) return;
        const current = get().profile;
        if (current && current.id === user.id) {
          if (!current.fullName) {
            set({
              profile: {
                ...current,
                fullName: user.name || "Burger Lover",
                email: current.email || `${user.phone}@burgonomics.in`,
              },
            });
          }
          return;
        }
        set({
          profile: {
            id: user.id,
            phone: user.phone,
            fullName: user.name || "Burger Lover",
            email: `${user.phone}@burgonomics.in`,
            membershipTier: "silver",
            createdAt: new Date().toISOString(),
          },
        });
      },

      applyPatch: (patch) =>
        set((s) => ({
          profile: s.profile ? { ...s.profile, ...patch } : s.profile,
        })),

      setStatus: (status) => set({ status }),
      setUpdating: (v) => set({ status: v ? "updating" : "idle" }),
      setError: (error) => set({ error, status: error ? "error" : "idle" }),

      clear: () => set({ profile: null, status: "idle", error: null }),
    }),
    {
      name: "burg.profile",
      version: 1,
      storage: createJSONStorage(() => {
        if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
        const memoryStorage = new Map<string, string>();
        return {
          getItem: (key: string) => memoryStorage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            memoryStorage.set(key, value);
          },
          removeItem: (key: string) => {
            memoryStorage.delete(key);
          },
          clear: () => {
            memoryStorage.clear();
          },
          length: memoryStorage.size,
          key: (index: number) => Array.from(memoryStorage.keys())[index] ?? null,
        } as Storage;
      }),
      partialize: (s) => ({ profile: s.profile }),
    },
  ),
);

export function computeCompletion(p: UserProfile | null): ProfileCompletion {
  if (!p) return { percent: 0, missing: ["Full name", "Email"] };
  const checks: Array<{ label: string; ok: boolean }> = [
    { label: "Full name", ok: !!p.fullName?.trim() },
    { label: "Phone", ok: !!p.phone },
    { label: "Email", ok: !!p.email },
    { label: "Date of birth", ok: !!p.dateOfBirth },
    { label: "Gender", ok: !!p.gender },
  ];
  const done = checks.filter((c) => c.ok).length;
  return {
    percent: Math.round((done / checks.length) * 100),
    missing: checks.filter((c) => !c.ok).map((c) => c.label),
  };
}
