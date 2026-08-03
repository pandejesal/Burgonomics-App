/**
 * Offline cache scaffolding. Real SQLite/IndexedDB adapters land alongside
 * the Menu and Store features (see Frontend Architecture §22).
 *
 * Each namespace exposes a symmetric read/write/clear surface so future
 * implementations can swap the in-memory Map for durable storage without
 * touching call sites.
 */
type CacheEntry<T> = { value: T; expiresAt?: number };

const buckets = new Map<string, Map<string, CacheEntry<unknown>>>();

const bucket = (name: string) => {
  let b = buckets.get(name);
  if (!b) buckets.set(name, (b = new Map()));
  return b;
};

export const offlineCache = {
  get<T>(namespace: string, key: string): T | null {
    const entry = bucket(namespace).get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < Date.now()) return null;
    return entry.value;
  },
  set<T>(namespace: string, key: string, value: T, ttlMs?: number) {
    bucket(namespace).set(key, {
      value,
      expiresAt: ttlMs ? Date.now() + ttlMs : undefined,
    });
  },
  clear(namespace: string) {
    buckets.delete(namespace);
  },
};

export const CACHE_NAMESPACES = {
  MENU: "menu",
  STORES: "stores",
  OFFERS: "offers",
  PREFERENCES: "preferences",
  CART: "cart",
  ORDER_HISTORY: "order_history",
} as const;
