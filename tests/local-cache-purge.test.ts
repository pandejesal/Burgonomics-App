/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * F10 (P3 privacy) — after an account is DELETED the uid is gone forever, so
 * the `key::uid` caches it left on the device are dead personal data. The
 * sign-out that follows deletion purges exactly that uid's scopes and touches
 * nothing belonging to another account on the same device.
 */
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, doc: vi.fn((...a: unknown[]) => a), getDoc: vi.fn() };
});

import {
  purgeScopedLocalCaches,
  scopedStorageKey,
  USER_SCOPED_CACHE_KEYS,
} from "../src/features/auth/utils/scopedPersistence";

const UID_A = "uid_deleted";
const UID_B = "uid_other";

describe("purgeScopedLocalCaches (F10)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    for (const base of USER_SCOPED_CACHE_KEYS) {
      window.localStorage.setItem(scopedStorageKey(base, UID_A), `{"owner":"${UID_A}"}`);
      window.localStorage.setItem(scopedStorageKey(base, UID_B), `{"owner":"${UID_B}"}`);
      // Guest / legacy scope: never this account's rows.
      window.localStorage.setItem(base, `{"owner":"guest"}`);
    }
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("removes only the deleted uid's caches", () => {
    const removed = purgeScopedLocalCaches(UID_A);

    expect(removed).toHaveLength(USER_SCOPED_CACHE_KEYS.length);
    for (const base of USER_SCOPED_CACHE_KEYS) {
      expect(window.localStorage.getItem(scopedStorageKey(base, UID_A))).toBeNull();
    }
  });

  it("leaves the other account's scopes and the guest scope intact", () => {
    purgeScopedLocalCaches(UID_A);

    for (const base of USER_SCOPED_CACHE_KEYS) {
      expect(window.localStorage.getItem(scopedStorageKey(base, UID_B))).toBe(
        `{"owner":"${UID_B}"}`,
      );
      expect(window.localStorage.getItem(base)).toBe(`{"owner":"guest"}`);
    }
  });

  it("reports only keys that actually existed", () => {
    window.localStorage.clear();
    window.localStorage.setItem(scopedStorageKey("burg.addresses", UID_A), "[]");

    expect(purgeScopedLocalCaches(UID_A)).toEqual([`burg.addresses::${UID_A}`]);
  });

  it("is a no-op for a missing uid", () => {
    expect(purgeScopedLocalCaches(null)).toEqual([]);
    expect(purgeScopedLocalCaches(undefined)).toEqual([]);
    for (const base of USER_SCOPED_CACHE_KEYS) {
      expect(window.localStorage.getItem(scopedStorageKey(base, UID_A))).not.toBeNull();
    }
  });

  it("does not touch unrelated device keys (device token, consent)", () => {
    window.localStorage.setItem("burg.device_token", "fcm-token");
    window.localStorage.setItem("burg.dpdp_consent_granted", "true");

    purgeScopedLocalCaches(UID_A);

    expect(window.localStorage.getItem("burg.device_token")).toBe("fcm-token");
    expect(window.localStorage.getItem("burg.dpdp_consent_granted")).toBe("true");
  });
});
