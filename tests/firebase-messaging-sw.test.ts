import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

/**
 * F2 (P1 security) — the web-push service worker is the LAST place an
 * attacker-controlled FCM payload reaches `clients.openWindow`. Pre-fix it
 * opened `data.deeplink` verbatim (open redirect / phishing tab), and its
 * "focus an existing tab" comparison compared a RELATIVE target path against
 * `Client.url` (always absolute), so it never matched and every tap opened a
 * duplicate tab.
 *
 * The SW cannot import app modules (classic worker, served from /public), so
 * these tests run the REAL file inside a vm sandbox with stubbed SW globals.
 * A regression in the shipped file fails here — no copy of the logic to drift.
 */

const SW_PATH = fileURLToPath(new URL("../public/firebase-messaging-sw.js", import.meta.url));
const ORIGIN = "https://app.burgonomics.test";

interface Sandbox {
  listeners: Record<string, (event: any) => void>;
  openWindow: any;
  showNotification: any;
  matchAll: any;
  windows: Array<{ url: string; focus: any }>;
}

function loadWorker(windowUrls: string[] = []): Sandbox {
  const listeners: Record<string, (event: any) => void> = {};
  const windows = windowUrls.map((url) => ({ url, focus: vi.fn(async () => undefined) }));
  const openWindow = vi.fn(async (_url: string) => undefined);
  const showNotification = vi.fn(async () => undefined);
  const matchAll = vi.fn(async () => windows);

  const sandbox: any = {
    console,
    URL,
    encodeURIComponent,
    setTimeout,
    clearTimeout,
    importScripts(url: string) {
      if (url.includes("firebase-app-compat")) {
        sandbox.firebase = {
          initializeApp: vi.fn(),
          messaging: () => ({ onBackgroundMessage: vi.fn() }),
        };
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

  return { listeners, openWindow, showNotification, matchAll, windows };
}

/** Runs notificationclick and resolves the registered waitUntil promise. */
async function click(worker: Sandbox, data: Record<string, unknown>) {
  let pending: Promise<unknown> | undefined;
  const event = {
    notification: { close: vi.fn(), data },
    waitUntil: (p: Promise<unknown>) => {
      pending = p;
    },
  };
  worker.listeners.notificationclick(event);
  expect(pending).toBeDefined();
  await pending;
  return event;
}

describe("firebase-messaging-sw notificationclick (F2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an absolute off-origin deeplink and opens the same-origin root", async () => {
    const worker = loadWorker();
    await click(worker, { deeplink: "https://evil.example/login" });

    expect(worker.openWindow).toHaveBeenCalledTimes(1);
    expect(worker.openWindow.mock.calls[0][0]).toBe(`${ORIGIN}/`);
  });

  it("rejects protocol-relative and backslash deeplinks", async () => {
    const worker = loadWorker();
    await click(worker, { deeplink: "//evil.example/x" });
    expect(worker.openWindow.mock.calls[0][0]).toBe(`${ORIGIN}/`);

    worker.openWindow.mockClear();
    await click(worker, { deeplink: "/\\evil.example" });
    expect(worker.openWindow.mock.calls[0][0]).toBe(`${ORIGIN}/`);
  });

  it("rejects non-path schemes (javascript:, data:)", async () => {
    const worker = loadWorker();
    await click(worker, { deeplink: "javascript:alert(1)" });
    expect(worker.openWindow.mock.calls[0][0]).toBe(`${ORIGIN}/`);
  });

  it("focuses an existing window by comparing absolute Client.url to the relative target", async () => {
    const worker = loadWorker([`${ORIGIN}/orders/abc/track`]);
    await click(worker, { deeplink: "/orders/abc/track" });

    expect(worker.windows[0].focus).toHaveBeenCalledTimes(1);
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it("falls back to orderId (regex-validated) when the deeplink is hostile", async () => {
    const worker = loadWorker();
    await click(worker, { deeplink: "https://evil.example", orderId: "ord_9" });
    expect(worker.openWindow.mock.calls[0][0]).toBe(`${ORIGIN}/orders/ord_9/track`);

    worker.openWindow.mockClear();
    await click(worker, { orderId: "ord_9/../../evil" });
    expect(worker.openWindow.mock.calls[0][0]).toBe(`${ORIGIN}/`);
  });

  it("never focuses a same-path window on another origin", async () => {
    const worker = loadWorker(["https://evil.example/orders/abc/track"]);
    await click(worker, { deeplink: "/orders/abc/track" });

    expect(worker.windows[0].focus).not.toHaveBeenCalled();
    expect(worker.openWindow.mock.calls[0][0]).toBe(`${ORIGIN}/orders/abc/track`);
  });

  it("routes ticket pushes to the support path with an encoded id", async () => {
    const worker = loadWorker();
    await click(worker, { ticketId: "tkt_42" });
    expect(worker.openWindow.mock.calls[0][0]).toBe(`${ORIGIN}/support?ticketId=tkt_42`);

    worker.openWindow.mockClear();
    await click(worker, { ticketId: "bad id/../evil" });
    expect(worker.openWindow.mock.calls[0][0]).toBe(`${ORIGIN}/`);
  });

  it("focuses the existing root tab for a payload with no routing data", async () => {
    const worker = loadWorker([`${ORIGIN}/`]);
    await click(worker, {});

    expect(worker.windows[0].focus).toHaveBeenCalledTimes(1);
    expect(worker.openWindow).not.toHaveBeenCalled();
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
              messaging: () => ({ onBackgroundMessage: vi.fn() }),
            };
          }
        },
      };
      sandbox.self = sandbox;
      sandbox.location = { origin: ORIGIN };
      vm.createContext(sandbox);
      vm.runInContext(readFileSync(SW_PATH, "utf8"), sandbox, { filename: SW_PATH });
    }).not.toThrow();
  });
});
