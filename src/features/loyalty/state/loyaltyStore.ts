import { create } from "zustand";

const STORAGE_KEY = "burgonomics.loyalty.v1";

interface LoyaltyState {
  balance: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
  hydrate: () => void;
  earn: (points: number) => void;
  redeem: (points: number) => boolean;
  setBalance: (balance: number) => void;
}

function readPersisted(): Partial<LoyaltyState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function persist(state: Pick<LoyaltyState, "balance" | "lifetimeEarned" | "lifetimeRedeemed">) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

export const useLoyaltyStore = create<LoyaltyState>((set, get) => ({
  balance: 250,
  lifetimeEarned: 250,
  lifetimeRedeemed: 0,

  hydrate() {
    const p = readPersisted();
    if (p && typeof p.balance === "number") {
      set({
        balance: p.balance,
        lifetimeEarned: typeof p.lifetimeEarned === "number" ? p.lifetimeEarned : p.balance,
        lifetimeRedeemed: typeof p.lifetimeRedeemed === "number" ? p.lifetimeRedeemed : 0,
      });
    }
  },

  earn(points: number) {
    if (points <= 0) return;
    const next = get().balance + points;
    const earned = get().lifetimeEarned + points;
    set({ balance: next, lifetimeEarned: earned });
    persist({ balance: next, lifetimeEarned: earned, lifetimeRedeemed: get().lifetimeRedeemed });
  },

  redeem(points: number) {
    if (points <= 0) return false;
    const bal = get().balance;
    if (bal < points) return false;
    const next = bal - points;
    const redeemed = get().lifetimeRedeemed + points;
    set({ balance: next, lifetimeRedeemed: redeemed });
    persist({ balance: next, lifetimeEarned: get().lifetimeEarned, lifetimeRedeemed: redeemed });
    return true;
  },

  setBalance(balance: number) {
    const b = Math.max(0, Math.floor(balance));
    set({ balance: b });
    persist({ balance: b, lifetimeEarned: get().lifetimeEarned, lifetimeRedeemed: get().lifetimeRedeemed });
  },
}));

// auto-hydrate on module load (browser only)
if (typeof window !== "undefined") {
  try {
    const p = readPersisted();
    if (p && typeof p.balance === "number") {
      useLoyaltyStore.setState({
        balance: p.balance,
        lifetimeEarned: typeof p.lifetimeEarned === "number" ? p.lifetimeEarned : p.balance,
        lifetimeRedeemed: typeof p.lifetimeRedeemed === "number" ? p.lifetimeRedeemed : 0,
      });
    }
  } catch {
    // ignore
  }
}

export const selectLoyaltyBalance = (s: LoyaltyState) => s.balance;
