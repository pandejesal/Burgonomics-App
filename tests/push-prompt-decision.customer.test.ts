/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * One-time push opt-in (LIVE FINDING on a Samsung S24).
 *
 * The customer app never asked for notification permission: boot only INSPECTS
 * the OS state, and `requestPushPermissions` was reachable solely from the
 * Settings toggle. On Android 13+/iOS a customer who never opens Settings
 * therefore never grants POST_NOTIFICATIONS and gets no order updates
 * (on the real device the state was granted=false and never user-decided).
 *
 * The fix asks at the natural moment — the order-confirmation screen, native
 * only, once per install, through an explicit card (never a surprise dialog).
 * `default` is the undecided state (Android's `prompt`).
 */
import {
  PUSH_PROMPT_DECISION_KEY,
  readPushPromptDecision,
  recordPushPromptDecision,
  shouldOfferPushPrompt,
} from "../src/features/notifications/pushPrompt";

beforeEach(() => {
  localStorage.clear();
});

describe("pushPrompt decision record", () => {
  it("is unknown on a fresh install", () => {
    expect(readPushPromptDecision()).toBeNull();
  });

  it("persists a dismissal so later orders never nag", () => {
    recordPushPromptDecision("dismissed");
    expect(localStorage.getItem(PUSH_PROMPT_DECISION_KEY)).toBe("dismissed");
    expect(readPushPromptDecision()).toBe("dismissed");
  });

  it("persists a grant", () => {
    recordPushPromptDecision("granted");
    expect(readPushPromptDecision()).toBe("granted");
  });

  it("never downgrades a recorded grant", () => {
    recordPushPromptDecision("granted");
    recordPushPromptDecision("dismissed");
    expect(readPushPromptDecision()).toBe("granted");
  });

  it("ignores a corrupt stored value instead of guessing an answer", () => {
    localStorage.setItem(PUSH_PROMPT_DECISION_KEY, "maybe");
    expect(readPushPromptDecision()).toBeNull();
  });

  it("still remembers the answer for the session when storage is unusable", () => {
    // Private mode / blocked storage: BOTH directions fail, so there is no
    // persisted truth to defer to and the in-memory copy is all there is.
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    try {
      expect(() => recordPushPromptDecision("dismissed")).not.toThrow();
      expect(readPushPromptDecision()).toBe("dismissed");
    } finally {
      setItem.mockRestore();
      getItem.mockRestore();
    }
  });

  it("treats a cleared localStorage as never asked, even after a session-only answer", () => {
    // A sign-out / storage clear must not be overridden by a stale in-memory
    // entry from an earlier write in the same tab.
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    recordPushPromptDecision("dismissed");
    setItem.mockRestore();
    getItem.mockRestore();

    expect(readPushPromptDecision()).toBeNull();
  });
});

describe("shouldOfferPushPrompt", () => {
  const base = {
    platform: "android",
    permission: "default" as const,
    decision: null,
    hasConfirmedOrder: true,
  };

  it("shows on native while the OS has not decided", () => {
    expect(shouldOfferPushPrompt(base)).toBe(true);
    expect(shouldOfferPushPrompt({ ...base, platform: "ios" })).toBe(true);
  });

  it("is hidden once granted or denied", () => {
    expect(shouldOfferPushPrompt({ ...base, permission: "granted" })).toBe(false);
    expect(shouldOfferPushPrompt({ ...base, permission: "denied" })).toBe(false);
  });

  it("is hidden after either answer", () => {
    expect(shouldOfferPushPrompt({ ...base, decision: "dismissed" })).toBe(false);
    expect(shouldOfferPushPrompt({ ...base, decision: "granted" })).toBe(false);
  });

  it("never shows on web", () => {
    expect(shouldOfferPushPrompt({ ...base, platform: "web" })).toBe(false);
  });

  it("is hidden without a confirmed order", () => {
    expect(shouldOfferPushPrompt({ ...base, hasConfirmedOrder: false })).toBe(false);
  });

  it("fails closed on an unsupported platform or permission value", () => {
    expect(shouldOfferPushPrompt({ ...base, platform: "desktop" })).toBe(false);
    expect(
      shouldOfferPushPrompt({ ...base, permission: "unsupported" as typeof base.permission }),
    ).toBe(false);
  });
});
