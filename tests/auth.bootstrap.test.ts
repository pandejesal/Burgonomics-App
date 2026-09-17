import { describe, it, expect, beforeEach } from "vitest";

// Pins bootstrap()'s security invariant against the REAL authStore: stored
// tokens restore a session ONLY with a live Firebase session for the same
// uid. Previous tests setState({status:"authenticated"}) directly, so a
// regression trusting stolen localStorage stayed green.
//
// The Firebase session is injected as a probe: module-mock interception of
// @/core/config/firebase proved importer-dependent in this repo (the test
// file saw the mock while src/ saw the real module), so injection — not
// mocking — is the load-bearing seam.

import { useAuthStore } from "../src/features/auth/state/authStore";
import { secureStorage, SECURE_KEYS } from "../src/core/storage/secureStorage";

const USER = { id: "uid_aaa", phone: "+919825012345", name: "Aarav" };

/**
 * Generates a simple JWT-like token for testing purposes.
 * This is a test-only utility that creates a JWT-like string without
 * cryptographic signing (for testing purposes only).
 */
function generateMockJwt(userId: string, phone: string): { accessToken: string; refreshToken: string } {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({
    sub: userId,
    phone,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  }));
  const signature = btoa("test-signature");
  const accessToken = `${header}.${payload}.${signature}`;
  const refreshToken = `refresh_${btoa(JSON.stringify({ sub: userId, iat: Date.now() }))}`;
  return { accessToken, refreshToken };
}

async function seedSession(accessToken: string, refreshToken = "refresh_opaque") {
  await secureStorage.set(SECURE_KEYS.ACCESS_TOKEN, accessToken);
  await secureStorage.set(SECURE_KEYS.REFRESH_TOKEN, refreshToken);
  await secureStorage.set(SECURE_KEYS.USER, JSON.stringify(USER));
}

function resetStore() {
  useAuthStore.setState({
    status: "idle",
    user: null,
    accessToken: null,
    refreshToken: null,
    challenge: null,
    isBootstrapped: false,
    error: null,
  });
}

describe("authStore.bootstrap Firebase trust gate (real store)", () => {
  beforeEach(async () => {
    resetStore();
    await secureStorage.remove(SECURE_KEYS.ACCESS_TOKEN);
    await secureStorage.remove(SECURE_KEYS.REFRESH_TOKEN);
    await secureStorage.remove(SECURE_KEYS.USER);
  });

  it("boots to guest when nothing is stored", async () => {
    await useAuthStore.getState().bootstrap(async () => USER.id);
    expect(useAuthStore.getState().status).toBe("guest");
  });

  it("rejects stored tokens with no live Firebase session (stolen localStorage)", async () => {
    const { accessToken } = generateMockJwt(USER.id, USER.phone);
    await seedSession(accessToken);

    await useAuthStore.getState().bootstrap(async () => null);
    const s = useAuthStore.getState();
    expect(s.status).toBe("guest");
    expect(s.accessToken).toBeNull();
    // Poisoned tokens are wiped, not kept for the next attempt.
    expect(await secureStorage.get(SECURE_KEYS.ACCESS_TOKEN)).toBeNull();
  });

  it("rejects corrupt persisted sessions (valid JSON, wrong shape)", async () => {
    await secureStorage.set(SECURE_KEYS.ACCESS_TOKEN, "tok");
    await secureStorage.set(SECURE_KEYS.REFRESH_TOKEN, "ref");
    await secureStorage.set(SECURE_KEYS.USER, JSON.stringify("corrupt"));

    await useAuthStore.getState().bootstrap(async () => USER.id);
    const s = useAuthStore.getState();
    expect(s.status).toBe("guest");
    expect(await secureStorage.get(SECURE_KEYS.USER)).toBeNull();
  });

  it("rejects stored tokens when the Firebase uid does not match", async () => {
    const { accessToken } = generateMockJwt(USER.id, USER.phone);
    await seedSession(accessToken);

    await useAuthStore.getState().bootstrap(async () => "uid_intruder");
    expect(useAuthStore.getState().status).toBe("guest");
  });

  it("restores the session when the Firebase uid matches", async () => {
    const { accessToken, refreshToken } = generateMockJwt(USER.id, USER.phone);
    await seedSession(accessToken, refreshToken);

    await useAuthStore.getState().bootstrap(async () => USER.id);
    const s = useAuthStore.getState();
    expect(s.status).toBe("authenticated");
    expect(s.user?.id).toBe(USER.id);
  });
});