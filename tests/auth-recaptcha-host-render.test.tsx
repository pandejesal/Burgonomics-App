/**
 * RecaptchaHost must render the widget on mount (before any submit) so the
 * "I'm not a robot" checkbox is on screen when the customer taps Continue, and
 * must show an authored message when the widget cannot load at all.
 *
 * The widget container itself is owned by the reCAPTCHA SDK, so the message has
 * to live beside it, never inside it.
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
} from "../src/features/auth/state/authBinding";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const FAILURE_COPY = "We couldn't load the security check. Check your connection and try again.";

describe("RecaptchaHost render-on-mount and failure messages", () => {
  const roots: Array<{ root: Root; container: HTMLDivElement }> = [];
  let renderMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    __resetAuthBindingsForTests();
    renderMock = vi.fn().mockResolvedValue(0);
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
      width?: number;
      renderResult?: Promise<number>;
      throwOnConstruct?: boolean;
    } = {},
  ) {
    const { width = 320, renderResult, throwOnConstruct = false } = opts;

    __setRecaptchaFactoryForTests((_auth, _element, _params) => {
      if (throwOnConstruct) {
        throw new Error("construct failed");
      }
      return {
        clear: vi.fn(),
        render: renderResult !== undefined ? vi.fn().mockReturnValue(renderResult) : renderMock,
      } as unknown as RecaptchaVerifier;
    });

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push({ root, container });
    const measure = () => width;

    await act(async () => {
      root.render(<RecaptchaHost flow="login" measure={measure} />);
    });
    // Flush microtasks for the renderFlow promise.
    await act(async () => {});

    return container;
  }

  it("calls render on mount, before any submit", async () => {
    const container = await renderHost();

    const host = container.querySelector<HTMLElement>('[data-recaptcha-flow="login"]');
    expect(host).not.toBeNull();
    expect(host!.dataset.recaptchaFailed).toBeUndefined();
    expect(renderMock).toHaveBeenCalled();
  });

  it("keeps the widget container free of React children", async () => {
    const container = await renderHost();
    const host = container.querySelector<HTMLElement>('[data-recaptcha-flow="login"]');
    // A React child here would let a re-render fight the SDK's iframe.
    expect(host!.childElementCount).toBe(0);
    expect(host!.textContent).toBe("");
  });

  it("shows the authored message when render reports unavailable", async () => {
    const container = await renderHost({
      renderResult: Promise.reject(new Error("render failed")),
    });

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
});
