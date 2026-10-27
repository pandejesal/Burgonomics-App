import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

/**
 * C-06 (accepted contract) - the web-push service worker is the last place a
 * background tap reaches `clients.openWindow`. The shipped SW no longer routes
 * from attacker-controlled `deeplink`/`ticketId`/`orderId` fields: account
 * notifications open `/profile/notifications?ref=<inbox id>` and the app
 * resolves the real order/ticket target after auth. Public offers and
 * announcements keep public destinations, and there is no "/" fallback.
 *
 * The SW cannot import app modules (classic worker, served from /public), so
 * these tests run the REAL file inside a vm sandbox with stubbed SW globals.
 * A regression in the shipped file fails here - no copy of the logic to drift.
 */

const SW_PATH = fileURLToPath(new URL("../public/firebase-messaging-sw.js", import.meta.url));
const ORIGIN = "https://app.burgonomics.test";
const CENTRE = `${ORIGIN}/profile/notifications`;

interface Sandbox {
  listeners: Record<string, (event: any) => void>;
  openWindow: any;
  showNotification: any;
  matchAll: any;
  initializeApp: any;
  messaging: any;
  windows: Array<{ url: string; focus: any }>;
}

function loadWorker(windowUrls: string[] = []): Sandbox {
  const listeners: Record<string, (event: any) => void> = {};
  const windows = windowUrls.map((url) => ({ url, focus: vi.fn(async () => undefined) }));
  const openWindow = vi.fn(async (_url: string) => undefined);
  const showNotification = vi.fn(async () => undefined);
  const matchAll = vi.fn(async () => windows);
  const initializeApp = vi.fn();
  const messaging = vi.fn(() => ({}));

  const sandbox: any = {
    console,
    URL,
    encodeURIComponent,
    setTimeout,
    clearTimeout,
    importScripts(url: string) {
      if (url.includes("firebase-app-compat")) {
        sandbox.firebase = { initializeApp, messaging };
      }
    },
  };
  sandbox.self = sandbox;
  sandbox.location = { origin: ORIGIN };
  sandbox.registration = { showNotification };
  sandbox.clients = { matchAll, openWindow };
  sandbox.addEventListener = (type: string, handler: (event: any) => void) => {
    listeners[type] = handler;
  };

  vm.createContext(sandbox);
  vm.runInContext(readFileSync(SW_PATH, "utf8"), sandbox, { filename: SW_PATH });

  return {
    listeners,
    openWindow,
    showNotification,
    matchAll,
    initializeApp,
    messaging,
    windows,
  };
}

/** Runs notificationclick and resolves the registered waitUntil promise. */
async function click(worker: Sandbox, data: Record<string, unknown>) {
  let pending: Promise<unknown> | undefined;
  const event = {
    notification: { close: vi.fn(), data },
    stopImmediatePropagation: vi.fn(),
    waitUntil: (p: Promise<unknown>) => {
      pending = p;
    },
  };
  worker.listeners.notificationclick(event);
  expect(pending).toBeDefined();
  await pending;
  return event;
}

/** SDK background notifications wrap the FCM data under `FCM_MSG`. */
function sdkData(data: Record<string, unknown>) {
  return { FCM_MSG: { data } };
}

describe("firebase-messaging-sw notificationclick (C-06)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores a hostile deeplink and opens the notification centre", async () => {
    const worker = loadWorker();
    await click(worker, {
      deeplink: "https://evil.example/login",
      orderId: "ord_private",
      ticketId: "tkt_private",
    });

    expect(worker.openWindow).toHaveBeenCalledTimes(1);
    expect(worker.openWindow.mock.calls[0][0]).toBe(CENTRE);
    expect(worker.openWindow.mock.calls[0][0]).not.toContain("evil.example");
    expect(worker.openWindow.mock.calls[0][0]).not.toContain("ord_private");
    expect(worker.openWindow.mock.calls[0][0]).not.toContain("tkt_private");
  });

  it("ignores protocol-relative and backslash deeplinks", async () => {
    const worker = loadWorker();
    await click(worker, { deeplink: "//evil.example/x" });
    expect(worker.openWindow.mock.calls[0][0]).toBe(CENTRE);

    worker.openWindow.mockClear();
    await click(worker, { deeplink: "/\\evil.example" });
    expect(worker.openWindow.mock.calls[0][0]).toBe(CENTRE);
  });

  it("ignores non-path schemes (javascript:, data:)", async () => {
    const worker = loadWorker();
    await click(worker, { deeplink: "javascript:alert(1)" });
    expect(worker.openWindow.mock.calls[0][0]).toBe(CENTRE);

    worker.openWindow.mockClear();
    await click(worker, { deeplink: "data:text/html,<h1>pwned</h1>" });
    expect(worker.openWindow.mock.calls[0][0]).toBe(CENTRE);
  });

  it("focuses an existing notification-centre window by absolute Client.url", async () => {
    const worker = loadWorker([`${CENTRE}?ref=ref_abc`]);
    await click(worker, { ref: "ref_abc" });

    expect(worker.windows[0].focus).toHaveBeenCalledTimes(1);
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it("ignores a legacy orderId and routes a ref to the centre", async () => {
    const worker = loadWorker();
    await click(worker, { orderId: "ord_9" });
    expect(worker.openWindow.mock.calls[0][0]).toBe(CENTRE);

    worker.openWindow.mockClear();
    await click(worker, { ref: "ref_order", orderId: "ord_9/../../evil" });
    expect(worker.openWindow.mock.calls[0][0]).toBe(`${CENTRE}?ref=ref_order`);
    expect(worker.openWindow.mock.calls[0][0]).not.toContain("ord_9");
  });

  it("never focuses a same-path window on another origin", async () => {
    const worker = loadWorker(["https://evil.example/profile/notifications?ref=ref_abc"]);
    await click(worker, { ref: "ref_abc" });

    expect(worker.windows[0].focus).not.toHaveBeenCalled();
    expect(worker.openWindow.mock.calls[0][0]).toBe(`${CENTRE}?ref=ref_abc`);
  });

  it("routes a support ref to the centre (the app resolves the ticket after auth)", async () => {
    const worker = loadWorker();
    await click(worker, { ref: "tkt_42" });
    expect(worker.openWindow.mock.calls[0][0]).toBe(`${CENTRE}?ref=tkt_42`);

    worker.openWindow.mockClear();
    // Legacy ticketId is untrusted wire data and must not become a route.
    await click(worker, { ticketId: "tkt_42" });
    expect(worker.openWindow.mock.calls[0][0]).toBe(CENTRE);

    worker.openWindow.mockClear();
    await click(worker, { ref: "bad id/../evil" });
    expect(worker.openWindow.mock.calls[0][0]).toBe(CENTRE);
  });

  it("reads ref from the SDK-wrapped FCM data shape", async () => {
    const worker = loadWorker();
    await click(worker, sdkData({ ref: "ref_sdk", orderId: "ord_secret" }));

    expect(worker.openWindow.mock.calls[0][0]).toBe(`${CENTRE}?ref=ref_sdk`);
    expect(worker.openWindow.mock.calls[0][0]).not.toContain("ord_secret");
  });

  it("routes public offers and announcements to their public pages", async () => {
    const offers = loadWorker();
    await click(offers, { purpose: "offers" });
    expect(offers.openWindow.mock.calls[0][0]).toBe(`${ORIGIN}/offers`);

    const announcements = loadWorker();
    await click(announcements, { purpose: "announcements" });
    expect(announcements.openWindow.mock.calls[0][0]).toBe(`${ORIGIN}/home`);
  });

  it("focuses the existing centre tab for a payload with no routing data", async () => {
    const worker = loadWorker([CENTRE]);
    await click(worker, {});

    expect(worker.windows[0].focus).toHaveBeenCalledTimes(1);
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it("never falls back to the site root", async () => {
    const worker = loadWorker();
    await click(worker, { purpose: "unknown", deeplink: "/", ref: "" });
    expect(worker.openWindow).toHaveBeenCalledTimes(1);
    expect(worker.openWindow.mock.calls[0][0]).toBe(CENTRE);
    expect(worker.openWindow.mock.calls[0][0]).not.toBe(`${ORIGIN}/`);
  });

  it("does not throw at install time when firebase config fails", () => {
    expect(() => {
      const sandbox: any = {
        console,
        URL,
        encodeURIComponent,
        importScripts(url: string) {
          if (url.includes("firebase-app-compat")) {
            sandbox.firebase = {
              initializeApp: () => {
                throw new Error("bad config");
              },
              messaging: vi.fn(),
            };
          }
        },
      };
      sandbox.self = sandbox;
      sandbox.location = { origin: ORIGIN };
      // Real service workers always provide addEventListener; the accepted SW
      // registers notificationclick before the initializeApp try block.
      sandbox.addEventListener = vi.fn();
      vm.createContext(sandbox);
      vm.runInContext(readFileSync(SW_PATH, "utf8"), sandbox, { filename: SW_PATH });
    }).not.toThrow();
  });
});
