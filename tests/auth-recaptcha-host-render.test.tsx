/**
 * The host binds an invisible verifier without rendering a checkbox or
 * reserving layout space. Rendering the invisible widget only prepares it;
 * Continue triggers the SDK's execute path during signInWithPhoneNumber.
 * Expiry and provider errors dirty the binding so the next attempt rebuilds it.
 *
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecaptchaVerifier } from "firebase/auth";
import { RecaptchaHost } from "../src/features/auth/components/RecaptchaHost";
import {
  __resetAuthBindingsForTests,
  __setRecaptchaFactoryForTests,
  acquireForFlow,
} from "../src/features/auth/state/authBinding";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const FAILURE_COPY = "We couldn't load the security check. Check your connection and try again.";

type Callbacks = {
  callback: () => void;
  "expired-callback": () => void;
  "error-callback": () => void;
};

describe("RecaptchaHost invisible preparation and failure messages", () => {
  const roots: Array<{ root: Root; container: HTMLDivElement }> = [];
  let renderMock: ReturnType<typeof vi.fn>;
  let constructed: Array<{
    parameters: Callbacks;
    clear: ReturnType<typeof vi.fn>;
  }>;

  beforeEach(() => {
    __resetAuthBindingsForTests();
    renderMock = vi.fn().mockResolvedValue(0);
    constructed = [];
  });

  afterEach(async () => {
    for (const { root, container } of roots.splice(0)) {
      await act(async () => root.unmount());
      container.remove();
    }
    __resetAuthBindingsForTests();
    __setRecaptchaFactoryForTests(null);
    vi.restoreAllMocks();
  });

  async function renderHost(
    opts: {
      renderResult?: Promise<number>;
      throwOnConstruct?: boolean;
    } = {},
  ) {
    const { renderResult, throwOnConstruct = false } = opts;

    __setRecaptchaFactoryForTests((_auth, _element, parameters) => {
      if (throwOnConstruct) {
        throw new Error("construct failed");
      }
      const clear = vi.fn();
      constructed.push({
        parameters: parameters as unknown as Callbacks,
        clear,
      });
      return {
        clear,
        render: renderResult !== undefined ? vi.fn().mockReturnValue(renderResult) : renderMock,
      } as unknown as RecaptchaVerifier;
    });

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push({ root, container });
    await act(async () => {
      root.render(<RecaptchaHost flow="login" />);
    });
    // Flush microtasks for the renderFlow promise.
    await act(async () => {});

    return container;
  }

  it("prepares the invisible widget before submit without reserving space or showing a checkbox", async () => {
    const container = await renderHost();

    const host = container.querySelector<HTMLElement>('[data-recaptcha-flow="login"]');
    expect(host).not.toBeNull();
    expect(host!.dataset.recaptchaFailed).toBeUndefined();
    expect(host!.dataset.recaptchaSize).toBe("invisible");
    expect(constructed[0].parameters).toMatchObject({
      size: "invisible",
      "expired-callback": expect.any(Function),
      "error-callback": expect.any(Function),
    });
    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("I'm not a robot");
  });

  it("keeps the widget container free of React children", async () => {
    const container = await renderHost();
    const host = container.querySelector<HTMLElement>('[data-recaptcha-flow="login"]');
    // A React child here would let a re-render fight the SDK's iframe.
    expect(host!.childElementCount).toBe(0);
    expect(host!.textContent).toBe("");
  });

  it("shows the authored message when render reports unavailable", async () => {
    const rejected = Promise.reject(new Error("render failed"));
    rejected.catch(() => {});
    const container = await renderHost({ renderResult: rejected });

    const host = container.querySelector<HTMLElement>('[data-recaptcha-flow="login"]');
    expect(host!.dataset.recaptchaFailed).toBe("true");
    expect(container.textContent).toContain(FAILURE_COPY);
    // ...and still not inside the SDK-owned container.
    expect(host!.textContent).toBe("");
  });

  it("shows the authored message when binding fails (construction throws)", async () => {
    const container = await renderHost({ throwOnConstruct: true });

    const host = container.querySelector<HTMLElement>('[data-recaptcha-flow="login"]');
    expect(host!.dataset.recaptchaFailed).toBe("true");
    expect(container.textContent).toContain(FAILURE_COPY);
  });

  it.each(["expiry", "error"] as const)("rearms the same host after %s", async (reason) => {
    await renderHost();
    const host = document.querySelector<HTMLElement>('[data-recaptcha-flow="login"]')!;
    if (reason === "expiry") constructed[0].parameters["expired-callback"]();
    else constructed[0].parameters["error-callback"]();

    expect(acquireForFlow("login")).toMatchObject({ ok: true, size: "invisible" });
    expect(constructed).toHaveLength(2);
    expect(constructed[0].clear).toHaveBeenCalledTimes(1);
    expect(host.isConnected).toBe(true);
  });
});
