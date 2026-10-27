import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  NotificationPushStatusNotice,
  NotificationSyncNotice,
  isPushUnavailable,
  pushUnavailableMessage,
  type PushStatusSnapshot,
} from "../src/features/settings/components/NotificationSyncNotice";

/**
 * C-04/C-03 honesty: a synced server preference is not a promise that the OS
 * will display anything. A browser-blocked/unsupported/not-connected device
 * must never render "Saved to your account" as the only status.
 */
const baseProps = {
  status: "synced" as const,
  errorCode: null,
  canAdoptServer: false,
  pushUnavailable: false,
  pushUnavailableMessage: null,
  usingDefaults: false,
  onRetry: () => undefined,
  onAdoptServer: () => undefined,
};

describe("push availability honesty", () => {
  it("detects browser-blocked, unsupported, and granted-but-not-connected states", () => {
    const denied: PushStatusSnapshot = {
      enabled: true,
      permission: "denied",
      listenerAttached: false,
    };
    const unsupported: PushStatusSnapshot = {
      enabled: true,
      permission: "unsupported",
      listenerAttached: false,
    };
    const grantedNoListener: PushStatusSnapshot = {
      enabled: true,
      permission: "granted",
      listenerAttached: false,
    };
    const undecided: PushStatusSnapshot = {
      enabled: true,
      permission: "default",
      listenerAttached: false,
    };
    const disabled: PushStatusSnapshot = {
      enabled: false,
      permission: "denied",
      listenerAttached: false,
    };

    expect(isPushUnavailable(denied)).toBe(true);
    expect(isPushUnavailable(unsupported)).toBe(true);
    expect(isPushUnavailable(grantedNoListener)).toBe(true);
    expect(isPushUnavailable(undecided)).toBe(false);
    expect(isPushUnavailable(disabled)).toBe(false);
    expect(pushUnavailableMessage(denied)).toContain("blocked");
    expect(pushUnavailableMessage(undecided)).toBeNull();
  });

  it("does not claim 'Saved to your account' when push is blocked", () => {
    const status: PushStatusSnapshot = {
      enabled: true,
      permission: "denied",
      listenerAttached: false,
    };
    const message = pushUnavailableMessage(status);
    const html = renderToStaticMarkup(
      <NotificationSyncNotice
        {...baseProps}
        pushUnavailable={isPushUnavailable(status)}
        pushUnavailableMessage={message}
      />,
    );
    expect(html).toContain("blocked");
    expect(html).not.toContain("Saved to your account");
  });

  it("still shows 'Saved to your account' when push is available", () => {
    const status: PushStatusSnapshot = {
      enabled: true,
      permission: "granted",
      listenerAttached: true,
    };
    const html = renderToStaticMarkup(
      <NotificationSyncNotice
        {...baseProps}
        pushUnavailable={isPushUnavailable(status)}
        pushUnavailableMessage={pushUnavailableMessage(status)}
      />,
    );
    expect(html).toContain("Saved to your account");
    expect(html).not.toContain("blocked");
  });

  it("renders the blocked notice for denied permission and nothing while undecided", () => {
    const denied = renderToStaticMarkup(
      <NotificationPushStatusNotice
        status={{ enabled: true, permission: "denied", listenerAttached: false }}
      />,
    );
    expect(denied).toContain("blocked");

    const undecided = renderToStaticMarkup(
      <NotificationPushStatusNotice
        status={{ enabled: true, permission: "default", listenerAttached: false }}
      />,
    );
    expect(undecided).toBe("");
  });
});

describe("never-saved defaults honesty", () => {
  it("renders default-settings copy, not 'Saved to your account'", () => {
    const html = renderToStaticMarkup(
      <NotificationSyncNotice
        {...baseProps}
        status="idle"
        usingDefaults
      />,
    );
    expect(html).toContain("Using default notification settings");
    expect(html).not.toContain("Saved to your account");
  });
});
