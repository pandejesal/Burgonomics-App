import { create } from "zustand";
import { db } from "@/core/config/firebase";
import { doc, getDoc } from "firebase/firestore";

const STORAGE_KEY = "burgonomics.loyalty.v1";

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
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function persist(state: Pick<LoyaltyState, "balance" | "lastSyncedAt">) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
