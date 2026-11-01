// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { RecaptchaVerifier } from "firebase/auth";
import {
  __resetAuthBindingsForTests,
  __setRecaptchaFactoryForTests,
  acquireForFlow,
  bindHost,
  getBindingSize,
  releaseHost,
} from "../src/features/auth/state/authBinding";

type Params = {
  size: "normal" | "compact";
  callback: () => void;
  "expired-callback": () => void;
};

function fakeVerifier(clear = vi.fn()) {
  return { clear, render: vi.fn() } as unknown as RecaptchaVerifier;
}

let expired: (() => void) | null = null;

function setFactory(clear = vi.fn()) {
  const factory = vi.fn((_auth: unknown, _element: HTMLElement, params: Params) => {
    expired = params["expired-callback"];
    return fakeVerifier(clear);
  });
  __setRecaptchaFactoryForTests(factory as any);
  return factory;
}

describe("reCAPTCHA binding ownership and re-arm", () => {
  let element: HTMLDivElement;

  beforeEach(() => {
    __resetAuthBindingsForTests();
    expired = null;
    element = document.createElement("div");
    document.body.append(element);
  });

  afterEach(() => {
    __resetAuthBindingsForTests();
    __setRecaptchaFactoryForTests(null);
    element.remove();
    vi.restoreAllMocks();
  });

  it("binds to the element reference and selects size at the 304 boundary", () => {
    const factory = setFactory();
    const compact = bindHost("login", "host_a", element, () => 277);
    expect(compact).toEqual({ ok: true, size: "compact" });
    expect(factory.mock.calls[0][1]).toBe(element);

    __resetAuthBindingsForTests();
    const normal = bindHost("login", "host_a", element, () => 304);
    expect(normal).toEqual({ ok: true, size: "normal" });

    __resetAuthBindingsForTests();
    const wide = bindHost("login", "host_a", element, () => 348);
    expect(wide).toEqual({ ok: true, size: "normal" });
  });

  it("is idempotent for the same host and never overwrites another host", () => {
    const factory = setFactory();
    expect(bindHost("login", "host_a", element, () => 320)).toEqual({
      ok: true,
      size: "normal",
    });
    expect(bindHost("login", "host_a", element, () => 320)).toEqual({
      ok: true,
      size: "normal",
    });
    expect(factory).toHaveBeenCalledTimes(1);

    const other = document.createElement("div");
    expect(bindHost("login", "host_b", other, () => 320)).toEqual({
      ok: false,
      code: "HOST_CONFLICT",
    });
    expect(getBindingSize("login")).toBe("normal");
  });

  it("returns NOT_READY before layout and NOT_BOUND for an unmounted flow", () => {
    setFactory();
    expect(bindHost("login", "host_a", element, () => 0)).toEqual({
      ok: false,
      code: "RECAPTCHA_CONTAINER_NOT_READY",
    });
    expect(acquireForFlow("login")).toEqual({
      ok: false,
      code: "RECAPTCHA_NOT_BOUND",
    });
  });

  it("re-arms a dirty host on the same empty element and releases null-first", () => {
    const clear = vi.fn();
    const factory = setFactory(clear);
    bindHost("login", "host_a", element, () => 320);
    expired?.();
    expect(acquireForFlow("login").ok).toBe(true);

    expect(factory).toHaveBeenCalledTimes(2);
    expect(factory.mock.calls[1][1]).toBe(element);
    expect(clear).toHaveBeenCalledTimes(1);

    releaseHost("login", "host_a");
    expect(clear).toHaveBeenCalledTimes(2);
    releaseHost("login", "host_a");
    expect(clear).toHaveBeenCalledTimes(2);
  });

  it("catches a throwing clear and still rebuilds the widget", () => {
    const clear = vi.fn(() => {
      throw Object.assign(new Error("destroyed"), { code: "auth/internal-error" });
    });
    const factory = setFactory(clear);
    bindHost("login", "host_a", element, () => 320);
    expired?.();
    expect(() => acquireForFlow("login")).not.toThrow();
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("keeps StrictMode construct-minus-clear at one per mounted instance", () => {
    const clear = vi.fn();
    const factory = setFactory(clear);
    bindHost("login", "host_a", element, () => 320);
    releaseHost("login", "host_a");
    bindHost("login", "host_a", element, () => 320);

    expect(factory.mock.calls.length - clear.mock.calls.length).toBe(1);
  });
});
