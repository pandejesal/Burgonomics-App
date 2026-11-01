/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * F4 (P2 privacy) — on NATIVE, secureStorage must fail CLOSED for credential
 * keys when the Keychain/Keystore write fails. Pre-fix it fell through to
 * `window.localStorage`, silently downgrading an auth token into plaintext in
 * the WebView store. Non-sensitive keys keep the fallback (a theme preference
 * must not be lost to a keystore hiccup).
 */
const { mockNativeSet } = vi.hoisted(() => ({ mockNativeSet: vi.fn() }));

vi.mock("@aparajita/capacitor-secure-storage", () => ({
  SecureStorage: {
    get: vi.fn(async () => null),
    set: mockNativeSet,
    remove: vi.fn(async () => undefined),
  },
}));

const NATIVE = () => ({ isNativePlatform: () => true });

async function freshStorage() {
  vi.resetModules();
  return import("../src/core/storage/secureStorage");
}

describe("secureStorage native fail-closed behaviour (F4)", () => {
  beforeEach(() => {
    mockNativeSet.mockReset();
    window.localStorage.clear();
    (window as any).Capacitor = NATIVE();
  });

  afterEach(() => {
    delete (window as any).Capacitor;
    vi.resetModules();
  });

  it("does NOT persist an access token to localStorage when the keystore rejects", async () => {
    mockNativeSet.mockRejectedValue(new Error("keystore unavailable"));
    const { secureStorage, SECURE_KEYS } = await freshStorage();

    await secureStorage.set(SECURE_KEYS.ACCESS_TOKEN, "super-secret-token");

    expect(window.localStorage.getItem("burg.secure.auth.accessToken")).toBeNull();
    expect(await secureStorage.get(SECURE_KEYS.ACCESS_TOKEN)).toBeNull();
  });

  it("fails closed for the refresh token too", async () => {
    mockNativeSet.mockRejectedValue(new Error("keystore unavailable"));
    const { secureStorage, SECURE_KEYS } = await freshStorage();

    await secureStorage.set(SECURE_KEYS.REFRESH_TOKEN, "refresh-secret");

    expect(window.localStorage.getItem("burg.secure.auth.refreshToken")).toBeNull();
  });

  it("scrubs a previously-planted plaintext copy when the keystore write fails", async () => {
    window.localStorage.setItem("burg.secure.auth.accessToken", "stale-plaintext");
    mockNativeSet.mockRejectedValue(new Error("keystore unavailable"));
    const { secureStorage, SECURE_KEYS } = await freshStorage();

    await secureStorage.set(SECURE_KEYS.ACCESS_TOKEN, "new-token");

    expect(window.localStorage.getItem("burg.secure.auth.accessToken")).toBeNull();
  });

  it("lets non-sensitive keys use the localStorage fallback", async () => {
    mockNativeSet.mockRejectedValue(new Error("keystore unavailable"));
    const { secureStorage } = await freshStorage();

    await secureStorage.set("pref.theme", "dark");

    expect(window.localStorage.getItem("burg.secure.pref.theme")).toBe("dark");
    expect(await secureStorage.get("pref.theme")).toBe("dark");
  });

  it("keeps the web path unchanged (plaintext localStorage, no keystore)", async () => {
    (window as any).Capacitor = { isNativePlatform: () => false };
    const { secureStorage, SECURE_KEYS } = await freshStorage();

    await secureStorage.set(SECURE_KEYS.ACCESS_TOKEN, "web-token");

    expect(window.localStorage.getItem("burg.secure.auth.accessToken")).toBe("web-token");
    expect(mockNativeSet).not.toHaveBeenCalled();
  });

  it("persists via the keystore and leaves localStorage untouched on success", async () => {
    mockNativeSet.mockResolvedValue(undefined);
    const { secureStorage, SECURE_KEYS } = await freshStorage();

    await secureStorage.set(SECURE_KEYS.ACCESS_TOKEN, "native-token");

    expect(mockNativeSet).toHaveBeenCalledWith("burg.secure.auth.accessToken", "native-token");
    expect(window.localStorage.getItem("burg.secure.auth.accessToken")).toBeNull();
  });
});
