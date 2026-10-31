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

/**
 * True for the synthetic `<10-digit-phone>@burgonomics.in` address the app
 * used to fabricate during auth hydration. It was never entered by the
 * customer, so it must never count as a real email or be prefilled/saved.
 */
export function isSyntheticEmail(email?: string | null): boolean {
  return typeof email === "string" && /^\d{10}@burgonomics\.in$/.test(email);
}

/**
 * True for a `createdAt` fabricated by `hydrateFromAuth` — it stamped
 * `new Date().toISOString()` at hydration time, i.e. the local calendar day
 * the cache was written. (Nothing renders `createdAt` today, and a real
 * backend value is restored by `profileRepository.refresh()` if present.)
 */
function isSameDaySyntheticCreatedAt(iso: string): boolean {
  const stamped = new Date(iso);
  if (Number.isNaN(stamped.getTime())) return false;
  const now = new Date();
  return (
    stamped.getFullYear() === now.getFullYear() &&
    stamped.getMonth() === now.getMonth() &&
    stamped.getDate() === now.getDate()
  );
}

type PersistedProfileState = { profile: UserProfile | null };

/**
 * v1 → v2 migration: strip the values the old `hydrateFromAuth` fabricated
 * (synthetic phone-domain email, hard-coded "silver" tier, join date = the
 * day the cache was written) so existing users stop seeing them after
 * rehydrate. Every other cached key is passed through untouched.
 */
export function migrateProfilePersistedState(persisted: unknown): PersistedProfileState {
  const state = (persisted ?? {}) as Partial<PersistedProfileState>;
  const cached = state.profile;
  if (!cached || typeof cached !== "object") return { profile: null };

  const profile: Record<string, unknown> = { ...cached };
  const hadSilverTier = profile.membershipTier === "silver";

  if (isSyntheticEmail(profile.email as string | null)) delete profile.email;
  if (hadSilverTier) delete profile.membershipTier;
  // Fabricated createdAt was always written together with the silver tier
  // (and stamped at hydration time, i.e. same local day) — either signal
  // identifies the fake join date.
  if (typeof profile.createdAt === "string") {
    if (hadSilverTier || isSameDaySyntheticCreatedAt(profile.createdAt)) delete profile.createdAt;
  }

  return { profile: profile as unknown as UserProfile };
}

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
            // Never invent email / membershipTier / createdAt — unknown
            // values stay absent until the backend actually stores them.
            set({
              profile: {
                ...current,
                fullName: user.name || "Burger Lover",
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
            // email / membershipTier / createdAt deliberately omitted:
            // fabricating `<phone>@burgonomics.in`, a "silver" tier or a
            // join date of "today" would present made-up data as fact.
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
      version: 2,
      // v1 caches hold the fabricated email/tier/join date — strip them on
      // rehydrate so existing users stop seeing invented account facts.
      migrate: (persisted) => migrateProfilePersistedState(persisted),
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
    // Synthetic (fabricated) or absent email counts as MISSING — never 5/5.
    { label: "Email", ok: !!p.email && !isSyntheticEmail(p.email) },
    { label: "Date of birth", ok: !!p.dateOfBirth },
    { label: "Gender", ok: !!p.gender },
  ];
  const done = checks.filter((c) => c.ok).length;
  return {
    percent: Math.round((done / checks.length) * 100),
    missing: checks.filter((c) => !c.ok).map((c) => c.label),
  };
}
