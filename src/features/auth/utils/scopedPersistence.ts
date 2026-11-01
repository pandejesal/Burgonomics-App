/**
 * Per-user persistence scoping — Loop 36/120 pattern, generalized from
 * addressStore so every user-owned persisted store shares ONE key scheme
 * and ONE re-scope discipline instead of four hand-rolled copies.
 *
 * Privacy invariant (finding 6): two signed-in accounts on the same device
 * must never read each other's persisted orders / notifications / checkout
 * notes / loyalty cache. Writes are ALWAYS scoped to the current uid; guests
 * (uid null) keep the legacy unscoped key. Reads are STRICTLY scoped by
 * default — a signed-in user never falls back to the legacy key, which may
 * hold another account's pre-scoping data (that fallback is the leak this
 * module exists to close). `legacyFallbackRead` opts a store back into the
 * addressStore handoff read (legacy key consulted only when the signed-in
 * scope is EMPTY) for data a guest legitimately enters before signing in
 * mid-flow — use it only where that handoff is a documented behaviour.
 *
 * Auth coupling is INJECTED (configureAuthUidSource), not imported:
 * authStore's import graph reaches notificationsStore (authStore →
 * notificationsService → pushNotifications → notificationsStore), so a
 * static import of authStore from this leaf module would be a cycle whose
 * named binding can be captured before authStore finishes evaluating.
 * authStore registers itself once, after its store is created.
 */

/** `key::uid` for signed-in users; guests (uid null) keep the legacy key. */
export const scopedStorageKey = (key: string, uid?: string | null): string =>
  uid ? `${key}::${uid}` : key;

export interface AuthUidSource {
  /** Current signed-in uid (guest = null). Read lazily — never cached. */
  getUid: () => string | null | undefined;
  /** Subscribe to auth-state snapshots (zustand `useAuthStore.subscribe`). */
  subscribe: (listener: (state: { user?: { id?: string } | null }) => void) => () => void;
}

let uidSource: AuthUidSource | null = null;
const uidListeners = new Set<(uid: string | null) => void>();
let lastEmittedUid: string | null | undefined = undefined;

/**
 * Installs the auth uid source and emits the current uid to every
 * already-registered listener (lazy-chunk case: a store module can load
 * after login already completed, so no uid *change* ever fires for it).
 * Idempotent per source object; called by authStore at module init.
 */
export function configureAuthUidSource(source: AuthUidSource): void {
  uidSource = source;
  source.subscribe((s) => {
    const uid = s?.user?.id ?? null;
    if (uid === lastEmittedUid) return;
    lastEmittedUid = uid;
    for (const listener of uidListeners) listener(uid);
  });
  const initial = source.getUid() ?? null;
  if (initial !== lastEmittedUid) {
    lastEmittedUid = initial;
    for (const listener of uidListeners) listener(initial);
  }
}

/** Current signed-in uid (guest = null) once authStore registered; null before. */
export const currentScopedUid = (): string | null => uidSource?.getUid() ?? null;

/**
 * Runs `handler` whenever the signed-in uid CHANGES (login, logout,
 * account switch), and immediately with the current uid when one is already
 * known (the lazy-chunk case above). Registration order is irrelevant: if
 * the source configures later, the initial emit reaches this listener then.
 */
export function onAuthUidChange(handler: (uid: string | null) => void): () => void {
  uidListeners.add(handler);
  if (uidSource && lastEmittedUid !== undefined) handler(lastEmittedUid);
  return () => {
    uidListeners.delete(handler);
  };
}

export interface ScopedStorageOptions {
  /**
   * Consult the legacy unscoped key when a signed-in scope has no entry.
   * Only for documented guest→login handoffs (e.g. checkout notes entered
   * before a mid-flow sign-in). Default false — strict scoping.
   */
  legacyFallbackRead?: boolean;
}

/**
 * Wraps a Storage so every op resolves the key against the CURRENT uid at
 * call time. Privacy holds for WRITES (always scoped — never leak one
 * device user's rows into another scope).
 */
export function scopedNamespacedStorage(
  base: Storage,
  options: ScopedStorageOptions = {},
): Storage {
  const scopedKey = (key: string) => scopedStorageKey(key, currentScopedUid());
  return {
    getItem: (key: string) => {
      const scoped = scopedKey(key);
      const hit = base.getItem(scoped);
      if (hit !== null || scoped === key || !options.legacyFallbackRead) return hit;
      return base.getItem(key);
    },
    setItem: (key: string, value: string) => base.setItem(scopedKey(key), value),
    removeItem: (key: string) => base.removeItem(scopedKey(key)),
    clear: () => base.clear(),
    get length() {
      return base.length;
    },
    key: (index: number) => base.key(index),
  };
}

/**
 * Persisted caches that hold user-owned data under `key::uid`.
 *
 * DPDP erasure: after an account is deleted the uid is gone forever, so its
 * scoped rows must not linger on the device. Normal logout deliberately KEEPS
 * them (a returning customer finds their addresses/cart again); only the
 * deletion path purges. Kept as an explicit list — a typo here fails a test
 * (tests/local-cache-purge.test.ts) rather than silently leaving PII behind.
 */
export const USER_SCOPED_CACHE_KEYS = [
  "burg.addresses", // saved delivery addresses
  "burg.notifications", // in-app notification tray (bodies may carry order detail)
  "burgonomics.loyalty.v1", // cached loyalty balance
  "burg.cart", // cart lines
  "burg.checkout", // checkout notes / fulfilment draft
] as const;

/**
 * Removes every `baseKey::uid` row for ONE uid. Never falls back to the
 * unscoped legacy keys: those are the guest scope, not this account's.
 * Returns the keys actually removed so the caller can log an audit trail.
 */
export function purgeScopedLocalCaches(
  uid: string | null | undefined,
  baseKeys: readonly string[] = USER_SCOPED_CACHE_KEYS,
): string[] {
  if (!uid || typeof window === "undefined") return [];
  const removed: string[] = [];
  for (const baseKey of baseKeys) {
    const key = scopedStorageKey(baseKey, uid);
    try {
      if (window.localStorage.getItem(key) === null) continue;
      window.localStorage.removeItem(key);
      removed.push(key);
    } catch {
      // Restricted/quota-frozen storage: nothing can be purged locally; the
      // server-side erasure still stands and the caller logs the miss.
    }
  }
  return removed;
}

/** In-memory Storage stand-in for non-browser (SSR/node test) runtimes. */
export function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
    get length() {
      return map.size;
    },
    key: (index: number) => Array.from(map.keys())[index] ?? null,
  } as Storage;
}

/** localStorage when available, memory storage otherwise. */
export function browserOrMemoryStorage(): Storage {
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return createMemoryStorage();
}

/**
 * Reads a persisted zustand payload straight from storage for `uid`
 * (scoped key first; legacy fallback only when `legacyFallbackRead`) — the
 * same "read the incoming scope BEFORE setState" discipline addressStore
 * uses, because setState's persist write-back is synchronous while a
 * rehydrate read is async (clearing first would persist [] over the
 * incoming scope before its read lands). Setting the just-read rows makes
 * the write-back echo identical content.
 */
export function readScopedPersisted<T>(
  baseKey: string,
  uid: string | null,
  parse: (state: Record<string, unknown>) => T,
  empty: T,
  legacyFallbackRead = false,
): T {
  if (typeof window === "undefined") return empty;
  try {
    const raw =
      window.localStorage.getItem(scopedStorageKey(baseKey, uid)) ??
      (legacyFallbackRead && uid ? window.localStorage.getItem(baseKey) : null);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
    if (!parsed?.state || typeof parsed.state !== "object") return empty;
    return parse(parsed.state);
  } catch {
    return empty;
  }
}
