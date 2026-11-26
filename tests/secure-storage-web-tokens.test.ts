/** @vitest-environment jsdom */
/**
 * A3-c11 item 2 (High): the Customer WEB build persisted a live Firebase
 * refresh token in plaintext `localStorage`. Any script on the origin could read
 * it and exchange it off-app for fresh ID tokens — durable account takeover,
 * because the app's own bootstrap guard does not invalidate the token.
 *
 * The fix keeps web credential-class values in memory for the tab only and
 * rebuilds the session from the LIVE Firebase user (Firebase Auth's own
 * persistence), with a one-time scrub of any legacy plaintext copy.
 *
 * Native (Keychain/Keystore) behaviour must be unchanged.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const NATIVE = () => ({ isNativePlatform: () => true, getPlatform: () => "android" });
const WEB = () => ({ isNativePlatform: () => false, getPlatform: () => "web" });

const { mockNativeSet } = vi.hoisted(() => ({ mockNativeSet: vi.fn() }));

vi.mock("@aparajita/capacitor-secure-storage", () => ({
  SecureStorage: {
    get: vi.fn(async () => null),
    set: mockNativeSet,
    remove: vi.fn(async () => undefined),
  },
}));

async function freshStorage() {
  vi.resetModules();
  return import("../src/core/storage/secureStorage");
}

describe("web token persistence (A3-c11 item 2)", () => {
  beforeEach(() => {
    mockNativeSet.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    delete (window as any).Capacitor;
    vi.resetModules();
  });

  it("never writes an ACCESS token to plaintext localStorage on web", async () => {
    (window as any).Capacitor = WEB();
    const { secureStorage, SECURE_KEYS } = await freshStorage();

    await secureStorage.set(SECURE_KEYS.ACCESS_TOKEN, "web-access-token");

    expect(window.localStorage.getItem("burg.secure.auth.accessToken")).toBeNull();
    // The live tab still works: the value is readable for this session.
    expect(await secureStorage.get(SECURE_KEYS.ACCESS_TOKEN)).toBe("web-access-token");
  });

  it("never writes the REFRESH token to plaintext localStorage on web", async () => {
    (window as any).Capacitor = WEB();
    const { secureStorage, SECURE_KEYS } = await freshStorage();

    await secureStorage.set(SECURE_KEYS.REFRESH_TOKEN, "web-refresh-token");

    expect(window.localStorage.getItem("burg.secure.auth.refreshToken")).toBeNull();
    const dump = JSON.stringify(Object.entries(window.localStorage));
    expect(dump).not.toContain("web-refresh-token");
  });

  it("does not read a legacy plaintext token back into the app", async () => {
    (window as any).Capacitor = WEB();
    window.localStorage.setItem("burg.secure.auth.accessToken", "legacy-plaintext");
    const { secureStorage, SECURE_KEYS } = await freshStorage();

    expect(await secureStorage.get(SECURE_KEYS.ACCESS_TOKEN)).toBeNull();
  });

  it("still persists non-credential values on web", async () => {
    (window as any).Capacitor = WEB();
    const { secureStorage } = await freshStorage();

    await secureStorage.set("pref.theme", "dark");

    expect(window.localStorage.getItem("burg.secure.pref.theme")).toBe("dark");
  });

  it("keeps the NATIVE keystore path unchanged", async () => {
    (window as any).Capacitor = NATIVE();
    mockNativeSet.mockResolvedValue(undefined);
    const { secureStorage, SECURE_KEYS } = await freshStorage();

    await secureStorage.set(SECURE_KEYS.ACCESS_TOKEN, "native-token");

    expect(mockNativeSet).toHaveBeenCalledWith("burg.secure.auth.accessToken", "native-token");
    expect(window.localStorage.getItem("burg.secure.auth.accessToken")).toBeNull();
  });
});
