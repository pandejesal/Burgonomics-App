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
  renderFlow,
} from "../src/features/auth/state/authBinding";

type Params = {
  size: "normal" | "compact" | "invisible";
  callback: () => void;
  "expired-callback": () => void;
  "error-callback": () => void;
};

function fakeVerifier(clear = vi.fn()) {
  return { clear, render: vi.fn() } as unknown as RecaptchaVerifier;
}

let expired: (() => void) | null = null;
let failed: (() => void) | null = null;

function setFactory(clear = vi.fn()) {
  const factory = vi.fn((_auth: unknown, _element: HTMLElement, params: Params) => {
    expired = params["expired-callback"];
    failed = params["error-callback"];
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
    failed = null;
    element = document.createElement("div");
    document.body.append(element);
  });

  afterEach(() => {
    __resetAuthBindingsForTests();
    __setRecaptchaFactoryForTests(null);
    element.remove();
    vi.restoreAllMocks();
  });

  it("binds an invisible verifier without reserving visible-widget space", () => {
    const factory = setFactory();
    const bound = bindHost("login", "host_a", element);
    expect(bound).toEqual({ ok: true, size: "invisible" });
    expect(factory.mock.calls[0][1]).toBe(element);
    expect(factory.mock.calls[0][2]).toMatchObject({
      size: "invisible",
      "expired-callback": expect.any(Function),
      "error-callback": expect.any(Function),
    });
    expect(getBindingSize("login")).toBe("invisible");
  });

  it("is idempotent for the same host and never overwrites another host", () => {
    const factory = setFactory();
    expect(bindHost("login", "host_a", element)).toEqual({
      ok: true,
      size: "invisible",
    });
    expect(bindHost("login", "host_a", element)).toEqual({
      ok: true,
      size: "invisible",
    });
    expect(factory).toHaveBeenCalledTimes(1);

    const other = document.createElement("div");
    expect(bindHost("login", "host_b", other)).toEqual({
      ok: false,
      code: "HOST_CONFLICT",
    });
    expect(getBindingSize("login")).toBe("invisible");
  });

  it("binds immediately and returns NOT_BOUND for an unmounted flow", () => {
    setFactory();
    expect(bindHost("login", "host_a", element)).toEqual({
      ok: true,
      size: "invisible",
    });
    releaseHost("login", "host_a");
    expect(acquireForFlow("login")).toEqual({
      ok: false,
      code: "RECAPTCHA_NOT_BOUND",
    });
  });

  it("re-arms a dirty host on the same empty element and releases null-first", () => {
    const clear = vi.fn();
    const factory = setFactory(clear);
    bindHost("login", "host_a", element);
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

  it.each(["expiry", "error"] as const)("re-arms after %s and releases null-first", (reason) => {
    const clear = vi.fn();
    const factory = setFactory(clear);
    bindHost("login", "host_a", element);
    if (reason === "expiry") expired?.();
    else failed?.();

    expect(acquireForFlow("login")).toMatchObject({ ok: true, size: "invisible" });
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
    bindHost("login", "host_a", element);
    failed?.();
    expect(() => acquireForFlow("login")).not.toThrow();
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("ignores stale callbacks after release and rebuilds", () => {
    const clear = vi.fn();
    const factory = setFactory(clear);
    bindHost("login", "host_a", element);
    const oldExpired = expired;
    const oldFailed = failed;
    releaseHost("login", "host_a");
    bindHost("login", "host_a", element);

    oldExpired?.();
    oldFailed?.();
    const current = acquireForFlow("login");
    expect(current).toMatchObject({ ok: true, size: "invisible" });
    expect(factory).toHaveBeenCalledTimes(2);
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("keeps StrictMode construct-minus-clear at one per mounted instance", () => {
    const clear = vi.fn();
    const factory = setFactory(clear);
    bindHost("login", "host_a", element);
    releaseHost("login", "host_a");
    bindHost("login", "host_a", element);

    expect(factory.mock.calls.length - clear.mock.calls.length).toBe(1);
  });

  it("ignores a stale render failure after the host is released and rebound", async () => {
    let rejectRender: (error: Error) => void = () => {};
    const factory = vi
      .fn()
      .mockImplementationOnce((_auth: unknown, _element: HTMLElement) => ({
        clear: vi.fn(),
        render: vi.fn(
          () =>
            new Promise<number>((_resolve, reject) => {
              rejectRender = reject;
            }),
        ),
      }))
      .mockImplementationOnce(() => ({
        clear: vi.fn(),
        render: vi.fn(async () => 0),
      }));
    __setRecaptchaFactoryForTests(factory as any);
    bindHost("login", "host_a", element);
    const pending = renderFlow("login");
    releaseHost("login", "host_a");
    bindHost("login", "host_a", element);
    rejectRender(new Error("late render failure"));

    expect(await pending).toBe("unavailable");
    const current = acquireForFlow("login");
    expect(current).toMatchObject({ ok: true, size: "invisible" });
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
