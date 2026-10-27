import {
  signOut,
  signInWithPhoneNumber,
  type ConfirmationResult,
  type RecaptchaVerifier,
  type User,
  type UserCredential,
} from "firebase/auth";
import { auth as firebaseAuth } from "@/core/config/firebase";
import { secureStorage, SECURE_KEYS } from "@/core/storage/secureStorage";
import { logger } from "@/core/logging/logger";
import {
  authFail,
  firebaseAuthCode,
  mapFirebaseAuthCode,
  type AuthApiResult,
  type AuthFlowId,
} from "@/features/auth/utils/authErrors";
import {
  acquireForFlow,
  dirtyFlow,
  isFlowMounted,
} from "@/features/auth/state/authBinding";

export const AUTH_REQUEST_DEADLINE_MS = 60_000;
export const AUTH_VERIFY_DEADLINE_MS = 60_000;
export const AUTH_RESEND_AFTER_SEC = 60;
export const AUTH_DISPLAY_EXPIRY_MS = 300_000;

export interface IssuedView {
  flow: AuthFlowId;
  handle: string;
  phone: string;
  maskedPhone: string;
  issuedAt: number;
  resendAfterSec: number;
  displayExpiresAt: number;
  deliveryMethod: "sms";
}

export interface RequestOtpView extends IssuedView {
  expiresInSec: number;
}

export interface VerifyOtpView {
  accessToken: string;
  refreshToken: string;
  user: { id: string; phone: string };
  sdkUser: User;
  attemptEpoch: number;
}

type AttemptState =
  | { kind: "idle" }
  | {
      kind: "requesting";
      flow: AuthFlowId;
      gen: number;
      epoch: number;
      phone: string;
      maskedPhone: string;
      deadlineAt: number;
      opId: number;
    }
  | {
      kind: "issued";
      flow: AuthFlowId;
      handle: string;
      phone: string;
      maskedPhone: string;
      gen: number;
      epoch: number;
      issuedAt: number;
      resendAfterSec: number;
      displayExpiresAt: number;
      confirmation: ConfirmationResult;
    }
  | {
      kind: "verifying";
      flow: AuthFlowId;
      handle: string;
      phone: string;
      maskedPhone: string;
      gen: number;
      epoch: number;
      deadlineAt: number;
      opId: number;
      confirmation: ConfirmationResult;
    }
  | {
      kind: "unknown";
      flow: AuthFlowId;
      gen: number;
      epoch: number;
      phone: string;
      maskedPhone: string;
    };

export interface AuthAttemptDeps {
  sendSms: (phoneE164: string, verifier: RecaptchaVerifier) => Promise<ConfirmationResult>;
  confirm: (confirmation: ConfirmationResult, code: string) => Promise<UserCredential>;
  cleanupStaleUser: (user: User) => Promise<void>;
  now: () => number;
  randomHandle: () => string;
  timeoutMs: number;
}

type TimeoutOutcome<T> =
  | { kind: "value"; value: T }
  | { kind: "error"; error: unknown }
  | { kind: "timeout" };

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<TimeoutOutcome<T>> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ kind: "timeout" });
    }, ms);
    Promise.resolve(promise).then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ kind: "value", value });
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ kind: "error", error });
      },
    );
  });
}

export function normalizePhoneE164(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("91") && cleaned.length === 12) return `+${cleaned}`;
  return `+91${cleaned.replace(/^0+/, "")}`;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `******${digits.slice(-4)}`;
}

function randomHandle(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  // No cryptographic source: fail closed rather than mint a guessable handle.
  throw new Error("AUTH_RANDOM_UNAVAILABLE");
}

function isUid(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

async function writeQuarantine(uid: string): Promise<void> {
  if (!isUid(uid)) return;
  await secureStorage.set(SECURE_KEYS.AUTH_QUARANTINED_UID, uid);
}

async function defaultCleanupStaleUser(user: User): Promise<void> {
  // Reference identity is the guard: never sign out a newer legitimate user.
  if (firebaseAuth.currentUser !== user) return;
  try {
    await signOut(firebaseAuth);
  } catch (error) {
    logger.warn("auth.stale_signout_failed", { code: firebaseAuthCode(error) ?? "unknown" });
  }
  if (firebaseAuth.currentUser === user && isUid(user.uid)) {
    await writeQuarantine(user.uid);
  } else {
    await secureStorage.remove(SECURE_KEYS.AUTH_QUARANTINED_UID);
  }
}

const defaultDeps: AuthAttemptDeps = {
  sendSms: (phoneE164, verifier) => signInWithPhoneNumber(firebaseAuth, phoneE164, verifier),
  confirm: (confirmation, code) => confirmation.confirm(code),
  cleanupStaleUser: defaultCleanupStaleUser,
  now: () => Date.now(),
  randomHandle,
  timeoutMs: AUTH_REQUEST_DEADLINE_MS,
};

export interface AuthAttemptSnapshot {
  kind: AttemptState["kind"];
  flow?: AuthFlowId;
  handle?: string;
  maskedPhone?: string;
  gen?: number;
  epoch?: number;
  issuedAt?: number;
  deadlineAt?: number;
  intentEpoch: number;
  locked: boolean;
}

export interface AuthAttemptController {
  requestOtp: (
    flow: AuthFlowId,
    phone: string,
    deliveryMethod?: "whatsapp" | "sms",
    otpToken?: string,
  ) => Promise<AuthApiResult<RequestOtpView>>;
  resendOtp: (flow: AuthFlowId) => Promise<AuthApiResult<RequestOtpView>>;
  verifyOtp: (
    flow: AuthFlowId,
    handle: string,
    code: string,
  ) => Promise<AuthApiResult<VerifyOtpView>>;
  adoptChallenge: (
    toFlow: AuthFlowId,
    handle: string,
  ) => { ok: true } | { ok: false; code: "CHALLENGE_MISMATCH" | "STALE_EPOCH" };
  resumeChallenge: (flow: AuthFlowId) => IssuedView | null;
  invalidateAuthAttempts: (reason: "logout" | "changePhone" | "userReset") => void;
  cleanupStaleUser: (user: unknown, attemptEpoch: number) => Promise<void>;
  getIntentEpoch: () => number;
  isIntentEpochCurrent: (epoch: number) => boolean;
  getSnapshot: () => AuthAttemptSnapshot;
  __resetForTests: () => void;
}

export function createAuthAttemptController(
  overrides: Partial<AuthAttemptDeps> = {},
): AuthAttemptController {
  const deps: AuthAttemptDeps = { ...defaultDeps, ...overrides };

  let state: AttemptState = { kind: "idle" };
  let intentEpoch = 0;
  let generation = 0;
  let operationSequence = 0;
  let lockOpId: number | null = null;

  const now = () => deps.now();

  function issuedView(current: Extract<AttemptState, { kind: "issued" }>): IssuedView {
    return {
      flow: current.flow,
      handle: current.handle,
      phone: current.phone,
      maskedPhone: current.maskedPhone,
      issuedAt: current.issuedAt,
      resendAfterSec: current.resendAfterSec,
      displayExpiresAt: current.displayExpiresAt,
      deliveryMethod: "sms",
    };
  }

  function cooldownSeconds(current: Extract<AttemptState, { kind: "issued" }>): number {
    return Math.max(
      0,
      Math.ceil((current.issuedAt + current.resendAfterSec * 1000 - now()) / 1000),
    );
  }

  async function startRequest(
    flow: AuthFlowId,
    phone: string,
    _ignoreCooldown: boolean,
  ): Promise<AuthApiResult<RequestOtpView>> {
    const acquired = acquireForFlow(flow);
    if (!acquired.ok) return authFail(acquired.code);

    const opId = ++operationSequence;
    lockOpId = opId;
    const epochAtStart = intentEpoch;

    try {
      await acquired.verifier.render();
    } catch (error) {
      if (lockOpId === opId) lockOpId = null;
      logger.warn("auth.recaptcha_render_failed", { code: firebaseAuthCode(error) ?? "unknown" });
      dirtyFlow(flow);
      return authFail("RECAPTCHA_RENDER_FAILED");
    }

    if (epochAtStart !== intentEpoch) {
      if (lockOpId === opId) lockOpId = null;
      return authFail("STALE_EPOCH");
    }

    const gen = ++generation;
    const epoch = epochAtStart;
    const phoneE164 = normalizePhoneE164(phone);
    const masked = maskPhone(phoneE164);
    state = {
      kind: "requesting",
      flow,
      gen,
      epoch,
      phone: phoneE164,
      maskedPhone: masked,
      deadlineAt: now() + deps.timeoutMs,
      opId,
    };

    let send: Promise<ConfirmationResult>;
    try {
      send = deps.sendSms(phoneE164, acquired.verifier);
    } catch (error) {
      send = Promise.reject(error);
    }

    const outcome = await withDeadline(send, deps.timeoutMs);

    if (outcome.kind === "timeout") {
      if (lockOpId === opId && state.kind === "requesting" && state.gen === gen && state.epoch === epoch) {
        generation += 1;
        state = {
          kind: "unknown",
          flow,
          gen: generation,
          epoch,
          phone: phoneE164,
          maskedPhone: masked,
        };
        dirtyFlow(flow);
      }
      if (lockOpId === opId) lockOpId = null;
      return authFail("AUTH_LAST_ATTEMPT_UNKNOWN");
    }

    if (outcome.kind === "error") {
      if (lockOpId === opId) {
        if (state.kind === "requesting" && state.gen === gen && state.epoch === epoch) {
          state = { kind: "idle" };
          dirtyFlow(flow);
        }
        lockOpId = null;
      }
      return authFail(mapFirebaseAuthCode(outcome.error, "AUTH_OTP_REQUEST_FAILED"));
    }

    if (
      lockOpId !== opId ||
      state.kind !== "requesting" ||
      state.gen !== gen ||
      state.epoch !== epoch
    ) {
      if (lockOpId === opId) lockOpId = null;
      return authFail(epoch !== intentEpoch ? "STALE_EPOCH" : "AUTH_ATTEMPT_INVALIDATED");
    }

    const issuedAt = now();
    const handle = deps.randomHandle();
    const current: Extract<AttemptState, { kind: "issued" }> = {
      kind: "issued",
      flow,
      handle,
      phone: phoneE164,
      maskedPhone: masked,
      gen,
      epoch,
      issuedAt,
      resendAfterSec: AUTH_RESEND_AFTER_SEC,
      displayExpiresAt: issuedAt + AUTH_DISPLAY_EXPIRY_MS,
      confirmation: outcome.value,
    };
    state = current;
    lockOpId = null;
    return {
      success: true,
      data: { ...issuedView(current), expiresInSec: Math.floor(AUTH_DISPLAY_EXPIRY_MS / 1000) },
    };
  }

  async function requestOtp(
    flow: AuthFlowId,
    phone: string,
    _deliveryMethod: "whatsapp" | "sms" = "sms",
    _otpToken?: string,
  ): Promise<AuthApiResult<RequestOtpView>> {
    if (lockOpId !== null) return authFail("AUTH_OTP_IN_FLIGHT");

    if (state.kind === "issued") {
      if (state.flow !== flow) {
        return authFail("CHALLENGE_ACTIVE_OTHER_FLOW", {
          flow: state.flow,
          maskedPhone: state.maskedPhone,
          handle: state.handle,
        });
      }
      const remaining = cooldownSeconds(state);
      if (remaining > 0) return authFail("AUTH_OTP_COOLDOWN", { seconds: remaining });
    }

    return startRequest(flow, phone, false);
  }

  async function resendOtp(flow: AuthFlowId): Promise<AuthApiResult<RequestOtpView>> {
    if (lockOpId !== null) return authFail("AUTH_OTP_IN_FLIGHT");

    if (state.kind === "unknown") {
      return startRequest(flow, state.phone, true);
    }
    if (state.kind !== "issued") return authFail("NO_CHALLENGE");
    if (state.flow !== flow) {
      return authFail("CHALLENGE_ACTIVE_OTHER_FLOW", {
        flow: state.flow,
        maskedPhone: state.maskedPhone,
        handle: state.handle,
      });
    }
    const remaining = cooldownSeconds(state);
    if (remaining > 0) return authFail("AUTH_OTP_COOLDOWN", { seconds: remaining });
    return startRequest(flow, state.phone, true);
  }

  async function verifyOtp(
    flow: AuthFlowId,
    handle: string,
    code: string,
  ): Promise<AuthApiResult<VerifyOtpView>> {
    if (lockOpId !== null) return authFail("AUTH_OTP_IN_FLIGHT");
    if (state.kind !== "issued") return authFail("NO_CHALLENGE");
    if (state.epoch !== intentEpoch) return authFail("STALE_EPOCH");
    if (state.flow !== flow || state.handle !== handle) return authFail("CHALLENGE_MISMATCH");

    const previous = state;
    const opId = ++operationSequence;
    lockOpId = opId;
    const gen = previous.gen;
    const epoch = previous.epoch;
    state = {
      kind: "verifying",
      flow,
      handle,
      phone: previous.phone,
      maskedPhone: previous.maskedPhone,
      gen,
      epoch,
      deadlineAt: now() + deps.timeoutMs,
      opId,
      confirmation: previous.confirmation,
    };

    let confirmPromise: Promise<UserCredential>;
    try {
      confirmPromise = deps.confirm(previous.confirmation, code.trim());
    } catch (error) {
      confirmPromise = Promise.reject(error);
    }

    const outcome = await withDeadline(confirmPromise, deps.timeoutMs);

    if (outcome.kind === "timeout") {
      // The SDK may still complete after our deadline. It must never become
      // auth; if it produces a user, clean up that exact instance.
      void confirmPromise
        .then(async (credential) => {
          await deps.cleanupStaleUser(credential.user);
        })
        .catch(() => undefined);
      if (lockOpId === opId) {
        if (epoch === intentEpoch && state.kind === "verifying" && state.gen === gen) {
          generation += 1;
          state = {
            kind: "unknown",
            flow,
            gen: generation,
            epoch,
            phone: previous.phone,
            maskedPhone: previous.maskedPhone,
          };
          dirtyFlow(flow);
        } else {
          state = { kind: "idle" };
        }
        lockOpId = null;
      }
      return authFail("AUTH_LAST_ATTEMPT_UNKNOWN");
    }

    if (outcome.kind === "error") {
      const mapped = mapFirebaseAuthCode(outcome.error, "AUTH_OTP_VERIFY_FAILED");
      if (lockOpId === opId) {
        if (epoch !== intentEpoch) {
          state = { kind: "idle" };
        } else if (mapped === "AUTH_CODE_EXPIRED") {
          state = { kind: "idle" };
          dirtyFlow(flow);
        } else if (state.kind === "verifying" && state.gen === gen) {
          state = previous;
        }
        lockOpId = null;
      }
      return authFail(mapped);
    }

    const user = outcome.value.user;
    const stale =
      lockOpId !== opId ||
      epoch !== intentEpoch ||
      state.kind !== "verifying" ||
      state.gen !== gen;

    if (stale) {
      await deps.cleanupStaleUser(user);
      if (lockOpId === opId) lockOpId = null;
      if (epoch !== intentEpoch) state = { kind: "idle" };
      return authFail(epoch !== intentEpoch ? "STALE_EPOCH" : "AUTH_ATTEMPT_INVALIDATED");
    }

    try {
      const accessToken = await user.getIdToken();
      const refreshToken = user.refreshToken;
      state = { kind: "idle" };
      lockOpId = null;
      return {
        success: true,
        data: {
          accessToken,
          refreshToken,
          user: { id: user.uid, phone: user.phoneNumber || previous.phone },
          sdkUser: user,
          attemptEpoch: epoch,
        },
      };
    } catch (error) {
      logger.warn("auth.token_read_failed", { code: firebaseAuthCode(error) ?? "unknown" });
      await deps.cleanupStaleUser(user);
      if (lockOpId === opId) lockOpId = null;
      if (epoch === intentEpoch) state = previous;
      return authFail("AUTH_INTERNAL");
    }
  }

  function adoptChallenge(
    toFlow: AuthFlowId,
    handle: string,
  ): { ok: true } | { ok: false; code: "CHALLENGE_MISMATCH" | "STALE_EPOCH" } {
    if (lockOpId !== null) return { ok: false, code: "CHALLENGE_MISMATCH" };
    if (state.kind !== "issued" || state.handle !== handle) {
      return { ok: false, code: "CHALLENGE_MISMATCH" };
    }
    if (state.epoch !== intentEpoch) return { ok: false, code: "STALE_EPOCH" };
    if (!isFlowMounted(toFlow)) return { ok: false, code: "CHALLENGE_MISMATCH" };
    if (state.flow !== toFlow) state = { ...state, flow: toFlow };
    return { ok: true };
  }

  function resumeChallenge(flow: AuthFlowId): IssuedView | null {
    if (state.kind !== "issued") return null;
    if (state.epoch !== intentEpoch) return null;
    if (state.flow !== flow) return null;
    return issuedView(state);
  }

  function invalidateAuthAttempts(_reason: "logout" | "changePhone" | "userReset"): void {
    intentEpoch += 1;
    state = { kind: "idle" };
    // Keep any in-flight lock until settle/deadline. Never clear it here:
    // that would let a second SDK request overlap the cancelled one.
  }

  async function cleanupStaleUser(user: unknown, attemptEpoch: number): Promise<void> {
    if (attemptEpoch === intentEpoch) return;
    if (!user || typeof user !== "object") return;
    const candidate = user as User;
    if (typeof candidate.uid !== "string") return;
    await deps.cleanupStaleUser(candidate);
  }

  function getSnapshot(): AuthAttemptSnapshot {
    return {
      kind: state.kind,
      ...(state.kind !== "idle"
        ? {
            flow: state.flow,
            gen: state.gen,
            epoch: state.epoch,
            maskedPhone: state.maskedPhone,
            ...(state.kind === "issued" ? { handle: state.handle, issuedAt: state.issuedAt } : {}),
            ...(state.kind === "requesting" || state.kind === "verifying"
              ? { deadlineAt: state.deadlineAt }
              : {}),
          }
        : {}),
      intentEpoch,
      locked: lockOpId !== null,
    };
  }

  function __resetForTests(): void {
    state = { kind: "idle" };
    intentEpoch = 0;
    generation = 0;
    operationSequence = 0;
    lockOpId = null;
  }

  return {
    requestOtp,
    resendOtp,
    verifyOtp,
    adoptChallenge,
    resumeChallenge,
    invalidateAuthAttempts,
    cleanupStaleUser,
    getIntentEpoch: () => intentEpoch,
    isIntentEpochCurrent: (epoch) => epoch === intentEpoch,
    getSnapshot,
    __resetForTests,
  };
}

export const authAttempts = createAuthAttemptController();

/** Test-only reset shared by authService.__resetForTests. */
export function __resetAuthAttemptsForTests(): void {
  authAttempts.__resetForTests();
}
