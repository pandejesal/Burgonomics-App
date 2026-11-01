/**
 * Per-account/device notification preferences (contract C-01/F5/F6).
 *
 * Storage key: `burg.notifPrefs.v1.<uid>` — one record per signed-in account
 * on this device, so account A's choices can never render for account B on a
 * shared phone. The legacy pre-account blob in `burg.settings` is read-only:
 * a one-time prompt may COPY it into this store, but it is never written back
 * or deleted, and a decline for A does not bind B.
 *
 * Sync model: `desired` is the customer's local intent; `acknowledged` is the
 * last server-confirmed snapshot; `version` is the CAS version of that
 * snapshot. A save always carries `expectedVersion` (0 creates v1) and a
 * `mutationId`. A late response for an older mutation is discarded, a 409
 * keeps the customer's desired values and surfaces a conflict, and offline /
 * 5xx saves stay `pending` for a later retry — never a false "synced".
 */
import { create } from "zustand";
import {
  NOTIFICATION_PREFERENCE_DEFAULTS,
  NOTIFICATION_PREFERENCE_KEYS,
  type LegacyNotificationDecision,
  type NotificationPreferenceKey,
  type NotificationPreferences,
  type NotificationSyncErrorCode,
  type NotificationSyncStatus,
} from "@/features/settings/models";
import {
  notificationsService,
} from "@/features/notifications/services/notificationsService";
import {
  currentScopedUid,
  onAuthUidChange,
} from "@/features/auth/utils/scopedPersistence";

export const NOTIF_PREFS_STORAGE_PREFIX = "burg.notifPrefs.v1";
export const INSTALLATION_ID_STORAGE_KEY = "burg.installationId";
const LEGACY_SETTINGS_STORAGE_KEY = "burg.settings";
const SYNC_CHANNEL_NAME = "burg.notifPrefs.v1";

const memoryStorage = new Map<string, string>();

/** Keeps the install id lazy: SSR and tests never touch crypto at import. */
function storageGet(key: string): string | null {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return memoryStorage.get(key) ?? null;
    }
  }
  return memoryStorage.get(key) ?? null;
}

function storageSet(key: string, value: string): void {
  memoryStorage.set(key, value);
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Quota/restricted storage — the in-memory copy keeps this session usable.
  }
}

function storageRemove(key: string): void {
  memoryStorage.delete(key);
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function randomId(): string {
  const cryptoObj =
    typeof globalThis !== "undefined"
      ? (globalThis.crypto as Crypto | undefined)
      : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function notificationPrefsStorageKey(uid: string): string {
  return `${NOTIF_PREFS_STORAGE_PREFIX}.${uid}`;
}

/** Stable per-device installation id used as the `device_prefs` document id. */
export function getInstallationId(): string {
  const existing = storageGet(INSTALLATION_ID_STORAGE_KEY);
  if (existing) return existing;
  const created = randomId();
  storageSet(INSTALLATION_ID_STORAGE_KEY, created);
  return created;
}

export function defaultNotificationPreferences(): NotificationPreferences {
  return { ...NOTIFICATION_PREFERENCE_DEFAULTS };
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/** Fills absent keys from defaults; an explicit boolean (including false) wins. */
export function coerceNotificationPreferences(value: unknown): NotificationPreferences {
  const source =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    offers: isBoolean(source.offers)
      ? source.offers
      : NOTIFICATION_PREFERENCE_DEFAULTS.offers,
    orderUpdates: isBoolean(source.orderUpdates)
      ? source.orderUpdates
      : NOTIFICATION_PREFERENCE_DEFAULTS.orderUpdates,
    announcements: isBoolean(source.announcements)
      ? source.announcements
      : NOTIFICATION_PREFERENCE_DEFAULTS.announcements,
    supportReplies: isBoolean(source.supportReplies)
      ? source.supportReplies
      : NOTIFICATION_PREFERENCE_DEFAULTS.supportReplies,
  };
}

/**
 * Reads the legacy notification blob out of `burg.settings` without writing
 * anything back. Returns only keys that were explicitly stored, so the
 * migration can preserve a stored `false` while leaving absent keys at the
 * contract defaults.
 */
export function readLegacyNotificationPreferences(): Partial<NotificationPreferences> | null {
  const raw = storageGet(LEGACY_SETTINGS_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const container =
      parsed && typeof parsed === "object" && "state" in parsed
        ? (parsed as { state?: unknown }).state
        : parsed;
    if (!container || typeof container !== "object") return null;
    const legacy = (container as Record<string, unknown>).notifications;
    if (!legacy || typeof legacy !== "object") return null;
    const source = legacy as Record<string, unknown>;
    const candidate: Partial<NotificationPreferences> = {};
    for (const key of NOTIFICATION_PREFERENCE_KEYS) {
      if (isBoolean(source[key])) candidate[key] = source[key];
    }
    return Object.keys(candidate).length > 0 ? candidate : null;
  } catch {
    return null;
  }
}

export function preferencesEqual(
  a: NotificationPreferences,
  b: NotificationPreferences,
): boolean {
  return NOTIFICATION_PREFERENCE_KEYS.every((key) => a[key] === b[key]);
}

export interface PersistedNotificationPrefsV1 {
  schema: 1;
  uid: string;
  desired: NotificationPreferences;
  acknowledged: NotificationPreferences;
  version: number;
  status: NotificationSyncStatus;
  pendingMutationId: string | null;
  conflict: NotificationPrefsConflictState | null;
  legacyDecision: LegacyNotificationDecision;
  legacyCandidate: Partial<NotificationPreferences> | null;
  updatedAt: number;
  /** True only when the canonical read says this installation never saved. */
  usingDefaults: boolean;
}

interface NotificationPrefsConflictState {
  currentVersion: number | null;
  currentPrefs: NotificationPreferences | null;
}

interface NotificationPrefsState {
  uid: string | null;
  desired: NotificationPreferences;
  acknowledged: NotificationPreferences;
  version: number;
  status: NotificationSyncStatus;
  pendingMutationId: string | null;
  conflict: NotificationPrefsConflictState | null;
  errorCode: NotificationSyncErrorCode | null;
  legacyDecision: LegacyNotificationDecision;
  legacyCandidate: Partial<NotificationPreferences> | null;
  usingDefaults: boolean;

  hydrateForUid: (uid: string | null) => Promise<void>;
  setPreference: (key: NotificationPreferenceKey, value: boolean) => Promise<void>;
  claimLegacyPreferences: () => Promise<void>;
  declineLegacyPreferences: () => void;
  retrySync: () => Promise<void>;
  adoptServerVersion: () => void;
  refreshFromStorage: () => void;
  reset: () => void;
}

function normalizeStatus(value: unknown): NotificationSyncStatus {
  return value === "pending" || value === "synced" || value === "conflict" || value === "error"
    ? value
    : "idle";
}

function normalizeLegacyDecision(value: unknown): LegacyNotificationDecision {
  return value === "pending" || value === "claimed" ? value : "declined";
}

function normalizeVersion(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function normalizeLegacyCandidate(value: unknown): Partial<NotificationPreferences> | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const candidate: Partial<NotificationPreferences> = {};
  for (const key of NOTIFICATION_PREFERENCE_KEYS) {
    if (isBoolean(source[key])) candidate[key] = source[key];
  }
  return Object.keys(candidate).length > 0 ? candidate : null;
}

function normalizeConflict(value: unknown): NotificationPrefsConflictState | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  return {
    currentVersion:
      typeof source.currentVersion === "number" && Number.isInteger(source.currentVersion)
        ? source.currentVersion
        : null,
    currentPrefs:
      source.currentPrefs && typeof source.currentPrefs === "object"
        ? coerceNotificationPreferences(source.currentPrefs)
        : null,
  };
}

/** Parses one persisted record; returns null for corrupt/foreign payloads. */
export function parsePersistedNotificationPrefs(
  raw: string | null,
  uid: string,
): PersistedNotificationPrefsV1 | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    if (record.schema !== 1 || record.uid !== uid) return null;
    return {
      schema: 1,
      uid,
      desired: coerceNotificationPreferences(record.desired),
      acknowledged: coerceNotificationPreferences(record.acknowledged),
      version: normalizeVersion(record.version),
      status: normalizeStatus(record.status),
      pendingMutationId:
        typeof record.pendingMutationId === "string" ? record.pendingMutationId : null,
      conflict: normalizeConflict(record.conflict),
      legacyDecision: normalizeLegacyDecision(record.legacyDecision),
      legacyCandidate: normalizeLegacyCandidate(record.legacyCandidate),
      updatedAt:
        typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
          ? record.updatedAt
          : 0,
      usingDefaults: record.usingDefaults === true,
    };
  } catch {
    return null;
  }
}

function readRecord(uid: string): PersistedNotificationPrefsV1 | null {
  return parsePersistedNotificationPrefs(storageGet(notificationPrefsStorageKey(uid)), uid);
}

let broadcastChannel: BroadcastChannel | null = null;

function recordFromState(uid: string): PersistedNotificationPrefsV1 {
  const s = useNotificationPrefsStore.getState();
  return {
    schema: 1,
    uid,
    desired: s.desired,
    acknowledged: s.acknowledged,
    version: s.version,
    status: s.status,
    pendingMutationId: s.pendingMutationId,
    conflict: s.conflict,
    legacyDecision: s.legacyDecision,
    legacyCandidate: s.legacyCandidate,
    updatedAt: Date.now(),
    usingDefaults: s.usingDefaults,
  };
}

function persistCurrent(): void {
  const s = useNotificationPrefsStore.getState();
  if (!s.uid) return;
  storageSet(notificationPrefsStorageKey(s.uid), JSON.stringify(recordFromState(s.uid)));
}

function broadcastCurrent(): void {
  const s = useNotificationPrefsStore.getState();
  if (!s.uid || !broadcastChannel) return;
  try {
    broadcastChannel.postMessage({ type: "prefs", record: recordFromState(s.uid) });
  } catch {
    // A closed channel must never break the save path.
  }
}

let flushPromise: Promise<void> | null = null;
let flushQueued = false;

async function flushPending(): Promise<void> {
  if (flushPromise) {
    flushQueued = true;
    return flushPromise;
  }
  flushPromise = (async () => {
    do {
      flushQueued = false;
      const snapshot = useNotificationPrefsStore.getState();
      if (!snapshot.uid || snapshot.status !== "pending") break;
      const mutationId = snapshot.pendingMutationId ?? randomId();
      if (!snapshot.pendingMutationId) {
        useNotificationPrefsStore.setState({ pendingMutationId: mutationId });
      }
      const result = await notificationsService.updatePreferences({
        installationId: getInstallationId(),
        prefs: snapshot.desired,
        expectedVersion: snapshot.version,
        mutationId,
      });
      const latest = useNotificationPrefsStore.getState();
      if (latest.uid !== snapshot.uid) break;

      if (result.status === "synced") {
        const isCurrentMutation = latest.pendingMutationId === mutationId;
        const achieved = isCurrentMutation && preferencesEqual(latest.desired, result.prefs);
        useNotificationPrefsStore.setState({
          acknowledged: result.prefs,
          version: result.version,
          status: achieved ? "synced" : "pending",
          pendingMutationId: isCurrentMutation ? null : latest.pendingMutationId,
          conflict: null,
          errorCode: null,
          usingDefaults: false,
        });
        persistCurrent();
        broadcastCurrent();
        if (!achieved) {
          // A newer local tap landed while this request was in flight: re-send
          // the latest desired values with the version we just learned.
          flushQueued = true;
        }
      } else if (result.status === "conflict") {
        if (latest.pendingMutationId !== mutationId) {
          if (result.currentVersion !== null) {
            // Stale response — adopt its version base, then retry the newer intent.
            useNotificationPrefsStore.setState({ version: result.currentVersion });
            flushQueued = true;
          } else {
            // Unknown base: do NOT rebase to 0. Surface it and stop looping.
            useNotificationPrefsStore.setState({
              status: "conflict",
              conflict: {
                currentVersion: null,
                currentPrefs: result.currentPrefs,
              },
            });
            persistCurrent();
            broadcastCurrent();
          }
        } else {
          useNotificationPrefsStore.setState({
            status: "conflict",
            conflict: {
              currentVersion: result.currentVersion,
              currentPrefs: result.currentPrefs,
            },
          });
          persistCurrent();
          broadcastCurrent();
        }
      } else if (result.status === "unauthorized") {
        useNotificationPrefsStore.setState({
          status: "error",
          errorCode: "unauthenticated",
        });
        persistCurrent();
        broadcastCurrent();
      } else if (result.status === "forbidden") {
        useNotificationPrefsStore.setState({ status: "error", errorCode: "forbidden" });
        persistCurrent();
        broadcastCurrent();
      } else if (result.status === "failed") {
        useNotificationPrefsStore.setState({
          status: "error",
          errorCode: result.code,
        });
        persistCurrent();
        broadcastCurrent();
      } else {
        useNotificationPrefsStore.setState({
          status: "pending",
          errorCode: result.code === "offline" ? "offline" : "server",
        });
        persistCurrent();
        broadcastCurrent();
      }
    } while (flushQueued);
  })().finally(() => {
    flushPromise = null;
    if (flushQueued) {
      flushQueued = false;
      void flushPending();
    }
  });
  return flushPromise;
}

const EMPTY_STATE = {
  uid: null,
  desired: defaultNotificationPreferences(),
  acknowledged: defaultNotificationPreferences(),
  version: 0,
  status: "idle" as NotificationSyncStatus,
  pendingMutationId: null,
  conflict: null,
  errorCode: null,
  legacyDecision: "declined" as LegacyNotificationDecision,
  legacyCandidate: null,
  usingDefaults: false,
};

let serverHydratedUid: string | null = null;

export const useNotificationPrefsStore = create<NotificationPrefsState>()((set, get) => ({
  ...EMPTY_STATE,

  async hydrateForUid(uid) {
    if (!uid) {
      serverHydratedUid = null;
      set({ ...EMPTY_STATE, desired: defaultNotificationPreferences(), acknowledged: defaultNotificationPreferences() });
      return;
    }

    const persisted = readRecord(uid);
    if (persisted) {
      const legacyCandidate = readLegacyNotificationPreferences();
      const legacyDecision =
        persisted.legacyDecision === "pending" && !legacyCandidate
          ? "declined"
          : persisted.legacyDecision;
      set({
        uid,
        desired: persisted.desired,
        acknowledged: persisted.acknowledged,
        version: persisted.version,
        status: persisted.status,
        pendingMutationId: persisted.pendingMutationId,
        conflict: persisted.conflict,
        errorCode: null,
        legacyDecision,
        legacyCandidate: legacyCandidate ?? persisted.legacyCandidate,
        usingDefaults: persisted.usingDefaults,
      });
    } else {
      const legacyCandidate = readLegacyNotificationPreferences();
      set({
        uid,
        desired: defaultNotificationPreferences(),
        acknowledged: defaultNotificationPreferences(),
        version: 0,
        status: "idle",
        pendingMutationId: null,
        conflict: null,
        errorCode: null,
        legacyDecision: legacyCandidate ? "pending" : "declined",
        legacyCandidate,
        usingDefaults: false,
      });
      persistCurrent();
    }

    const hadPendingSave = get().status === "pending";
    if (serverHydratedUid !== uid) {
      serverHydratedUid = uid;
      const result = await notificationsService.getPreferences(getInstallationId());
      if (get().uid !== uid) return;
      if (result.status === "synced") {
        const current = get();
        const hasLocalIntent =
          current.status === "pending" ||
          current.pendingMutationId !== null ||
          !preferencesEqual(current.desired, current.acknowledged);
        const isNeverSaved = result.exists === false && result.version === 0;
        set({
          acknowledged: result.prefs,
          version: result.version,
          desired: hasLocalIntent ? current.desired : result.prefs,
          status: hasLocalIntent ? "pending" : isNeverSaved ? "idle" : "synced",
          conflict: null,
          errorCode: null,
          usingDefaults: isNeverSaved && !hasLocalIntent,
        });
        persistCurrent();
      } else if (result.status === "unauthorized") {
        set({ status: "error", errorCode: "unauthenticated" });
        persistCurrent();
      } else if (result.status === "forbidden") {
        set({ status: "error", errorCode: "forbidden" });
        persistCurrent();
      } else if (result.status === "conflict") {
        set({
          status: "conflict",
          version: result.currentVersion ?? get().version,
          conflict: {
            currentVersion: result.currentVersion,
            currentPrefs: result.currentPrefs,
          },
        });
        persistCurrent();
      } else if (result.status === "failed") {
        // A missing/mismatched canonical route is a real error, not "no
        // record". If a save was already pending, still try POST; otherwise
        // show the failure instead of a fake synced/idle claim.
        set({
          status: hadPendingSave ? "pending" : "error",
          errorCode: result.code,
        });
        persistCurrent();
      } else {
        // 5xx/offline on the read is not a save failure; keep local intent
        // (and let a pending save proceed).
        set({
          errorCode: result.code === "offline" ? "offline" : "server",
          status: hadPendingSave ? "pending" : get().status,
        });
      }
    }

    if (get().uid === uid && get().status === "pending") {
      await flushPending();
    }
  },

  async setPreference(key, value) {
    const { uid, desired } = get();
    if (!uid) {
      set({ status: "error", errorCode: "unauthenticated" });
      return;
    }
    if (desired[key] === value) return;
    set({
      desired: { ...desired, [key]: value },
      status: "pending",
      pendingMutationId: randomId(),
      conflict: null,
      errorCode: null,
      usingDefaults: false,
    });
    persistCurrent();
    broadcastCurrent();
    await flushPending();
  },

  async claimLegacyPreferences() {
    const { uid, legacyCandidate } = get();
    const merged = coerceNotificationPreferences(legacyCandidate ?? {});
    set({
      desired: merged,
      legacyDecision: "claimed",
      legacyCandidate,
      status: uid ? "pending" : "idle",
      pendingMutationId: uid ? randomId() : null,
      conflict: null,
      errorCode: null,
      usingDefaults: false,
    });
    persistCurrent();
    broadcastCurrent();
    if (uid) await flushPending();
  },

  declineLegacyPreferences() {
    set({ legacyDecision: "declined", legacyCandidate: null });
    persistCurrent();
    broadcastCurrent();
  },

  async retrySync() {
    const { uid, conflict } = get();
    if (!uid) return;
    let currentVersion = conflict?.currentVersion ?? null;
    let currentPrefs = conflict?.currentPrefs ?? null;

    if (conflict && currentVersion === null) {
      // The 409 envelope did not carry the current version. Read it from the
      // canonical route instead of rebasing the CAS write to version 0.
      const canonical = await notificationsService.getPreferences(getInstallationId());
      if (get().uid !== uid) return;
      if (canonical.status === "synced") {
        currentVersion = canonical.version;
        currentPrefs = canonical.prefs;
        set({
          acknowledged: canonical.prefs,
          version: canonical.version,
          conflict: { currentVersion, currentPrefs },
        });
      } else if (canonical.status === "unauthorized") {
        set({ status: "error", errorCode: "unauthenticated" });
        persistCurrent();
        return;
      } else if (canonical.status === "forbidden") {
        set({ status: "error", errorCode: "forbidden" });
        persistCurrent();
        return;
      } else if (canonical.status === "failed") {
        set({ status: "error", errorCode: canonical.code });
        persistCurrent();
        return;
      } else if (canonical.status === "conflict") {
        currentVersion = canonical.currentVersion;
        currentPrefs = canonical.currentPrefs;
      } else {
        set({
          status: "conflict",
          conflict: { currentVersion: null, currentPrefs },
          errorCode: canonical.code === "offline" ? "offline" : "server",
        });
        persistCurrent();
        return;
      }
    }

    if (currentVersion === null) {
      set({
        status: "conflict",
        conflict: { currentVersion: null, currentPrefs },
        errorCode: "server",
      });
      persistCurrent();
      broadcastCurrent();
      return;
    }

    set({
      status: "pending",
      version: currentVersion,
      pendingMutationId: randomId(),
      conflict: null,
      errorCode: null,
    });
    persistCurrent();
    broadcastCurrent();
    await flushPending();
  },

  adoptServerVersion() {
    const { conflict } = get();
    if (!conflict || !conflict.currentPrefs || conflict.currentVersion === null) return;
    set({
      desired: conflict.currentPrefs,
      acknowledged: conflict.currentPrefs,
      version: conflict.currentVersion,
      status: "synced",
      pendingMutationId: null,
      conflict: null,
      errorCode: null,
    });
    persistCurrent();
    broadcastCurrent();
  },

  refreshFromStorage() {
    const { uid } = get();
    if (!uid) return;
    const persisted = readRecord(uid);
    if (!persisted) return;
    const current = get();
    const localHasIntent =
      current.status === "pending" ||
      current.pendingMutationId !== null ||
      !preferencesEqual(current.desired, current.acknowledged);

    if (localHasIntent) {
      // Another tab may have advanced the CAS version; keep this tab's newer
      // intent but rebase its expectedVersion so the next save can land.
      if (persisted.version > current.version) {
        set({
          acknowledged: persisted.acknowledged,
          version: persisted.version,
          pendingMutationId: current.pendingMutationId,
        });
      }
      return;
    }

    set({
      desired: persisted.desired,
      acknowledged: persisted.acknowledged,
      version: persisted.version,
      status: persisted.status,
      pendingMutationId: persisted.pendingMutationId,
      conflict: persisted.conflict,
      legacyDecision: persisted.legacyDecision,
      legacyCandidate: persisted.legacyCandidate,
      usingDefaults: persisted.usingDefaults,
    });
  },

  reset() {
    serverHydratedUid = null;
    set({ ...EMPTY_STATE, desired: defaultNotificationPreferences(), acknowledged: defaultNotificationPreferences() });
  },
}));

/** Applies a record broadcast by another tab for the same signed-in account. */
function applyRemoteRecord(record: PersistedNotificationPrefsV1): void {
  const current = useNotificationPrefsStore.getState();
  if (!current.uid || record.uid !== current.uid) return;
  const localHasIntent =
    current.status === "pending" ||
    current.pendingMutationId !== null ||
    !preferencesEqual(current.desired, current.acknowledged);

  if (record.version > current.version) {
    useNotificationPrefsStore.setState({
      acknowledged: record.acknowledged,
      version: record.version,
      desired: localHasIntent ? current.desired : record.desired,
      status: localHasIntent ? "pending" : record.status,
      pendingMutationId: localHasIntent ? current.pendingMutationId : record.pendingMutationId,
      conflict: record.conflict,
      legacyDecision: record.legacyDecision,
      legacyCandidate: record.legacyCandidate,
      usingDefaults: record.usingDefaults,
    });
    return;
  }

  if (!localHasIntent && record.updatedAt > 0) {
    useNotificationPrefsStore.setState({
      desired: record.desired,
      acknowledged: record.acknowledged,
      version: record.version,
      status: record.status,
      pendingMutationId: record.pendingMutationId,
      conflict: record.conflict,
      legacyDecision: record.legacyDecision,
      legacyCandidate: record.legacyCandidate,
      usingDefaults: record.usingDefaults,
    });
  }
}

let syncInitialized = false;

/**
 * Wires auth transitions, the online retry, and cross-tab reconciliation.
 * Called from `boot.tsx` (web) and from the settings screen so a lazy chunk
 * still initializes. Idempotent.
 */
export function initNotificationPrefsSync(): void {
  if (syncInitialized) return;
  syncInitialized = true;

  onAuthUidChange((uid) => {
    void useNotificationPrefsStore.getState().hydrateForUid(uid);
  });

  if (typeof window === "undefined") return;

  window.addEventListener("online", () => {
    if (useNotificationPrefsStore.getState().status === "pending") {
      void flushPending();
    }
  });

  window.addEventListener("storage", (event) => {
    const uid = currentScopedUid();
    if (!uid || event.key !== notificationPrefsStorageKey(uid) || !event.newValue) return;
    const record = parsePersistedNotificationPrefs(event.newValue, uid);
    if (record) applyRemoteRecord(record);
  });

  if (typeof BroadcastChannel !== "undefined") {
    try {
      broadcastChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
      broadcastChannel.onmessage = (event: MessageEvent) => {
        const payload = event.data as
          | { type?: string; record?: PersistedNotificationPrefsV1 }
          | undefined;
        if (!payload || payload.type !== "prefs" || !payload.record) return;
        applyRemoteRecord(payload.record);
      };
    } catch {
      broadcastChannel = null;
    }
  }
}

/** Test/teardown hook — closes the cross-tab channel without resetting state. */
export function disposeNotificationPrefsSync(): void {
  if (broadcastChannel) {
    try {
      broadcastChannel.close();
    } catch {
      // ignore
    }
  }
  broadcastChannel = null;
  syncInitialized = false;
}
