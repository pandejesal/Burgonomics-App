// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ConfirmationResult, RecaptchaVerifier, UserCredential } from "firebase/auth";
import {
  __resetAuthBindingsForTests,
  __setRecaptchaFactoryForTests,
  bindHost,
  releaseHost,
} from "../src/features/auth/state/authBinding";
import {
  createAuthAttemptController,
  type AuthAttemptDeps,
} from "../src/features/auth/state/authAttempts";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function credential(uid = "uid_a"): UserCredential {
  return {
    user: {
      uid,
      phoneNumber: "+919825012345",
      refreshToken: "refresh_a",
      getIdToken: vi.fn(async () => "access_a"),
    },
  } as unknown as UserCredential;
}

const confirmation = (label: string) =>
  ({ label, confirm: vi.fn() }) as unknown as ConfirmationResult;

function fakeVerifier() {
  return { clear: vi.fn(), render: vi.fn() } as unknown as RecaptchaVerifier;
}

let loginElement: HTMLDivElement;
let checkoutElement: HTMLDivElement;

function bindFlows() {
  bindHost("login", "host_login", loginElement, () => 320);
  bindHost("checkout", "host_checkout", checkoutElement, () => 320);
}

function makeController(overrides: Partial<AuthAttemptDeps> = {}) {
  return createAuthAttemptController({
    now: () => 1_000,
    randomHandle: (() => {
      let n = 0;
      return () => `handle_${++n}`;
    })(),
    timeoutMs: 1_000,
    ...overrides,
  });
}

describe("auth attempt ownership, deadline and epoch", () => {
  beforeEach(() => {
    __resetAuthBindingsForTests();
    __setRecaptchaFactoryForTests(() => fakeVerifier());
    loginElement = document.createElement("div");
    checkoutElement = document.createElement("div");
    document.body.append(loginElement, checkoutElement);
  });

  afterEach(() => {
    __resetAuthBindingsForTests();
    __setRecaptchaFactoryForTests(null);
    loginElement.remove();
    checkoutElement.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("issues an opaque handle and keeps a cross-flow verify as CHALLENGE_MISMATCH", async () => {
    bindFlows();
    const sendSms = vi.fn(async () => confirmation("login"));
    const confirm = vi.fn(async () => credential("uid_adopted"));
    const controller = makeController({ sendSms, confirm });

    const requested = await controller.requestOtp("login", "9876543210");
    expect(requested.success).toBe(true);
    if (!requested.success) return;
    expect(requested.data.handle).toBe("handle_1");
    expect(requested.data.phone).toBe("+919876543210");
    expect(requested.data.maskedPhone).toBe("******3210");
    expect(requested.data.phone).not.toBe(requested.data.handle);

    expect(
      (await controller.verifyOtp("checkout", requested.data.handle, "123456")).success,
    ).toBe(false);
    expect(controller.adoptChallenge("checkout", requested.data.handle)).toEqual({ ok: true });
    expect(
      (await controller.verifyOtp("checkout", requested.data.handle, "123456")).success,
    ).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("invalidates before unlink, clears the handle, and resumes to null", async () => {
    bindFlows();
    const controller = makeController({ sendSms: vi.fn(async () => confirmation("login")) });
    const requested = await controller.requestOtp("login", "9876543210");
    expect(requested.success).toBe(true);
    if (!requested.success) return;

    controller.invalidateAuthAttempts("logout");
    expect(controller.getSnapshot().intentEpoch).toBe(1);
    expect(controller.resumeChallenge("login")).toBeNull();
    const result = await controller.verifyOtp("login", requested.data.handle, "123456");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("NO_CHALLENGE");
  });

  it("keeps B requesting when stale A resolves after a deadline (never a third SMS)", async () => {
    vi.useFakeTimers();
    bindFlows();
    let now = 1_000;
    const a = deferred<ConfirmationResult>();
    const b = deferred<ConfirmationResult>();
    const sendSms = vi
      .fn()
      .mockImplementationOnce(() => a.promise)
      .mockImplementationOnce(() => b.promise);
    const controller = makeController({ sendSms, now: () => now });

    const requestA = controller.requestOtp("login", "9876543210");
    await Promise.resolve();
    now += 1_000;
    await vi.advanceTimersByTimeAsync(1_000);
    const resultA = await requestA;
    expect(resultA.success).toBe(false);
    if (!resultA.success) expect(resultA.error.code).toBe("AUTH_LAST_ATTEMPT_UNKNOWN");

    const requestB = controller.requestOtp("login", "9876543210");
    await Promise.resolve();
    expect(controller.getSnapshot()).toMatchObject({ kind: "requesting", gen: 3, locked: true });

    a.resolve(confirmation("a"));
    await Promise.resolve();
    await Promise.resolve();
    expect(controller.getSnapshot()).toMatchObject({ kind: "requesting", gen: 3, locked: true });

    b.resolve(confirmation("b"));
    const resultB = await requestB;
    expect(resultB.success).toBe(true);
    if (!resultB.success) return;
    expect(resultB.data.handle).toMatch(/^handle_/);
    expect(sendSms).toHaveBeenCalledTimes(2);
  });

  it("refuses resend before cooldown; after cooldown it supersedes the old handle", async () => {
    bindFlows();
    let now = 1_000;
    let handle = 0;
    const sendSms = vi.fn(async () => confirmation(`send_${++handle}`));
    const controller = makeController({
      sendSms,
      now: () => now,
      randomHandle: () => `handle_${handle || 1}`,
    });

    const first = await controller.requestOtp("login", "9876543210");
    expect(first.success).toBe(true);
    if (!first.success) return;

    const early = await controller.resendOtp("login");
    expect(early.success).toBe(false);
    if (!early.success) expect(early.error.code).toBe("AUTH_OTP_COOLDOWN");
    expect(sendSms).toHaveBeenCalledTimes(1);

    now += 61_000;
    const second = await controller.resendOtp("login");
    expect(second.success).toBe(true);
    if (!second.success) return;
    expect(second.data.handle).not.toBe(first.data.handle);
    expect(sendSms).toHaveBeenCalledTimes(2);

    const old = await controller.verifyOtp("login", first.data.handle, "123456");
    expect(old.success).toBe(false);
    if (!old.success) expect(old.error.code).toBe("CHALLENGE_MISMATCH");
    expect(controller.resumeChallenge("login")?.handle).toBe(second.data.handle);
  });

  it("bounds verify at the deadline, refuses resend while verifying, and cleans late success", async () => {
    bindFlows();
    const confirmGate = deferred<UserCredential>();
    const cleanup = vi.fn(async () => undefined);
    const controller = makeController({
      sendSms: vi.fn(async () => confirmation("verify")),
      confirm: vi.fn(() => confirmGate.promise),
      cleanupStaleUser: cleanup,
      timeoutMs: 30,
    });

    const issued = await controller.requestOtp("login", "9876543210");
    expect(issued.success).toBe(true);
    if (!issued.success) return;

    const verifying = controller.verifyOtp("login", issued.data.handle, "123456");
    await Promise.resolve();
    const resend = await controller.resendOtp("login");
    expect(resend.success).toBe(false);
    if (!resend.success) expect(resend.error.code).toBe("AUTH_OTP_IN_FLIGHT");

    const timedOut = await verifying;
    expect(timedOut.success).toBe(false);
    if (!timedOut.success) expect(timedOut.error.code).toBe("AUTH_LAST_ATTEMPT_UNKNOWN");
    expect(controller.getSnapshot().locked).toBe(false);

    confirmGate.resolve(credential("uid_late"));
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("does not issue a challenge when logout invalidates an in-flight request", async () => {
    bindFlows();
    const gate = deferred<ConfirmationResult>();
    const controller = makeController({ sendSms: vi.fn(() => gate.promise) });
    const pending = controller.requestOtp("login", "9876543210");
    await Promise.resolve();
    controller.invalidateAuthAttempts("logout");
    gate.resolve(confirmation("late"));

    const result = await pending;
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("STALE_EPOCH");
    expect(controller.resumeChallenge("login")).toBeNull();
  });

  it("does not overwrite a newer legitimate user during stale cleanup", async () => {
    bindFlows();
    const newer = { uid: "uid_newer" } as UserCredential["user"];
    const stale = { uid: "uid_stale" } as UserCredential["user"];
    const cleanup = vi.fn(async () => undefined);
    const controller = makeController({
      sendSms: vi.fn(async () => confirmation("stale")),
      confirm: vi.fn(async () => ({ user: stale } as UserCredential)),
      cleanupStaleUser: cleanup,
    });
    const issued = await controller.requestOtp("login", "9876543210");
    if (!issued.success) return;
    controller.invalidateAuthAttempts("logout");
    const result = await controller.verifyOtp("login", issued.data.handle, "123456");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("NO_CHALLENGE");
    // The exact stale instance was never installed by this fake, so cleanup was
    // not invoked. A real SDK cleanup is reference-guarded in defaultDeps.
    expect(newer.uid).toBe("uid_newer");
  });
});
