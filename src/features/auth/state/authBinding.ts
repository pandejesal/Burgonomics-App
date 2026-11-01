import { RecaptchaVerifier, type Auth } from "firebase/auth";
import { auth as firebaseAuth } from "@/core/config/firebase";
import { logger } from "@/core/logging/logger";
import { firebaseAuthCode, type AuthFlowId, type HostFailure } from "@/features/auth/utils/authErrors";

export type RecaptchaSize = "normal" | "compact";

export interface BindSuccess {
  ok: true;
  size: RecaptchaSize;
}

export interface BindFailure {
  ok: false;
  code: HostFailure;
}

export type BindResult = BindSuccess | BindFailure;

export type AcquireResult =
  | { ok: true; size: RecaptchaSize; verifier: RecaptchaVerifier }
  | BindFailure;

type BindingState = "ready" | "dirty";

interface BindingEntry {
  hostId: string;
  element: HTMLElement;
  verifier: RecaptchaVerifier | null;
  size: RecaptchaSize;
  state: BindingState;
}

export type RecaptchaFactory = (
  auth: Auth,
  element: HTMLElement,
  parameters: {
    size: RecaptchaSize;
    callback: () => void;
    "expired-callback": () => void;
  },
) => RecaptchaVerifier;

const bindings = new Map<AuthFlowId, BindingEntry>();

let factory: RecaptchaFactory = (auth, element, parameters) =>
  new RecaptchaVerifier(auth, element, parameters);

/** Test seam: keeps the real SDK out of unit tests while using the same code. */
export function __setRecaptchaFactoryForTests(next: RecaptchaFactory | null): void {
  factory =
    next ??
    ((auth, element, parameters) => new RecaptchaVerifier(auth, element, parameters));
}

function safeClear(verifier: RecaptchaVerifier | null): void {
  if (!verifier) return;
  try {
    verifier.clear();
  } catch (error) {
    const code = firebaseAuthCode(error) ?? "unknown";
    logger.warn("auth.recaptcha_clear_failed", { code });
  }
}

function emptyHost(element: HTMLElement): void {
  while (element.firstChild) element.removeChild(element.firstChild);
}

function construct(
  flow: AuthFlowId,
  hostId: string,
  element: HTMLElement,
  size: RecaptchaSize,
): BindingResultInternal {
  try {
    let verifier: RecaptchaVerifier;
    verifier = factory(firebaseAuth, element, {
      size,
      callback: () => undefined,
      "expired-callback": () => {
        const current = bindings.get(flow);
        if (current && current.hostId === hostId && current.verifier === verifier) {
          current.state = "dirty";
        }
      },
    });
    const entry: BindingEntry = { hostId, element, verifier, size, state: "ready" };
    bindings.set(flow, entry);
    return { ok: true, size };
  } catch (error) {
    const code = firebaseAuthCode(error) ?? "unknown";
    logger.warn("auth.recaptcha_render_failed", { code });
    return { ok: false, code: "RECAPTCHA_RENDER_FAILED" };
  }
}

type BindingResultInternal = BindSuccess | BindFailure;

/**
 * Binds one DOM host per logical flow. The verifier is constructed from the
 * element reference, never a global id, so two mounted surfaces can never
 * silently steal each other's widget.
 */
export function bindHost(
  flow: AuthFlowId,
  hostId: string,
  element: HTMLElement,
  measure: () => number = () => element.clientWidth,
): BindResult {
  const existing = bindings.get(flow);
  if (existing) {
    return existing.hostId === hostId
      ? { ok: true, size: existing.size }
      : { ok: false, code: "HOST_CONFLICT" };
  }

  let width = 0;
  try {
    width = measure();
  } catch {
    width = 0;
  }
  if (!Number.isFinite(width) || width <= 0) {
    return { ok: false, code: "RECAPTCHA_CONTAINER_NOT_READY" };
  }

  const size: RecaptchaSize = width >= 304 ? "normal" : "compact";
  return construct(flow, hostId, element, size);
}

export function releaseHost(flow: AuthFlowId, hostId: string): void {
  const existing = bindings.get(flow);
  if (!existing || existing.hostId !== hostId) return;
  const verifier = existing.verifier;
  // Null first: a late callback can no longer dirty anything after release.
  existing.verifier = null;
  bindings.delete(flow);
  safeClear(verifier);
}

/**
 * Returns a usable verifier, re-arming a dirty host on the SAME element.
 * A solved-but-expired widget is the only re-arm path; it is never a loop.
 */
export function acquireForFlow(flow: AuthFlowId): AcquireResult {
  const existing = bindings.get(flow);
  if (!existing) return { ok: false, code: "RECAPTCHA_NOT_BOUND" };
  if (existing.state === "ready" && existing.verifier) {
    return { ok: true, size: existing.size, verifier: existing.verifier };
  }

  const previous = existing.verifier;
  existing.verifier = null;
  safeClear(previous);
  if (existing.element.childNodes.length !== 0) emptyHost(existing.element);

  const rebuilt = construct(flow, existing.hostId, existing.element, existing.size);
  if (!rebuilt.ok) return rebuilt;
  const current = bindings.get(flow);
  if (!current || !current.verifier) return { ok: false, code: "RECAPTCHA_RENDER_FAILED" };
  return { ok: true, size: current.size, verifier: current.verifier };
}

export function dirtyFlow(flow: AuthFlowId): void {
  const existing = bindings.get(flow);
  if (existing) existing.state = "dirty";
}

export function isFlowMounted(flow: AuthFlowId): boolean {
  return bindings.has(flow);
}

export function getBindingSize(flow: AuthFlowId): RecaptchaSize | null {
  return bindings.get(flow)?.size ?? null;
}

/** Test-only reset; production flow releases hosts on unmount. */
export function __resetAuthBindingsForTests(): void {
  for (const [flow, entry] of bindings) {
    const verifier = entry.verifier;
    entry.verifier = null;
    bindings.delete(flow);
    safeClear(verifier);
  }
  bindings.clear();
}
