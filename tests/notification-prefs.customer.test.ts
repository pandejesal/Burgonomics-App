/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * C-01 — per-account/device notification preferences.
 *
 * Covers: uid isolation, legacy `burg.settings.notifications` migration prompt
 * (keep-separate default, explicit false preserved, legacy blob never written),
 * CAS expectedVersion 0 create, offline/5xx pending, and 409 conflict keeping
 * the customer's desired values (no false "synced").
 */
import {
  notificationPrefsStorageKey,
  useNotificationPrefsStore,
} from "../src/features/settings/state/notificationPrefsStore";
import { notificationsService } from "../src/features/notifications/services/notificationsService";
import { NOTIFICATION_PREFERENCE_DEFAULTS } from "../src/features/settings/models";

const UID_A = "uid_alpha";
const UID_B = "uid_bravo";
const LEGACY_KEY = "burg.settings";

function clearStorage() {
  window.localStorage.clear();
}

function legacyBlob(): string {
  return JSON.stringify({
    state: {
      theme: "dark",
      language: "en",
      notifications: {
        offers: false,
        orderUpdates: true,
        announcements: false,
      },
    },
    version: 2,
  });
}

function resetStore() {
  useNotificationPrefsStore.getState().reset();
}

beforeEach(() => {
  clearStorage();
  resetStore();
  vi.restoreAllMocks();
  vi.spyOn(notificationsService, "getPreferences").mockResolvedValue({
    status: "synced",
    version: 0,
    prefs: { ...NOTIFICATION_PREFERENCE_DEFAULTS },
    replicated: false,
    stale: false,
  });
  vi.spyOn(notificationsService, "updatePreferences").mockImplementation(async (input) => ({
    status: "synced",
    version: input.expectedVersion + 1,
    prefs: input.prefs,
    replicated: false,
    stale: false,
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  clearStorage();
  resetStore();
});

describe("C-01 per-account/device isolation", () => {
  it("stores A and B under separate keys and never renders A's choices for B", async () => {
    await useNotificationPrefsStore.getState().hydrateForUid(UID_A);
    await useNotificationPrefsStore.getState().setPreference("announcements", true);
    await useNotificationPrefsStore.getState().setPreference("offers", false);

    const aRaw = window.localStorage.getItem(notificationPrefsStorageKey(UID_A));
    expect(aRaw).toBeTruthy();
    expect(JSON.parse(aRaw!).desired).toMatchObject({
      announcements: true,
      offers: false,
      orderUpdates: true,
      supportReplies: true,
    });

    resetStore();
    await useNotificationPrefsStore.getState().hydrateForUid(UID_B);

    expect(useNotificationPrefsStore.getState().desired).toEqual(
      NOTIFICATION_PREFERENCE_DEFAULTS,
    );
    expect(window.localStorage.getItem(notificationPrefsStorageKey(UID_B))).toBeTruthy();
    const bRaw = window.localStorage.getItem(notificationPrefsStorageKey(UID_B))!;
    expect(JSON.parse(bRaw).desired).toEqual(NOTIFICATION_PREFERENCE_DEFAULTS);
    expect(bRaw).not.toContain('"announcements":true');
  });
});

describe("C-01 legacy migration prompt (keep separate default)", () => {
  it("shows pending, does not apply legacy values automatically, and never rewrites burg.settings", async () => {
    const raw = legacyBlob();
    window.localStorage.setItem(LEGACY_KEY, raw);

    await useNotificationPrefsStore.getState().hydrateForUid(UID_A);
    const state = useNotificationPrefsStore.getState();
    expect(state.legacyDecision).toBe("pending");
    expect(state.desired).toEqual(NOTIFICATION_PREFERENCE_DEFAULTS);

    // Keep-separate is the default action: decline and verify defaults stay.
    state.declineLegacyPreferences();
    expect(useNotificationPrefsStore.getState().legacyDecision).toBe("declined");
    expect(useNotificationPrefsStore.getState().desired).toEqual(
      NOTIFICATION_PREFERENCE_DEFAULTS,
    );
    expect(window.localStorage.getItem(LEGACY_KEY)).toBe(raw);
  });

  it("A's decline does not bind B; B can still claim the legacy choices", async () => {
    const raw = legacyBlob();
    window.localStorage.setItem(LEGACY_KEY, raw);

    await useNotificationPrefsStore.getState().hydrateForUid(UID_A);
    useNotificationPrefsStore.getState().declineLegacyPreferences();

    resetStore();
    await useNotificationPrefsStore.getState().hydrateForUid(UID_B);
    expect(useNotificationPrefsStore.getState().legacyDecision).toBe("pending");

    await useNotificationPrefsStore.getState().claimLegacyPreferences();
    const claimed = useNotificationPrefsStore.getState();
    expect(claimed.legacyDecision).toBe("claimed");
    // Explicit false from the legacy blob is preserved; absent supportReplies
    // falls back to its default true.
    expect(claimed.desired).toEqual({
      offers: false,
      orderUpdates: true,
      announcements: false,
      supportReplies: true,
    });
    expect(window.localStorage.getItem(LEGACY_KEY)).toBe(raw);
  });
});

describe("C-01 CAS + honest sync states", () => {
  it("creates with expectedVersion 0 and then uses the acknowledged version", async () => {
    const update = vi.mocked(notificationsService.updatePreferences);
    await useNotificationPrefsStore.getState().hydrateForUid(UID_A);

    await useNotificationPrefsStore.getState().setPreference("offers", false);
    expect(update.mock.calls[0][0].expectedVersion).toBe(0);
    expect(useNotificationPrefsStore.getState().version).toBe(1);
    expect(useNotificationPrefsStore.getState().usingDefaults).toBe(false);

    await useNotificationPrefsStore.getState().setPreference("announcements", true);
    expect(update.mock.calls[1][0].expectedVersion).toBe(1);
    expect(useNotificationPrefsStore.getState().version).toBe(2);
    expect(useNotificationPrefsStore.getState().status).toBe("synced");
  });

  it("keeps desired values pending on an offline save (never reports synced)", async () => {
    vi.mocked(notificationsService.updatePreferences).mockResolvedValue({
      status: "retryable",
      code: "offline",
    });
    await useNotificationPrefsStore.getState().hydrateForUid(UID_A);
    await useNotificationPrefsStore.getState().setPreference("offers", false);

    const state = useNotificationPrefsStore.getState();
    expect(state.desired.offers).toBe(false);
    expect(state.acknowledged.offers).toBe(true);
    expect(state.status).toBe("pending");
    expect(state.errorCode).toBe("offline");

    const persisted = JSON.parse(
      window.localStorage.getItem(notificationPrefsStorageKey(UID_A))!,
    );
    expect(persisted.status).toBe("pending");
    expect(persisted.desired.offers).toBe(false);
  });

  it("a write 404 is a terminal error, not pending", async () => {
    vi.mocked(notificationsService.updatePreferences).mockResolvedValue({
      status: "failed",
      code: "not_found",
    });
    await useNotificationPrefsStore.getState().hydrateForUid(UID_A);
    await useNotificationPrefsStore.getState().setPreference("offers", false);

    const state = useNotificationPrefsStore.getState();
    expect(state.status).toBe("error");
    expect(state.errorCode).toBe("not_found");
    expect(state.status).not.toBe("pending");
  });

  it("treats a 5xx as pending too", async () => {
    vi.mocked(notificationsService.updatePreferences).mockResolvedValue({
      status: "retryable",
      code: "server",
    });
    await useNotificationPrefsStore.getState().hydrateForUid(UID_A);
    await useNotificationPrefsStore.getState().setPreference("supportReplies", false);
    expect(useNotificationPrefsStore.getState().status).toBe("pending");
    expect(useNotificationPrefsStore.getState().errorCode).toBe("server");
  });

  it("a 409 keeps the desired values and surfaces a conflict", async () => {
    const update = vi.mocked(notificationsService.updatePreferences);
    await useNotificationPrefsStore.getState().hydrateForUid(UID_A);
    await useNotificationPrefsStore.getState().setPreference("offers", false);

    update.mockResolvedValueOnce({
      status: "conflict",
      currentVersion: 4,
      currentPrefs: {
        offers: true,
        orderUpdates: true,
        announcements: true,
        supportReplies: false,
      },
      code: "PREF_VERSION_CONFLICT",
    });
    await useNotificationPrefsStore.getState().setPreference("announcements", true);

    const state = useNotificationPrefsStore.getState();
    expect(state.status).toBe("conflict");
    expect(state.desired.offers).toBe(false);
    expect(state.desired.announcements).toBe(true);
    expect(state.conflict).toEqual({
      currentVersion: 4,
      currentPrefs: {
        offers: true,
        orderUpdates: true,
        announcements: true,
        supportReplies: false,
      },
    });
    expect(state.status).not.toBe("synced");

    // "Keep mine" rebases on the conflict version instead of silently losing.
    update.mockResolvedValueOnce({
      status: "synced",
      version: 5,
      prefs: state.desired,
      replicated: false,
      stale: false,
    });
    await useNotificationPrefsStore.getState().retrySync();
    expect(useNotificationPrefsStore.getState().status).toBe("synced");
    expect(vi.mocked(notificationsService.updatePreferences).mock.lastCall?.[0].expectedVersion).toBe(
      4,
    );
  });

  it("discards a late response for an older mutation and saves the newest intent", async () => {
    const update = vi.mocked(notificationsService.updatePreferences);
    await useNotificationPrefsStore.getState().hydrateForUid(UID_A);

    let resolveFirst: (value: unknown) => void = () => undefined;
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    update.mockImplementationOnce(() => first as never);

    const firstSave = useNotificationPrefsStore.getState().setPreference("offers", false);
    await Promise.resolve();

    update.mockResolvedValueOnce({
      status: "synced",
      version: 2,
      prefs: {
        offers: false,
        orderUpdates: true,
        announcements: true,
        supportReplies: true,
      },
      replicated: false,
      stale: false,
    } as never);
    const secondSave = useNotificationPrefsStore
      .getState()
      .setPreference("announcements", true);

    resolveFirst({
      status: "synced",
      version: 1,
      prefs: {
        offers: false,
        orderUpdates: true,
        announcements: false,
        supportReplies: true,
      },
      replicated: false,
      stale: false,
    });
    await Promise.all([firstSave, secondSave]);

    const state = useNotificationPrefsStore.getState();
    expect(state.desired.announcements).toBe(true);
    expect(state.acknowledged.announcements).toBe(true);
    expect(state.version).toBe(2);
    expect(state.status).toBe("synced");
    expect(update.mock.calls[1][0].expectedVersion).toBe(1);
  });

  it("a canonical-read 404 is a visible error, not a fake idle/synced state", async () => {
    vi.mocked(notificationsService.getPreferences).mockResolvedValueOnce({
      status: "failed",
      code: "not_found",
    });

    await useNotificationPrefsStore.getState().hydrateForUid(UID_A);

    const state = useNotificationPrefsStore.getState();
    expect(state.status).toBe("error");
    expect(state.errorCode).toBe("not_found");
    expect(state.status).not.toBe("synced");
  });

  it("never-saved account (exists:false, version 0) hydrates defaults as idle", async () => {
    vi.mocked(notificationsService.getPreferences).mockResolvedValueOnce({
      status: "synced",
      exists: false,
      version: 0,
      prefs: { ...NOTIFICATION_PREFERENCE_DEFAULTS },
      replicated: false,
      stale: false,
    });

    await useNotificationPrefsStore.getState().hydrateForUid(UID_A);

    const state = useNotificationPrefsStore.getState();
    expect(state.status).toBe("idle");
    expect(state.usingDefaults).toBe(true);
    expect(state.desired).toEqual(NOTIFICATION_PREFERENCE_DEFAULTS);
    expect(state.status).not.toBe("synced");
  });

  it("a 409 without currentVersion never rebases to 0; Keep mine reads the real version first", async () => {
    const update = vi.mocked(notificationsService.updatePreferences);
    await useNotificationPrefsStore.getState().hydrateForUid(UID_A);
    await useNotificationPrefsStore.getState().setPreference("offers", false);
    const versionBeforeConflict = useNotificationPrefsStore.getState().version;

    update.mockResolvedValueOnce({
      status: "conflict",
      currentVersion: null,
      currentPrefs: null,
      code: "PREF_VERSION_CONFLICT",
    });
    await useNotificationPrefsStore.getState().setPreference("announcements", true);

    const conflicted = useNotificationPrefsStore.getState();
    expect(conflicted.status).toBe("conflict");
    expect(conflicted.conflict).toEqual({ currentVersion: null, currentPrefs: null });
    expect(conflicted.version).toBe(versionBeforeConflict);

    // Canonical read recovers the real server version, then the CAS retry
    // uses it (never expectedVersion 0).
    vi.mocked(notificationsService.getPreferences).mockResolvedValueOnce({
      status: "synced",
      version: 7,
      prefs: {
        offers: true,
        orderUpdates: true,
        announcements: true,
        supportReplies: true,
      },
      replicated: false,
      stale: false,
    });
    update.mockResolvedValueOnce({
      status: "synced",
      version: 8,
      prefs: {
        offers: false,
        orderUpdates: true,
        announcements: true,
        supportReplies: true,
      },
      replicated: false,
      stale: false,
    });

    await useNotificationPrefsStore.getState().retrySync();

    expect(update.mock.lastCall?.[0].expectedVersion).toBe(7);
    expect(useNotificationPrefsStore.getState().status).toBe("synced");
    expect(useNotificationPrefsStore.getState().version).toBe(8);
    expect(useNotificationPrefsStore.getState().desired.offers).toBe(false);
  });
});
