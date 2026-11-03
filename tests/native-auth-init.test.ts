import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * iOS launch smoke (real staging) sat on the loading spinner forever: getAuth()
 * installs the browser popup/redirect resolver, Auth's start-up then waits on
 * an authDomain iframe that never answers inside WKWebView (capacitor://), so
 * onAuthStateChanged never fired. Native shells must initialise Auth without
 * that resolver; the web keeps getAuth().
 */
const sdk = vi.hoisted(() => ({
  native: false,
  getAuth: vi.fn(() => ({ via: "getAuth" })),
  initializeAuth: vi.fn((_app: unknown, _deps: unknown) => ({ via: "initializeAuth" })),
}));

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => sdk.native } }));
vi.mock("firebase/auth", () => ({
  getAuth: sdk.getAuth,
  initializeAuth: sdk.initializeAuth,
  indexedDBLocalPersistence: "indexedDB",
  browserLocalPersistence: "local",
  browserSessionPersistence: "session",
}));

const ENV = {
  VITE_FIREBASE_API_KEY: "test-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "test.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "test-project",
  VITE_FIREBASE_STORAGE_BUCKET: "test.appspot.com",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "1234567890",
  VITE_FIREBASE_APP_ID: "1:1234567890:web:test",
};

async function loadConfig(native: boolean) {
  vi.resetModules();
  sdk.native = native;
  sdk.getAuth.mockClear();
  sdk.initializeAuth.mockClear();
  for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);
  return import("../src/core/config/firebase");
}

afterEach(() => vi.unstubAllEnvs());

describe("Firebase Auth initialisation per platform", () => {
  it("native shells skip the popup/redirect resolver and keep getAuth's persistence order", async () => {
    const { auth } = await loadConfig(true);
    expect(sdk.getAuth).not.toHaveBeenCalled();
    expect(sdk.initializeAuth).toHaveBeenCalledTimes(1);
    const deps = sdk.initializeAuth.mock.calls[0][1] as Record<string, unknown>;
    expect(deps.popupRedirectResolver).toBeUndefined();
    expect(deps.persistence).toEqual(["indexedDB", "local", "session"]);
    expect(auth).toEqual({ via: "initializeAuth" });
  });

  it("the web build keeps getAuth()", async () => {
    const { auth } = await loadConfig(false);
    expect(sdk.initializeAuth).not.toHaveBeenCalled();
    expect(sdk.getAuth).toHaveBeenCalledTimes(1);
    expect(auth).toEqual({ via: "getAuth" });
  });
});
