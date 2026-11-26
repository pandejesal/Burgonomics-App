/** @vitest-environment jsdom */
/**
 * A6-c11 item 6 (Medium): a failed or disabled push grant recorded "dismissed"
 * for ever, so the one-time prompt never returned.
 *
 * `PushOptInCard` called `answer(granted ? "granted" : "dismissed")` for ANY
 * false result — a throw, a build with push disabled (`enabled: false` makes
 * `requestPushPermissions` return false immediately) or a still-undecided OS
 * prompt. `recordPushPromptDecision` writes once and `shouldOfferPushPrompt`
 * refuses whenever a decision exists, so those customers were permanently
 * excluded from the only proactive order-status channel.
 *
 * Fix: record "dismissed" ONLY for an OBSERVED `denied`; never offer (nor
 * consume) the card while the build's push flag is off.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const pushStatus = vi.hoisted(() => ({
  enabled: true,
  permission: "default" as "granted" | "denied" | "default" | "unsupported",
  listenerAttached: false,
}));

vi.mock("../src/shared/platform/pushNotifications", () => ({
  getPushStatusSnapshot: () => ({ ...pushStatus }),
}));

vi.mock("../src/core/logging/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  PUSH_PROMPT_DECISION_KEY,
  decidePushPromptAnswer,
  readPushPromptDecision,
  shouldOfferPushPrompt,
} from "../src/features/notifications/pushPrompt";
import { PushOptInCard } from "../src/features/notifications/components/PushOptInCard";

async function mountCard(onRequestPermission: () => Promise<boolean>) {
  const answered: string[] = [];
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <PushOptInCard
        onRequestPermission={onRequestPermission}
        onAnswered={(d) => answered.push(d)}
      />,
    );
  });
  const turnOn = Array.from(container.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes("Turn on"),
  );
  expect(turnOn).toBeTruthy();
  await act(async () => {
    turnOn!.click();
  });
  await act(async () => {});
  await act(async () => root.unmount());
  container.remove();
  return answered;
}

beforeEach(() => {
  localStorage.clear();
  pushStatus.enabled = true;
  pushStatus.permission = "default";
  pushStatus.listenerAttached = false;
});

describe("decidePushPromptAnswer — only a real refusal is recorded", () => {
  it("records granted when permission was granted", () => {
    expect(decidePushPromptAnswer({ granted: true, permission: "granted" })).toBe("granted");
  });

  it("records dismissed when the OS now reports denied", () => {
    expect(decidePushPromptAnswer({ granted: false, permission: "denied" })).toBe("dismissed");
  });

  it("records NOTHING for a still-undecided OS prompt", () => {
    expect(decidePushPromptAnswer({ granted: false, permission: "default" })).toBeNull();
  });

  it("records NOTHING for a disabled/unsupported runtime", () => {
    expect(decidePushPromptAnswer({ granted: false, permission: "unsupported" })).toBeNull();
  });
});

describe("shouldOfferPushPrompt — a disabled build never shows the card", () => {
  const base = {
    platform: "android",
    permission: "default" as const,
    decision: null,
    hasConfirmedOrder: true,
  };

  it("is hidden while push is disabled, so the prompt is not burned", () => {
    expect(shouldOfferPushPrompt({ ...base, enabled: false })).toBe(false);
  });

  it("still shows on an enabled native build that has not decided", () => {
    expect(shouldOfferPushPrompt({ ...base, enabled: true })).toBe(true);
  });

  it("fails closed when the caller omits the flag", () => {
    expect(shouldOfferPushPrompt(base)).toBe(false);
  });
});

describe("PushOptInCard — a failed attempt leaves the prompt available", () => {
  it("writes nothing when push is disabled and the request resolves false", async () => {
    // The shipped shape: VITE_PUSH_ENABLED unset →
    // requestPushPermissions returns false immediately, permission "default".
    pushStatus.enabled = false;
    const answered = await mountCard(async () => false);

    expect(localStorage.getItem(PUSH_PROMPT_DECISION_KEY)).toBeNull();
    expect(readPushPromptDecision()).toBeNull();
    // The parent is not told an answer happened either.
    expect(answered).toEqual([]);
  });

  it("writes nothing when the permission request THROWS", async () => {
    const answered = await mountCard(async () => {
      throw new Error("push plugin missing");
    });

    expect(readPushPromptDecision()).toBeNull();
    expect(answered).toEqual([]);
  });

  it("writes nothing when the OS prompt is still undecided after the attempt", async () => {
    pushStatus.permission = "default";
    const answered = await mountCard(async () => false);

    expect(readPushPromptDecision()).toBeNull();
    expect(answered).toEqual([]);
  });

  it("records dismissed when the OS actually reports denied", async () => {
    pushStatus.permission = "denied";
    const answered = await mountCard(async () => false);

    expect(readPushPromptDecision()).toBe("dismissed");
    expect(answered).toEqual(["dismissed"]);
  });

  it("records granted on success", async () => {
    pushStatus.permission = "granted";
    const answered = await mountCard(async () => true);

    expect(readPushPromptDecision()).toBe("granted");
    expect(answered).toEqual(["granted"]);
  });
});
