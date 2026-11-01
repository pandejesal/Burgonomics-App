import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * C-06 regression pins for the background service worker.
 *
 * The audit proved a real defect in the old copy: the Firebase SDK already
 * displays a notification payload (@firebase/messaging onPush), so the custom
 * onBackgroundMessage showNotification duplicated it; the SDK's click handler
 * also owns SDK notifications and the old fallback was "/". These assertions
 * keep the fixed surface honest.
 */
const sw = readFileSync(new URL("../public/firebase-messaging-sw.js", import.meta.url), "utf8");

describe("C-06 firebase-messaging-sw audit", () => {
  it("opens the notification centre with ref and never falls back to '/'", () => {
    expect(sw).toContain('"/profile/notifications?ref="');
    expect(sw).toContain('"/profile/notifications"');
    expect(sw).not.toContain('origin + "/"');
    expect(sw).not.toContain('? "/"');
  });

  it("does not duplicate display via onBackgroundMessage/showNotification", () => {
    expect(sw).not.toContain("messaging.onBackgroundMessage(function");
    expect(sw).not.toContain("data: payload.data || {}");
    expect(sw).not.toContain("return self.registration.showNotification(");
  });

  it("does not route from private deeplink/ticket/order fields", () => {
    expect(sw).not.toContain("data.deeplink");
    expect(sw).not.toContain("ticketIdFrom");
    expect(sw).not.toContain("orderIdFrom");
  });

  it("registers the click listener before firebase.messaging()", () => {
    const click = sw.indexOf('addEventListener("notificationclick"');
    const messaging = sw.lastIndexOf("firebase.messaging()");
    expect(click).toBeGreaterThan(-1);
    expect(messaging).toBeGreaterThan(-1);
    expect(click).toBeLessThan(messaging);
  });
});
