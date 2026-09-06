import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AppliedPromo, CartLine, CartStatus } from "@/features/cart/models";
import type { Product } from "@/features/menu/models";

export const PRICE_LOCK_DURATION_MS = 10 * 60 * 1000; // 10 minutes

interface CartState {
  // Persisted
  storeId: string | null;
  lines: CartLine[];
  promo: AppliedPromo | null;
  priceLockExpiresAt: number | null;

  // Runtime
  status: CartStatus;
  error: string | null;
  /** Future sync placeholder — flips to true when a mutation happens offline. */
  syncPending: boolean;

  // Mutations
  addLine: (line: CartLine) => void;
  removeLine: (lineId: string) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  updateNotes: (lineId: string, notes: string) => void;
  clear: () => void;

  setPromo: (promo: AppliedPromo | null) => void;
  setStatus: (status: CartStatus) => void;
  setError: (message: string | null) => void;
  setSyncPending: (v: boolean) => void;
  renewPriceLock: () => void;
  isPriceLockExpired: () => boolean;
  revalidateWithProducts: (products: Product[]) => { changed: boolean; messages: string[] };
  /** Replace all lines. Used when a store switch confirms a wipe. */
  reset: (storeId?: string | null) => void;
}

const initialStatus = (lines: CartLine[]): CartStatus => (lines.length ? "ready" : "empty");

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      storeId: null,
      lines: [],
      promo: null,
      priceLockExpiresAt: null,

      status: "empty",
      error: null,
      syncPending: false,

      addLine: (line) =>
        set((s) => {
          if (s.storeId && s.storeId !== line.storeId) {
            return { error: "Cart belongs to a different store." };
          }
          const key = signatureOf(line);
          const existingIdx = s.lines.findIndex((l) => signatureOf(l) === key);
          let lines: CartLine[];
          if (existingIdx >= 0) {
            lines = s.lines.map((l, i) =>
              i === existingIdx ? { ...l, quantity: Math.min(99, l.quantity + line.quantity) } : l,
            );
          } else {
            lines = [...s.lines, line];
          }
          return {
            lines,
            storeId: line.storeId,
            priceLockExpiresAt: Date.now() + PRICE_LOCK_DURATION_MS,
            status: "ready",
            error: null,
          };
        }),

      removeLine: (lineId) =>
        set((s) => {
          const lines = s.lines.filter((l) => l.lineId !== lineId);
          return {
            lines,
            status: initialStatus(lines),
            storeId: lines.length ? s.storeId : null,
            promo: lines.length ? s.promo : null,
            priceLockExpiresAt: lines.length ? s.priceLockExpiresAt : null,
          };
        }),

      updateQuantity: (lineId, quantity) => {
        if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
          get().removeLine(lineId);
          return;
        }
        const validQuantity = Math.min(99, Math.max(1, Math.floor(quantity)));
        set((s) => ({
          lines: s.lines.map((l) => (l.lineId === lineId ? { ...l, quantity: validQuantity } : l)),
        }));
      },

      updateNotes: (lineId, notes) =>
        set((s) => ({
          lines: s.lines.map((l) =>
            l.lineId === lineId ? { ...l, notes: notes || undefined } : l,
          ),
        })),

      clear: () =>
        set({
          lines: [],
          storeId: null,
          promo: null,
          priceLockExpiresAt: null,
          status: "empty",
          error: null,
        }),

      setPromo: (promo) => set({ promo }),
      setStatus: (status) => set({ status }),
      setError: (message) => set({ error: message }),
      setSyncPending: (v) => set({ syncPending: v }),

      renewPriceLock: () =>
        set({
          priceLockExpiresAt: Date.now() + PRICE_LOCK_DURATION_MS,
        }),

      isPriceLockExpired: () => {
        const expires = get().priceLockExpiresAt;
        if (!expires || get().lines.length === 0) return false;
        return Date.now() > expires;
      },

      revalidateWithProducts: (products: Product[]) => {
        const s = get();
        const productMap = new Map(products.map((p) => [p.id, p]));
        const messages: string[] = [];
        let changed = false;

        const updatedLines = s.lines.map((line) => {
          const prod = productMap.get(line.productId);
          if (!prod) return line;

          let lineChanged = false;
          let newPrice = line.unitPrice;
          let newAvailability = line.availability;

          if (prod.price !== line.unitPrice) {
            messages.push(
              `Price for ${line.name} updated from ₹${line.unitPrice} to ₹${prod.price}.`,
            );
            newPrice = prod.price;
            lineChanged = true;
          }

          if (!prod.inStock && line.availability !== "unavailable") {
            messages.push(`${line.name} is now out of stock.`);
            newAvailability = "unavailable";
            lineChanged = true;
          }

          if (lineChanged) {
            changed = true;
            return {
              ...line,
              unitPrice: newPrice,
              price: newPrice,
              availability: newAvailability,
            };
          }
          return line;
        });

        if (changed) {
          set({
            lines: updatedLines,
            priceLockExpiresAt: Date.now() + PRICE_LOCK_DURATION_MS,
          });
        } else {
          set({
            priceLockExpiresAt: Date.now() + PRICE_LOCK_DURATION_MS,
          });
        }

        return { changed, messages };
      },

      reset: (storeId = null) =>
        set({
          lines: [],
          storeId,
          promo: null,
          priceLockExpiresAt: null,
          status: "empty",
          error: null,
        }),
    }),
    {
      name: "burg.cart",
      version: 4,
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
      skipHydration: true,
      partialize: (s) => ({
        storeId: s.storeId,
        lines: s.lines,
        promo: s.promo,
        priceLockExpiresAt: s.priceLockExpiresAt,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.status = initialStatus(state.lines);
      },
    migrate: (persisted, version) => {
      if (!persisted || typeof persisted !== "object" || version < 4) {
        const anyPersisted = (persisted ?? {}) as Record<string, unknown>;
        // Per-line validation: a tampered/legacy burg.cart entry
        // ({unitPrice:"free", quantity:"999"}) used to rehydrate straight
        // into pricing math (free items, NaN totals). Scrub or drop lines.
        const lines = Array.isArray(anyPersisted.lines)
          ? (anyPersisted.lines as Record<string, unknown>[]).flatMap((l) => {
              if (!l || typeof l !== "object") return [];
              const unitPrice = Number((l as any).unitPrice);
              const quantity = Number((l as any).quantity);
              if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 100000) return [];
              if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return [];
              const productId = (l as any).productId;
              const name = (l as any).name;
              if (typeof productId !== "string" || typeof name !== "string") return [];
              const modifiers = Array.isArray((l as any).modifiers) ? (l as any).modifiers : [];
              return [{ ...(l as object), unitPrice, quantity, modifiers } as CartLine];
            })
          : [];
        return {
          storeId: (anyPersisted.storeId as string | null) ?? null,
          lines,
          promo: (anyPersisted.promo as AppliedPromo | null) ?? null,
          priceLockExpiresAt:
            typeof anyPersisted.priceLockExpiresAt === "number"
              ? anyPersisted.priceLockExpiresAt
              : null,
        } as Partial<CartState>;
      }
      return persisted as Partial<CartState>;
    },
    },
  ),
);

// -- Selectors ---------------------------------------------------------

export const selectItemCount = (s: CartState): number =>
  s.lines.reduce((sum, l) => sum + l.quantity, 0);

export const selectHasItems = (s: CartState): boolean => s.lines.length > 0;

export const selectCartStoreId = (s: CartState): string | null => s.storeId;

// -- Helpers -----------------------------------------------------------

function signatureOf(line: CartLine): string {
  const mods = [...(line.modifiers ?? [])]
    .map((m) => `${m.groupId}:${m.optionId}`)
    .sort()
    .join("|");
  return `${line.productId}#${mods}#${(line.notes ?? "").trim()}`;
}
