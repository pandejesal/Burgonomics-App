import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Auth race / epoch-ownership regressions.
 *
 * Races pinned here, all with a synthetic repository so no Firebase, SMS or
 * account is touched:
 *  - duplicate OTP request / duplicate verify share one in-flight owner
 *  - changePhone, logout and a brand-new request invalidate a still-running
 *    verify (epoch fence) so it can never restore a session or persist tokens
 *  - a failed request drops the store challenge AND cancels the service-side
 *    challenge (stale Firebase ConfirmationResult reuse)
 *  - concurrent bootstrap runs the session probe once
 *  - persistence failure is reported, never thrown or half-authenticated
 */

import { useAuthStore, __setAuthRepositoryForTests } from "../src/features/auth/state/authStore";
import { AuthRepository } from "../src/features/auth/repositories/AuthRepository";
import { secureStorage, SECURE_KEYS } from "../src/core/storage/secureStorage";
import { ok, fail } from "../src/core/network/http";

const PHONE_A = "9825012345";
const PHONE_B = "9876500001";
const USER_A = { id: "uid_synthetic_a", phone: `+91${PHONE_A}`, name: "Synthetic A" };
const USER_B = { id: "uid_synthetic_b", phone: `+91${PHONE_B}`, name: "Synthetic B" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeService() {
  return {
    requestOtp: vi.fn(),
    verifyOtp: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    cancelChallenge: vi.fn(),
    discardConfirmedSession: vi.fn(async () => undefined),
  };
}

let service: ReturnType<typeof makeService>;

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

function challengeFor(phone: string) {
  return {
    otpToken: `+91${phone}`,
    phone,
    requestedAt: Date.now(),
    resendAfterSec: 60,
  };
}

async function storageIsEmpty() {
  const [access, refresh, user] = await Promise.all([
    secureStorage.get(SECURE_KEYS.ACCESS_TOKEN),
    secureStorage.get(SECURE_KEYS.REFRESH_TOKEN),
    secureStorage.get(SECURE_KEYS.USER),
  ]);
  return [access, refresh, user];
}

describe("auth races: in-flight ownership and epoch fencing", () => {
  beforeEach(async () => {
    resetStore();
    service = makeService();
    __setAuthRepositoryForTests(new AuthRepository(service as never));
    await Promise.all([
      secureStorage.remove(SECURE_KEYS.ACCESS_TOKEN),
      secureStorage.remove(SECURE_KEYS.REFRESH_TOKEN),
      secureStorage.remove(SECURE_KEYS.USER),
    ]);
  });

  afterEach(() => {
    __setAuthRepositoryForTests(null);
    vi.restoreAllMocks();
  });

  it("coalesces a duplicate verify into a single service call", async () => {
    useAuthStore.setState({ status: "otp_sent", challenge: challengeFor(PHONE_A) });
    const gate = deferred<ReturnType<typeof ok>>();
    service.verifyOtp.mockReturnValueOnce(gate.promise);

    const first = useAuthStore.getState().verifyOtp("111111");
    const second = useAuthStore.getState().verifyOtp("111111");

    expect(service.verifyOtp).toHaveBeenCalledTimes(1);
    const secondResult = await second;
    expect(secondResult.ok).toBe(false);

    gate.resolve(
      ok({
        accessToken: "access_synthetic",
        refreshToken: "refresh_synthetic",
        user: USER_A,
      }),
    );
    expect((await first).ok).toBe(true);
    expect(useAuthStore.getState().user?.id).toBe(USER_A.id);
  });

  it("does not restore a session when changePhone lands mid-verify", async () => {
    useAuthStore.setState({ status: "otp_sent", challenge: challengeFor(PHONE_A) });
    const gate = deferred<ReturnType<typeof ok>>();
    service.verifyOtp.mockReturnValueOnce(gate.promise);

    const pending = useAuthStore.getState().verifyOtp("222222");
    useAuthStore.getState().changePhone();
    gate.resolve(
      ok({ accessToken: "access_synthetic", refreshToken: "refresh_synthetic", user: USER_A }),
    );

    const result = await pending;
    const state = useAuthStore.getState();
    expect(result.ok).toBe(false);
    expect(state.status).not.toBe("authenticated");
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(await storageIsEmpty()).toEqual([null, null, null]);
  });

  it("does not restore a session when logout lands mid-verify", async () => {
    useAuthStore.setState({ status: "otp_sent", challenge: challengeFor(PHONE_A) });
    const gate = deferred<ReturnType<typeof ok>>();
    service.verifyOtp.mockReturnValueOnce(gate.promise);
    service.logout.mockResolvedValue(ok(null));

    const pending = useAuthStore.getState().verifyOtp("333333");
    await useAuthStore.getState().logout();
    gate.resolve(
      ok({ accessToken: "access_synthetic", refreshToken: "refresh_synthetic", user: USER_A }),
    );

    expect((await pending).ok).toBe(false);
    expect(useAuthStore.getState().status).toBe("guest");
    expect(useAuthStore.getState().user).toBeNull();
    expect(await storageIsEmpty()).toEqual([null, null, null]);
  });

  it("fences an earlier verify once a new OTP request starts for another number", async () => {
    useAuthStore.setState({ status: "otp_sent", challenge: challengeFor(PHONE_A) });
    const gate = deferred<ReturnType<typeof ok>>();
    service.verifyOtp.mockReturnValueOnce(gate.promise);
    service.requestOtp.mockResolvedValueOnce(
      ok({
        otpToken: `+91${PHONE_B}`,
        expiresInSec: 300,
        resendAfterSec: 60,
        deliveryMethod: "sms" as const,
      }),
    );

    const pending = useAuthStore.getState().verifyOtp("444444");
    const secondRequest = await useAuthStore.getState().requestOtp(PHONE_B);
    expect(secondRequest.ok).toBe(true);

    gate.resolve(
      ok({ accessToken: "access_synthetic_a", refreshToken: "refresh_synthetic_a", user: USER_A }),
    );

    expect((await pending).ok).toBe(false);
    const state = useAuthStore.getState();
    expect(state.user?.id).not.toBe(USER_A.id);
    expect(state.status).toBe("otp_sent");
    expect(await storageIsEmpty()).toEqual([null, null, null]);
  });

  it("clears the store challenge and cancels the service challenge on a failed request", async () => {
    useAuthStore.setState({ status: "otp_sent", challenge: challengeFor(PHONE_A) });
    service.requestOtp.mockResolvedValueOnce(fail("auth/too-many-requests", "Too many attempts."));

    const result = await useAuthStore.getState().requestOtp(PHONE_B);

    expect(result.ok).toBe(false);
    expect(useAuthStore.getState().challenge).toBeNull();
    expect(useAuthStore.getState().status).toBe("error");
    expect(service.cancelChallenge).toHaveBeenCalledTimes(1);
  });

  it("issues one network request for a duplicate requestOtp on the same phone", async () => {
    const gate = deferred<ReturnType<typeof ok>>();
    service.requestOtp.mockReturnValueOnce(gate.promise);

    const first = useAuthStore.getState().requestOtp(PHONE_A);
    const second = useAuthStore.getState().requestOtp(PHONE_A);

    expect(service.requestOtp).toHaveBeenCalledTimes(1);

    gate.resolve(
      ok({
        otpToken: `+91${PHONE_A}`,
        expiresInSec: 300,
        resendAfterSec: 60,
        deliveryMethod: "sms" as const,
      }),
    );
    const [a, b] = await Promise.all([first, second]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(useAuthStore.getState().status).toBe("otp_sent");
  });

  it("cancels the service challenge when the number is changed", () => {
    useAuthStore.setState({ status: "otp_sent", challenge: challengeFor(PHONE_A) });
    useAuthStore.getState().changePhone();
    expect(service.cancelChallenge).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().challenge).toBeNull();
  });

  it("cancels the service challenge on logout", async () => {
    useAuthStore.setState({
      status: "authenticated",
      user: USER_B,
      accessToken: "access_b",
      refreshToken: "refresh_b",
    });
    service.logout.mockResolvedValue(ok(null));

    await useAuthStore.getState().logout();
    expect(service.cancelChallenge).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().challenge).toBeNull();
  });

  it("runs one session probe for concurrent bootstrap calls", async () => {
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = btoa(
      JSON.stringify({
        sub: USER_A.id,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    );
    await Promise.all([
      secureStorage.set(SECURE_KEYS.ACCESS_TOKEN, `${header}.${payload}.sig`),
      secureStorage.set(SECURE_KEYS.REFRESH_TOKEN, "refresh_synthetic"),
      secureStorage.set(SECURE_KEYS.USER, JSON.stringify(USER_A)),
    ]);

    // Whichever branch runs (fresh token or silent refresh), the session must
    // resolve authenticated so the assertion is about probe ownership only.
    service.refresh.mockResolvedValue(
      ok({ accessToken: "access_refreshed", refreshToken: "refresh_refreshed" }),
    );

    const gate = deferred<string | null>();
    const probe = vi.fn(() => gate.promise);

    const first = useAuthStore.getState().bootstrap(probe);
    const second = useAuthStore.getState().bootstrap(probe);

    // The probe is reached after the storage reads, so wait for the shared run
    // to arrive there instead of asserting on the same tick as the calls.
    await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(1));
    gate.resolve(USER_A.id);
    await Promise.all([first, second]);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().status).toBe("authenticated");
  });

  it("reports a persistence failure instead of half-authenticating or throwing", async () => {
    useAuthStore.setState({ status: "otp_sent", challenge: challengeFor(PHONE_A) });
    service.verifyOtp.mockResolvedValueOnce(
      ok({
        accessToken: "access_synthetic",
        refreshToken: "refresh_synthetic",
        user: USER_A,
        sessionRef: { uid: USER_A.id, refreshToken: "refresh_synthetic" },
      }),
    );
    const setSpy = vi.spyOn(secureStorage, "set").mockRejectedValue(new Error("quota exceeded"));

    const result = await useAuthStore.getState().verifyOtp("555555");

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/could not save your session/i);
    const state = useAuthStore.getState();
    expect(state.status).not.toBe("authenticated");
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(setSpy).toHaveBeenCalled();
    // The SDK session confirm() created must not outlive a failed device write.
    expect(service.discardConfirmedSession).toHaveBeenCalledTimes(1);
    expect(service.discardConfirmedSession).toHaveBeenCalledWith({
      uid: USER_A.id,
      refreshToken: "refresh_synthetic",
    });
  });
});

describe("auth races: cancelled confirm cannot leave an adoptable session", () => {
  beforeEach(async () => {
    resetStore();
    service = makeService();
    __setAuthRepositoryForTests(new AuthRepository(service as never));
    await Promise.all([
      secureStorage.remove(SECURE_KEYS.ACCESS_TOKEN),
      secureStorage.remove(SECURE_KEYS.REFRESH_TOKEN),
      secureStorage.remove(SECURE_KEYS.USER),
    ]);
  });

  afterEach(() => {
    __setAuthRepositoryForTests(null);
    vi.restoreAllMocks();
  });

  const verifyPayload = (user: typeof USER_A, tag: string) =>
    ok({
      accessToken: `access_${tag}`,
      refreshToken: `refresh_${tag}`,
      user,
      sessionRef: { uid: user.id, refreshToken: `refresh_${tag}` },
    });

  it("ignores a delayed request that was cancelled, and a new request still proceeds", async () => {
    const staleGate = deferred<ReturnType<typeof ok>>();
    service.requestOtp.mockReturnValueOnce(staleGate.promise);

    const staleRequest = useAuthStore.getState().requestOtp(PHONE_A);
    useAuthStore.getState().changePhone();

    service.requestOtp.mockResolvedValueOnce(
      ok({
        otpToken: `+91${PHONE_B}`,
        expiresInSec: 300,
        resendAfterSec: 60,
        deliveryMethod: "sms" as const,
      }),
    );
    const fresh = await useAuthStore.getState().requestOtp(PHONE_B);
    expect(fresh.ok).toBe(true);

    staleGate.resolve(
      ok({
        otpToken: `+91${PHONE_A}`,
        expiresInSec: 300,
        resendAfterSec: 60,
        deliveryMethod: "sms" as const,
      }),
    );
    const stale = await staleRequest;

    expect(stale.ok).toBe(false);
    expect(useAuthStore.getState().challenge?.phone).toBe(PHONE_B);
  });

  it("does not adopt a session when logout lands during the storage write", async () => {
    useAuthStore.setState({ status: "otp_sent", challenge: challengeFor(PHONE_A) });
    service.verifyOtp.mockResolvedValueOnce(verifyPayload(USER_A, "a"));
    service.logout.mockResolvedValue(ok(null));

    const writeGate = deferred<void>();
    const originalSet = secureStorage.set.bind(secureStorage);
    vi.spyOn(secureStorage, "set").mockImplementation(async (key: string, value: string) => {
      if (key === SECURE_KEYS.ACCESS_TOKEN) await writeGate.promise;
      await originalSet(key, value);
    });

    const pending = useAuthStore.getState().verifyOtp("666666");
    await vi.waitFor(() => expect(service.verifyOtp).toHaveBeenCalledTimes(1));

    // Storage writes are serialized, so logout's clear queues behind the
    // blocked write. Start it, release the write, then await both.
    const loggingOut = useAuthStore.getState().logout();
    writeGate.resolve();
    await loggingOut;

    const result = await pending;

    expect(result.ok).toBe(false);
    const state = useAuthStore.getState();
    expect(state.status).toBe("guest");
    expect(state.user).toBeNull();
    // The tokens this attempt wrote are released; logout's clear is not undone.
    expect(await storageIsEmpty()).toEqual([null, null, null]);
  });

  it("keeps logout authoritative when bootstrap is still probing", async () => {
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = btoa(
      JSON.stringify({
        sub: USER_A.id,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    );
    await Promise.all([
      secureStorage.set(SECURE_KEYS.ACCESS_TOKEN, `${header}.${payload}.sig`),
      secureStorage.set(SECURE_KEYS.REFRESH_TOKEN, "refresh_synthetic"),
      secureStorage.set(SECURE_KEYS.USER, JSON.stringify(USER_A)),
    ]);
    service.logout.mockResolvedValue(ok(null));

    const probeGate = deferred<string | null>();
    const booting = useAuthStore.getState().bootstrap(() => probeGate.promise);
    await vi.waitFor(() => expect(useAuthStore.getState().status).toBe("idle"));

    await useAuthStore.getState().logout();
    probeGate.resolve(USER_A.id);
    await booting;

    const state = useAuthStore.getState();
    expect(state.status).toBe("guest");
    expect(state.user).toBeNull();
    expect(state.isBootstrapped).toBe(true);
    expect(await storageIsEmpty()).toEqual([null, null, null]);
  });

  it("discards the exact cancelled session, then bootstrap stays guest", async () => {
    useAuthStore.setState({ status: "otp_sent", challenge: challengeFor(PHONE_A) });
    const gate = deferred<ReturnType<typeof ok>>();
    service.verifyOtp.mockReturnValueOnce(gate.promise);
    service.logout.mockResolvedValue(ok(null));

    const pending = useAuthStore.getState().verifyOtp("777777");
    await useAuthStore.getState().logout();
    gate.resolve(verifyPayload(USER_A, "a"));
    const result = await pending;

    expect(result.ok).toBe(false);
    expect(service.discardConfirmedSession).toHaveBeenCalledTimes(1);
    expect(service.discardConfirmedSession).toHaveBeenCalledWith({
      uid: USER_A.id,
      refreshToken: "refresh_a",
    });
    expect(useAuthStore.getState().status).toBe("guest");

    const probe = vi.fn(async () => USER_A.id);
    await useAuthStore.getState().bootstrap(probe);
    expect(useAuthStore.getState().status).toBe("guest");
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("never discards a session when a newer verify already claimed that identity", async () => {
    useAuthStore.setState({ status: "otp_sent", challenge: challengeFor(PHONE_A) });
    const firstGate = deferred<ReturnType<typeof ok>>();
    service.verifyOtp.mockReturnValueOnce(firstGate.promise);
    service.verifyOtp.mockResolvedValueOnce(verifyPayload(USER_A, "second"));

    const staleVerify = useAuthStore.getState().verifyOtp("888888");
    // A newer operation claims USER_A while the first confirm is still open.
    useAuthStore.setState({ user: USER_A, status: "authenticated" });
    firstGate.resolve(verifyPayload(USER_A, "first"));
    await staleVerify;

    expect(service.discardConfirmedSession).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user?.id).toBe(USER_A.id);
  });

  it("never discards another user's session", async () => {
    useAuthStore.setState({
      status: "authenticated",
      user: USER_B,
      accessToken: "access_b",
      refreshToken: "refresh_b",
    });
    useAuthStore.setState({ challenge: challengeFor(PHONE_A) });

    const gate = deferred<ReturnType<typeof ok>>();
    service.verifyOtp.mockReturnValueOnce(gate.promise);
    service.logout.mockResolvedValue(ok(null));

    const pending = useAuthStore.getState().verifyOtp("999999");
    useAuthStore.getState().changePhone();
    gate.resolve(verifyPayload(USER_A, "a"));
    await pending;

    expect(service.discardConfirmedSession).toHaveBeenCalledTimes(1);
    const [ref] = service.discardConfirmedSession.mock.calls[0] as [{ uid: string }];
    expect(ref.uid).toBe(USER_A.id);
    expect(ref.uid).not.toBe(USER_B.id);
    // No logout of the unrelated identity was attempted.
    expect(service.logout).not.toHaveBeenCalled();
  });
});
describe("auth races: abandoned work must not block or delete another session", () => {
  beforeEach(async () => {
    resetStore();
    service = makeService();
    __setAuthRepositoryForTests(new AuthRepository(service as never));
    await Promise.all([
      secureStorage.remove(SECURE_KEYS.ACCESS_TOKEN),
      secureStorage.remove(SECURE_KEYS.REFRESH_TOKEN),
      secureStorage.remove(SECURE_KEYS.USER),
    ]);
  });

  afterEach(() => {
    __setAuthRepositoryForTests(null);
    vi.restoreAllMocks();
  });

  it("lets a new code verify while an abandoned verify is still hung", async () => {
    useAuthStore.setState({ status: "otp_sent", challenge: challengeFor(PHONE_A) });
    const hung = deferred<ReturnType<typeof ok>>();
    service.verifyOtp.mockReturnValueOnce(hung.promise);
    service.requestOtp.mockResolvedValueOnce(
      ok({
        otpToken: `+91${PHONE_B}`,
        expiresInSec: 300,
        resendAfterSec: 60,
        deliveryMethod: "sms" as const,
      }),
    );
    service.verifyOtp.mockResolvedValueOnce(
      ok({
        accessToken: "access_b",
        refreshToken: "refresh_b",
        user: USER_B,
        sessionRef: { uid: USER_B.id, refreshToken: "refresh_b" },
      }),
    );

    const abandoned = useAuthStore.getState().verifyOtp("111111");
    useAuthStore.getState().changePhone();
    await useAuthStore.getState().requestOtp(PHONE_B);

    // Ownership was released on changePhone, so the new code is not blocked.
    const fresh = await useAuthStore.getState().verifyOtp("222222");
    expect(fresh.ok).toBe(true);
    expect(useAuthStore.getState().user?.id).toBe(USER_B.id);

    // The abandoned verify resolving later owns nothing.
    hung.resolve(
      ok({
        accessToken: "access_a",
        refreshToken: "refresh_a",
        user: USER_A,
        sessionRef: { uid: USER_A.id, refreshToken: "refresh_a" },
      }),
    );
    expect((await abandoned).ok).toBe(false);
    expect(useAuthStore.getState().user?.id).toBe(USER_B.id);
    expect(await secureStorage.get(SECURE_KEYS.ACCESS_TOKEN)).toBe("access_b");
  });

  it("never clears tokens it does not own while releasing a fenced attempt", async () => {
    useAuthStore.setState({ status: "otp_sent", challenge: challengeFor(PHONE_A) });
    const gate = deferred<ReturnType<typeof ok>>();
    service.verifyOtp.mockReturnValueOnce(gate.promise);

    const pending = useAuthStore.getState().verifyOtp("333333");
    useAuthStore.getState().changePhone();

    // Another session now owns storage by the time cleanup runs.
    const originalGet = secureStorage.get.bind(secureStorage);
    vi.spyOn(secureStorage, "get").mockImplementation(async (key: string) =>
      key === SECURE_KEYS.ACCESS_TOKEN ? "access_b" : originalGet(key),
    );
    const removeSpy = vi.spyOn(secureStorage, "remove");

    gate.resolve(
      ok({
        accessToken: "access_a",
        refreshToken: "refresh_a",
        user: USER_A,
        sessionRef: { uid: USER_A.id, refreshToken: "refresh_a" },
      }),
    );
    await pending;

    expect(removeSpy).not.toHaveBeenCalled();
    expect(service.discardConfirmedSession).toHaveBeenCalledWith({
      uid: USER_A.id,
      refreshToken: "refresh_a",
    });
  });
});
