import { create } from "zustand";
import { db } from "@/core/config/firebase";
import { doc, getDoc } from "firebase/firestore";
import { currentScopedUid, onAuthUidChange, scopedStorageKey } from "@/features/auth/utils/scopedPersistence";

// Loop 36/120 privacy (finding 6): the cached balance is per signed-in user
// (guests keep the legacy key). STRICT scoping — no legacy fallback read,
// so one account's cached balance never surfaces in another's session.
const BASE_STORAGE_KEY = "burgonomics.loyalty.v1"; // gitleaks:allow — storage namespace, not a credential
const storageKey = () => scopedStorageKey(BASE_STORAGE_KEY, currentScopedUid());

interface LoyaltyState {
  /**
   * Loop 65/120: this balance is a CACHE of the server truth
   * (customers/{uid}.loyaltyPoints) — never minted locally. The old store
   * defaulted every user to 250 phantom points, granted 50 more on signup,
   * and credited purchases, all without any server backing; the server
   * (Loops 62-63) charges against its own ledger, so the fiction also
   * produced "You only have 0" errors at pay time. Defaults 0, converges
   * via refreshFromServer.
   */
  balance: number;
  /** Last successful server sync (ms epoch) — display only, never a truth claim. */
  lastSyncedAt: number | null;
  hydrate: () => void;
  /**
   * Pull the authoritative balance for a signed-in customer. Guests (no uid)
   * hold zero. Failures keep the last cached value (offline-safe) and never
   * invent one. Firestore rules let customers read only their own doc and
   * never write loyaltyPoints — the server is the sole minter.
   */
  refreshFromServer: (uid: string | null | undefined) => Promise<void>;
}

function readPersisted(): { balance?: unknown; lastSyncedAt?: unknown } | null {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function persist(state: Pick<LoyaltyState, "balance" | "lastSyncedAt">) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

function cleanBalance(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0
    ? Math.floor(raw)
    : 0;
}

export const useLoyaltyStore = create<LoyaltyState>((set, get) => ({
  balance: 0,
  lastSyncedAt: null,

  hydrate() {
    const p = readPersisted();
    if (!p) return;
    // Cached values are pre-Loop-65 fiction-capable: clamp, never trust.
    // refreshFromServer overwrites with truth when authed + online.
    set({
      balance: cleanBalance(p.balance),
      lastSyncedAt:
        typeof p.lastSyncedAt === "number" && Number.isFinite(p.lastSyncedAt)
          ? p.lastSyncedAt
          : null,
    });
  },

  async refreshFromServer(uid) {
    if (!uid) {
      set({ balance: 0, lastSyncedAt: null });
      persist({ balance: 0, lastSyncedAt: null });
      return;
    }
    try {
      const snap = await getDoc(doc(db, "customers", uid));
      const server = snap.exists()
        ? cleanBalance((snap.data() as any)?.loyaltyPoints)
        : 0;
      const at = Date.now();
      // Server is truth: adopt unconditionally, even downward (post-purchase
      // debits must show).
      set({ balance: server, lastSyncedAt: at });
    } catch (err) {
      // Offline / denied / missing doc: keep the last cached value.
      // Callers (checkout) already clamp display; charge-time truth is
      // enforced server-side (Loop 62 400s on over-claim). Logged so a
      // permanently stale balance is diagnosable.
      const { logger } = await import("@/core/logging/logger");
      logger.warn("loyalty.refresh_failed", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  },
}));

// Loop 65/120: tier derives from the server-verified balance, not the
// retired local lifetime counter (phantom 250 + local mints inflated every
// fresh user toward Silver). Single source of truth — both the wallet card
// and the profile header tier chip must use useLoyaltyTier() so they can
// never contradict each other (GOLD-vs-BRONZE class bug).
export function tierFor(balance: number): string {
  if (balance >= 700) return "Gold";
  if (balance >= 300) return "Silver";
  return "Bronze";
}

/** Live tier label derived from the cached server balance. */
export function useLoyaltyTier(): string {
  const balance = useLoyaltyStore((s) => s.balance);
  return tierFor(balance);
}

// auto-hydrate cache on module load (browser only); truth arrives via
// refreshFromServer once the auth identity is known.
if (typeof window !== "undefined") {
  try {
    const p = readPersisted();
    if (p) {
      useLoyaltyStore.setState({
        balance: cleanBalance(p.balance),
        lastSyncedAt:
          typeof p?.lastSyncedAt === "number" && Number.isFinite(p.lastSyncedAt)
            ? p.lastSyncedAt
            : null,
      });
    }
  } catch {
    // corrupted cache: boot at zero, refresh later
  }
}

// Loop 36/120 (finding 6): re-scope on identity change — never carry user
// A's cached balance into user B's session. Guests (uid null) hold zero
// (the server is the only minter; refreshFromServer(null) has the same
// semantics). The incoming scope is read directly from storage.
onAuthUidChange((uid) => {
  if (!uid) {
    useLoyaltyStore.setState({ balance: 0, lastSyncedAt: null });
    return;
  }
  try {
    const p = readPersisted();
    useLoyaltyStore.setState({
      balance: p ? cleanBalance(p.balance) : 0,
      lastSyncedAt:
        p && typeof p.lastSyncedAt === "number" && Number.isFinite(p.lastSyncedAt)
          ? p.lastSyncedAt
          : null,
    });
  } catch {
    useLoyaltyStore.setState({ balance: 0, lastSyncedAt: null });
  }
});
