// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Connectivity contract for `useOnlineStatus` and the `isOnline` initial value.
 *
 * Scope: promise/event ordering, resume re-probing, failure fallback and
 * cleanup. Nothing here claims endpoint reachability — `Network.connected`
 * means an active connection, not a healthy backend — and no UI or CSS is
 * involved.
 *
 * Native is simulated the way the app's own platform helper reads it
 * (`window.Capacitor`), and the ONE mocked boundary is our own typed loader
 * `@/shared/platform/networkClient` — not the vendor module registry. The
 * zustand store and all hook logic are REAL: ordering bugs only appear in real
 * state transitions.
 *
 * React is driven with `createRoot` + `act`, matching the existing hook tests in
 * this folder (no testing-library in this project).
 */
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/** Controllable Network client double, returned from the loader seam. */
const { network, loader } = vi.hoisted(() => {
  const network = {
    probes: [] as Array<{
      resolve: (value: { connected: boolean }) => void;
      reject: (reason: unknown) => void;
    }>,
    statusCalls: 0,
    listeners: [] as Array<(status: { connected: boolean }) => void>,
    /** Every addListener invocation, including ones that reject. */
    addListenerCalls: 0,
    handles: [] as Array<{ remove: ReturnType<typeof vi.fn> }>,
    /** When set, `addListener` returns this promise instead of a settled handle. */
    lateHandle: null as null | Promise<{ remove: () => Promise<void> }>,
    importFails: false,
    /** Native bridges can throw synchronously instead of rejecting. */
    getStatusThrows: false,
    /** Listener registration can fail on its own, independently of probing. */
    addListenerRejects: false,
    /** Shared call log, so listener-before-probe ORDER can be asserted. */
    callLog: [] as string[],
    /** Make getStatus resolve a non-boolean payload (item 4). */
    nonBooleanStatus: false,
    /**
     * Optional per-case observable: resolved inside the mock `addListener` when
     * the REAL hook calls it. Set by the StrictMode case only; reset per case.
     */
    onListener: null as null | (() => void),
  };

  /**
   * The single loader double for this file: it hands back the controllable
   * client, or rejects when `importFails` is set so the "plugin unavailable"
   * path stays testable.
   *
   * Cases needing a GATED loader live in
   * `useOnlineStatus.import-lifecycle.test.tsx`, so no custom loader override
   * happens here.
   */
  const loader = {
    loadNativeNetworkClient: () => {
      if (network.importFails) {
        return Promise.reject(new Error("Network plugin unavailable"));
      }
      return Promise.resolve({
        getStatus: () => {
          network.statusCalls += 1;
          network.callLog.push("getStatus");
          if (network.getStatusThrows) {
            // A native bridge can throw synchronously rather than reject; the
            // hook must treat both the same way.
            throw new Error("native bridge threw synchronously");
          }
          if (network.nonBooleanStatus) {
            // Item 4: a bridge can answer with a non-boolean `connected`.
            return Promise.resolve({ connected: "yes" as unknown as boolean });
          }
          return new Promise((resolve, reject) => {
            network.probes.push({ resolve, reject });
          });
        },
        addListener: (
          _event: string,
          listener: (status: { connected: boolean }) => void,
        ) => {
          network.addListenerCalls += 1;
          network.callLog.push("addListener");
          network.listeners.push(listener);
          // Observable proof that the real hook reached this mock.
          network.onListener?.();
          network.onListener = null;
          if (network.addListenerRejects) {
            return Promise.reject(new Error("listener registration failed"));
          }
          if (network.lateHandle) return network.lateHandle;
          const handle = { remove: vi.fn(async () => undefined) };
          network.handles.push(handle);
          return Promise.resolve(handle);
        },
      });
    },
  };

  return { network, loader };
});

// The ONLY mocked boundary: our typed loader, not the vendor module registry.
vi.mock("@/shared/platform/networkClient", () => loader);

/** The synthetic Capacitor global this suite installs (no SDK ambient types). */
interface FixtureCapacitor {
  isNativePlatform: () => boolean;
  getPlatform: () => string;
}

function setNative(native: boolean): void {
  (window as unknown as { Capacitor?: FixtureCapacitor }).Capacitor = {
    isNativePlatform: () => native,
    getPlatform: () => (native ? "android" : "web"),
  };
}

/** Read the currently installed fixture bridge (typed, no ambient SDK global). */
function fixtureCapacitor(): FixtureCapacitor | undefined {
  return (window as unknown as { Capacitor?: FixtureCapacitor }).Capacitor;
}

/** Set navigator.onLine, returning a restore function. */
function setNavigatorOnline(value: boolean): () => void {
  const original = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value });
  return () => {
    // Restore the descriptor if there was one, otherwise DELETE the temporary
    // own property — leaving it behind would leak the value into later cases.
    if (original) Object.defineProperty(window.navigator, "onLine", original);
    else Reflect.deleteProperty(window.navigator, "onLine");
  };
}

/** Let queued promise callbacks run inside act(). */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/**
 * Let the mocked loader's resolved promise reach the hook's `then` handler.
 *
 * The seam resolves with an ordinary promise (no module resolution), so a few
 * microtask turns inside `act` are sufficient and deterministic. No timers, no
 * polling, no fake-clock interaction.
 */
async function settleReleasedImport(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
}

/** Resolve the Nth probe with a connection value. */
async function resolveProbe(index: number, connected: boolean): Promise<void> {
  const probe = network.probes[index];
  if (!probe) throw new Error(`no getStatus probe at index ${index}`);
  await act(async () => {
    probe.resolve({ connected });
    await Promise.resolve();
  });
}

/** Reject the Nth probe, as a real plugin failure would. */
async function rejectProbe(index: number): Promise<void> {
  const probe = network.probes[index];
  if (!probe) throw new Error(`no getStatus probe at index ${index}`);
  await act(async () => {
    probe.reject(new Error("plugin failure"));
    await Promise.resolve();
  });
}

function resetNetwork(): void {
  network.probes = [];
  network.statusCalls = 0;
  network.listeners = [];
  network.addListenerCalls = 0;
  network.handles = [];
  network.lateHandle = null;
  network.importFails = false;
  network.getStatusThrows = false;
  network.addListenerRejects = false;
  network.callLog = [];
  network.nonBooleanStatus = false;
  network.onListener = null;
}

/** Fresh modules so module-level state cannot leak between tests. */
async function load() {
  vi.resetModules();
  const { useAppConfig } = await import("@/core/state/appConfigStore");
  const { useOnlineStatus } = await import("@/shared/hooks/useOnlineStatus");
  return { useAppConfig, useOnlineStatus };
}

function Mount({ hook }: { hook: () => void }): null {
  hook();
  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

/** Mount the hook and return an unmount function. */
async function mountHook(hook: () => void): Promise<() => void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<Mount hook={hook} />);
  });
  await flush();
  return () => {
    act(() => root!.unmount());
    root = null;
    container?.remove();
    container = null;
  };
}

beforeEach(() => {
  resetNetwork();
  setNative(true);
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
});

describe("initial isOnline value", () => {
  it("native starts false so PAY is not enabled before the first probe", async () => {
    setNative(true);
    const { useAppConfig } = await load();
    // "Connectivity not yet confirmed", not an offline claim. The first native
    // probe owns the flag from here on.
    expect(useAppConfig.getState().isOnline).toBe(false);
  });

  it("native boot is unconfirmed, not observed offline", async () => {
    setNative(true);
    const { useAppConfig } = await load();
    // The startup-UX contract: a cold start must not look like an observed
    // disconnection, otherwise the banner claims offline and then emits a
    // spurious "Back online" toast when the first probe answers true.
    expect(useAppConfig.getState().isOnline).toBe(false);
    expect(useAppConfig.getState().connectionStatusKnown).toBe(false);
  });

  it("web boot is already known from navigator.onLine", async () => {
    setNative(false);
    const restore = setNavigatorOnline(true);
    try {
      const { useAppConfig } = await load();
      expect(useAppConfig.getState().isOnline).toBe(true);
      expect(useAppConfig.getState().connectionStatusKnown).toBe(true);
    } finally {
      restore();
    }
  });

  it("browser keeps navigator.onLine when offline", async () => {
    setNative(false);
    const restore = setNavigatorOnline(false);
    try {
      const { useAppConfig } = await load();
      expect(useAppConfig.getState().isOnline).toBe(false);
    } finally {
      restore();
    }
  });

  it("browser keeps navigator.onLine when online", async () => {
    setNative(false);
    const restore = setNavigatorOnline(true);
    try {
      const { useAppConfig } = await load();
      expect(useAppConfig.getState().isOnline).toBe(true);
    } finally {
      restore();
    }
  });
});

describe("probe/event ordering", () => {
  it("a delayed getStatus cannot overwrite a newer listener event", async () => {
    const { useAppConfig, useOnlineStatus } = await load();
    await mountHook(useOnlineStatus);

    // Listener first, then the current-status probe.
    expect(network.listeners.length).toBe(1);
    expect(network.statusCalls).toBe(1);
    // Still unconfirmed until authoritative evidence arrives.
    expect(useAppConfig.getState().connectionStatusKnown).toBe(false);

    await act(async () => {
      network.listeners[0]({ connected: true });
      await Promise.resolve();
    });
    expect(useAppConfig.getState().isOnline).toBe(true);
    // First valid native signal marks connectivity as observed.
    expect(useAppConfig.getState().connectionStatusKnown).toBe(true);

    // Stale probe now resolves the opposite way: must be ignored.
    await resolveProbe(0, false);
    expect(useAppConfig.getState().isOnline).toBe(true);
    expect(useAppConfig.getState().connectionStatusKnown).toBe(true);
  });

  it("a valid native probe alone marks connectivity known", async () => {
    const { useAppConfig, useOnlineStatus } = await load();
    await mountHook(useOnlineStatus);
    expect(useAppConfig.getState().connectionStatusKnown).toBe(false);

    await resolveProbe(0, true);
    expect(useAppConfig.getState().isOnline).toBe(true);
    expect(useAppConfig.getState().connectionStatusKnown).toBe(true);
  });

  it("a disconnect event after a connected probe still wins", async () => {
    const { useAppConfig, useOnlineStatus } = await load();
    await mountHook(useOnlineStatus);

    await resolveProbe(0, true);
    expect(useAppConfig.getState().isOnline).toBe(true);

    await act(async () => {
      network.listeners[0]({ connected: false });
      await Promise.resolve();
    });
    expect(useAppConfig.getState().isOnline).toBe(false);
  });

  it("overlapping resume probes: only the newest may write", async () => {
    const { useAppConfig, useOnlineStatus } = await load();
    await mountHook(useOnlineStatus);
    await resolveProbe(0, true);

    // Two resume signals in quick succession => two more in-flight probes.
    await act(async () => {
      window.dispatchEvent(new CustomEvent("burg:appstate", { detail: { isActive: true } }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      window.dispatchEvent(new CustomEvent("burg:appstate", { detail: { isActive: true } }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(network.statusCalls).toBe(3);

    // Newest resolves first (online), then the older one contradicts it. The
    // out-of-order settling is what "overlapping" means here.
    await resolveProbe(2, true);
    await resolveProbe(1, false);
    expect(useAppConfig.getState().isOnline).toBe(true);
  });
});

describe("resume signals", () => {
  it("burg:appstate isActive true re-probes", async () => {
    const { useOnlineStatus } = await load();
    await mountHook(useOnlineStatus);
    const before = network.statusCalls;

    await act(async () => {
      window.dispatchEvent(new CustomEvent("burg:appstate", { detail: { isActive: true } }));
      await Promise.resolve();
    });
    expect(network.statusCalls).toBe(before + 1);
  });

  it("burg:appstate isActive false does not probe", async () => {
    const { useOnlineStatus } = await load();
    await mountHook(useOnlineStatus);
    const before = network.statusCalls;

    await act(async () => {
      window.dispatchEvent(new CustomEvent("burg:appstate", { detail: { isActive: false } }));
      await Promise.resolve();
    });
    expect(network.statusCalls).toBe(before);
  });

  it("web visibilitychange to visible re-reads navigator", async () => {
    setNative(false);
    const restore = setNavigatorOnline(true);
    try {
      const { useAppConfig, useOnlineStatus } = await load();
      await mountHook(useOnlineStatus);
      expect(useAppConfig.getState().isOnline).toBe(true);

      // On web, navigator.onLine is authoritative — no plugin probe is involved,
      // so the observable effect is the state following the browser's view.
      const restoreOffline = setNavigatorOnline(false);
      try {
        await act(async () => {
          Object.defineProperty(document, "visibilityState", {
            configurable: true,
            value: "visible",
          });
          document.dispatchEvent(new Event("visibilitychange"));
          await Promise.resolve();
        });
        expect(useAppConfig.getState().isOnline).toBe(false);
      } finally {
        restoreOffline();
      }
      // No native probe was issued on the web path.
      expect(network.statusCalls).toBe(0);
    } finally {
      restore();
    }
  });
});

describe("failure fallback", () => {
  it("a rejected stale probe neither throws nor clobbers a newer event", async () => {
    const { useAppConfig, useOnlineStatus } = await load();
    await mountHook(useOnlineStatus);

    await act(async () => {
      network.listeners[0]({ connected: true });
      await Promise.resolve();
    });
    expect(useAppConfig.getState().isOnline).toBe(true);

    await rejectProbe(0);
    expect(useAppConfig.getState().isOnline).toBe(true);
  });

  it("a rejected resume probe falls back to navigator evidence", async () => {
    const { useAppConfig, useOnlineStatus } = await load();
    await mountHook(useOnlineStatus);
    await resolveProbe(0, true);

    const restore = setNavigatorOnline(false);
    try {
      await act(async () => {
        window.dispatchEvent(new CustomEvent("burg:appstate", { detail: { isActive: true } }));
        await Promise.resolve();
      });
      await rejectProbe(1);
      expect(useAppConfig.getState().isOnline).toBe(false);
    } finally {
      restore();
    }
  });

  it("a plugin import rejection falls back to browser evidence", async () => {
    network.importFails = true;
    const { useAppConfig, useOnlineStatus } = await load();
    // Start from an unconfirmed native state, as a real cold start does.
    expect(useAppConfig.getState().connectionStatusKnown).toBe(false);

    const restore = setNavigatorOnline(true);
    try {
      await mountHook(useOnlineStatus);
      // Active-connection evidence only; this is not an Internet claim.
      expect(useAppConfig.getState().isOnline).toBe(true);
      // Weak evidence must NOT mark connectivity as authoritative/observed.
      expect(useAppConfig.getState().connectionStatusKnown).toBe(false);
    } finally {
      restore();
    }
  });

  it("a plugin import rejection with no active connection reports offline evidence", async () => {
    network.importFails = true;
    const restore = setNavigatorOnline(false);
    try {
      const { useAppConfig, useOnlineStatus } = await load();
      await mountHook(useOnlineStatus);
      // navigator says there is no active connection at all.
      expect(useAppConfig.getState().isOnline).toBe(false);
    } finally {
      restore();
    }
  });
});

describe("browser events on native", () => {
  it("a browser 'online' event probes instead of forcing a confirmed native false", async () => {
    const { useAppConfig, useOnlineStatus } = await load();
    await mountHook(useOnlineStatus);
    await resolveProbe(0, false);
    expect(useAppConfig.getState().isOnline).toBe(false);

    const restore = setNavigatorOnline(true);
    const before = network.statusCalls;
    try {
      await act(async () => {
        window.dispatchEvent(new Event("online"));
        await Promise.resolve();
      });
      // Asked the plugin rather than trusting the browser heuristic.
      expect(network.statusCalls).toBe(before + 1);
      expect(useAppConfig.getState().isOnline).toBe(false);
    } finally {
      restore();
    }
  });
});

describe("cleanup", () => {
  it("unmount removes the listener exactly once", async () => {
    const { useOnlineStatus } = await load();
    const unmount = await mountHook(useOnlineStatus);
    expect(network.handles.length).toBe(1);

    unmount();
    await flush();
    expect(network.handles[0].remove).toHaveBeenCalledTimes(1);
  });

  it("unmount AFTER addListener but BEFORE its promise resolves still removes once", async () => {
    // The real late-handle case: the plugin WAS called, so it holds a listener,
    // but the handle promise has not settled when the component unmounts.
    let settle: (handle: { remove: () => Promise<void> }) => void = () => {};
    const remove = vi.fn(async () => undefined);
    network.lateHandle = new Promise((resolve) => {
      settle = resolve;
    });

    const { useAppConfig, useOnlineStatus } = await load();
    const unmount = await mountHook(useOnlineStatus);
    expect(network.listeners.length).toBe(1);

    unmount();

    // No write may land after unmount.
    await act(async () => {
      network.listeners[0]({ connected: true });
      await Promise.resolve();
    });
    expect(useAppConfig.getState().isOnline).toBe(false);

    // The handle finally arrives and must be removed exactly once.
    await act(async () => {
      settle({ remove });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe("non-browser / missing navigator.onLine", () => {
  it("stays a boolean true when navigator exists but onLine is undefined", async () => {
    // Node (>=21) ships a builtin navigator with no `onLine`, so
    // `typeof navigator === "undefined"` is false while the property is
    // `undefined` — a naive initialiser would store undefined in a bool field.
    setNative(false);
    const original = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: undefined,
    });
    try {
      const { useAppConfig } = await load();
      expect(typeof useAppConfig.getState().isOnline).toBe("boolean");
      expect(useAppConfig.getState().isOnline).toBe(true);
    } finally {
      if (original) Object.defineProperty(window.navigator, "onLine", original);
      else Reflect.deleteProperty(window.navigator, "onLine");
    }
  });

  it("stays a boolean true with no window at all (SSR)", async () => {
    setNative(false);
    const realWindow = globalThis.window;
    // Simulate SSR for a fresh module evaluation: no DOM, no window.
    vi.stubGlobal("window", undefined);
    try {
      const { useAppConfig } = await load();
      expect(typeof useAppConfig.getState().isOnline).toBe("boolean");
      expect(useAppConfig.getState().isOnline).toBe(true);
      // Non-browser: no native shell, so nothing is pending observation.
      expect(useAppConfig.getState().connectionStatusKnown).toBe(true);
    } finally {
      vi.stubGlobal("window", realWindow);
    }
  });
});

// ---------------------------------------------------------------------------
// CURRENT-SOURCE BOUNDARY TESTS — expected to FAIL until the hook is fixed.
//
// Two verified defects plus three robustness cases. They are deliberately
// written against the shipped hook; the parent runs RED, then authorises the
// minimal correction in the same hook/store.
// ---------------------------------------------------------------------------

describe("BOUNDARY: recoverable plugin initialisation", () => {
  it("BUG 1: a resume re-probes after the initial plugin import failed", async () => {
    // Initial import fails (plugin not synced yet, bridge not ready).
    network.importFails = true;
    const restore = setNavigatorOnline(true);
    try {
      const { useAppConfig, useOnlineStatus } = await load();
      await mountHook(useOnlineStatus);

      // Only weak browser evidence so far; connectivity unconfirmed.
      expect(useAppConfig.getState().connectionStatusKnown).toBe(false);

      // The plugin becomes usable afterwards (a real recovery path).
      network.importFails = false;
      const before = network.statusCalls;

      await act(async () => {
        window.dispatchEvent(new CustomEvent("burg:appstate", { detail: { isActive: true } }));
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      // A resume probe must issue a REAL getStatus, not keep writing the
      // browser fallback forever.
      expect(network.statusCalls).toBe(before + 1);
      await resolveProbe(0, true);
      expect(useAppConfig.getState().isOnline).toBe(true);
      // Authoritative native evidence marks connectivity observed.
      expect(useAppConfig.getState().connectionStatusKnown).toBe(true);
    } finally {
      restore();
    }
  });

  it("a rejected listener registration is retried on resume and then stays authoritative", async () => {
    // Registration fails at mount, so no listener exists yet.
    network.addListenerRejects = true;
    const { useAppConfig, useOnlineStatus } = await load();
    await mountHook(useOnlineStatus);

    expect(network.addListenerCalls).toBe(1);
    expect(network.handles.length).toBe(0);

    // The initial probe can still land, but nothing is subscribed to changes.
    await resolveProbe(0, true);
    expect(useAppConfig.getState().isOnline).toBe(true);

    // The plugin becomes usable. A resume must retry the REGISTRATION, not just
    // the probe, or change events stay lost for the life of the screen.
    network.addListenerRejects = false;
    await act(async () => {
      window.dispatchEvent(new CustomEvent("burg:appstate", { detail: { isActive: true } }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(network.addListenerCalls).toBe(2);
    expect(network.handles.length).toBe(1);

    // The newly registered listener is authoritative.
    await act(async () => {
      network.listeners[network.listeners.length - 1]({ connected: false });
      await Promise.resolve();
    });
    expect(useAppConfig.getState().isOnline).toBe(false);
    expect(useAppConfig.getState().connectionStatusKnown).toBe(true);

    // Later resumes must never register a duplicate listener.
    await act(async () => {
      window.dispatchEvent(new CustomEvent("burg:appstate", { detail: { isActive: true } }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(network.addListenerCalls).toBe(2);
    expect(network.handles.length).toBe(1);
  });
});

describe("BOUNDARY: weak evidence cannot override confirmed native state", () => {
  it("BUG 2: a confirmed native false is not flipped true by a rejected resume probe", async () => {
    const { useAppConfig, useOnlineStatus } = await load();
    await mountHook(useOnlineStatus);

    // Authoritative native evidence: offline.
    await resolveProbe(0, false);
    expect(useAppConfig.getState().isOnline).toBe(false);
    expect(useAppConfig.getState().connectionStatusKnown).toBe(true);

    // Browser now thinks there is an active connection, and the resume probe
    // fails, so only weak evidence is available.
    const restore = setNavigatorOnline(true);
    try {
      await act(async () => {
        window.dispatchEvent(new CustomEvent("burg:appstate", { detail: { isActive: true } }));
        await Promise.resolve();
        await Promise.resolve();
      });
      await rejectProbe(1);

      // Weak, contradictory evidence must NOT re-enable PAY: the confirmed
      // native state still owns the flag.
      expect(useAppConfig.getState().isOnline).toBe(false);
      expect(useAppConfig.getState().connectionStatusKnown).toBe(true);
    } finally {
      restore();
    }
  });

  it("weak offline evidence may disable while unconfirmed, without claiming native truth", async () => {
    // Sanity anchor for the guard's shape: before any authoritative evidence,
    // a browser "no active connection" may conservatively disable ordering —
    // but it must not claim connectivity was observed.
    const restore = setNavigatorOnline(false);
    try {
      const { useAppConfig, useOnlineStatus } = await load();
      await mountHook(useOnlineStatus);

      expect(useAppConfig.getState().isOnline).toBe(false);
      expect(useAppConfig.getState().connectionStatusKnown).toBe(false);
    } finally {
      restore();
    }
  });
});

describe("BOUNDARY: hostile plugin surfaces", () => {
  it("a synchronous throw from getStatus is handled and does not escape", async () => {
    const { useAppConfig, useOnlineStatus } = await load();
    network.getStatusThrows = true;

    const restore = setNavigatorOnline(true);
    try {
      // Mounting must not throw out of the effect.
      const unmount = await mountHook(useOnlineStatus);
      unmount();

      await flush();
      // Falls back to browser evidence; nothing was observed natively.
      expect(useAppConfig.getState().isOnline).toBe(true);
      expect(useAppConfig.getState().connectionStatusKnown).toBe(false);
    } finally {
      restore();
    }
  });

  it("a rejected listener registration still allows a later bounded resume probe", async () => {
    const { useAppConfig, useOnlineStatus } = await load();
    network.addListenerRejects = true;

    await mountHook(useOnlineStatus);
    // Registration failed, so no handle exists, but the initial probe still ran.
    expect(network.handles.length).toBe(0);
    expect(network.statusCalls).toBe(1);

    // The initial probe is still usable.
    await resolveProbe(0, true);
    expect(useAppConfig.getState().isOnline).toBe(true);

    // A resume must still be able to probe even without a listener.
    const before = network.statusCalls;
    await act(async () => {
      window.dispatchEvent(new CustomEvent("burg:appstate", { detail: { isActive: true } }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(network.statusCalls).toBe(before + 1);
  });

  it("a newer listener event during an awaiting dynamic-import probe is never overwritten", async () => {
    const { useAppConfig, useOnlineStatus } = await load();
    await mountHook(useOnlineStatus);

    // A resume probe is issued but stays pending across the dynamic import.
    await act(async () => {
      window.dispatchEvent(new CustomEvent("burg:appstate", { detail: { isActive: true } }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(network.statusCalls).toBe(2);

    // Newer authoritative event arrives first.
    await act(async () => {
      network.listeners[0]({ connected: true });
      await Promise.resolve();
    });
    expect(useAppConfig.getState().isOnline).toBe(true);

    // The older in-flight probe now fails: its weak fallback must not win.
    await rejectProbe(1);
    expect(useAppConfig.getState().isOnline).toBe(true);
    expect(useAppConfig.getState().connectionStatusKnown).toBe(true);
  });
});

describe("single mount owner", () => {
  it("useOnlineStatus is called once across src/routes, from __root only", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const routesDir = path.resolve(__dirname, "..", "..", "routes");
    const offenders: string[] = [];

    async function walk(dir: string): Promise<void> {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
          continue;
        }
        if (!/[.]tsx?$/.test(entry.name) || /[.]test[.]tsx?$/.test(entry.name)) continue;
        const text = await fs.readFile(full, "utf8");
        if (/useOnlineStatus\(\)/.test(text) && path.basename(full) !== "__root.tsx") {
          offenders.push(path.relative(routesDir, full));
        }
      }
    }

    await walk(routesDir);
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Round 3b — item 3 test strengthening + item 2/4 + H1/H2 contract.
// Written against current source: the item 2/4/H1 cases are expected RED.
// ---------------------------------------------------------------------------

describe("3b: browser evidence is recorded, never overriding native truth", () => {
  it("records browser offline evidence while unconfirmed", async () => {
    const { useAppConfig, useOnlineStatus } = await load();
    const restore = setNavigatorOnline(false);
    try {
      await mountHook(useOnlineStatus);
      await flush();
      // Weak evidence is stored for the shared predicate…
      expect(useAppConfig.getState().browserOnlineEvidence).toBe(false);
      // …but it never claims the state was observed.
      expect(useAppConfig.getState().connectionStatusKnown).toBe(false);
    } finally {
      restore();
    }
  });

  it("a browser 'online' event updates browser evidence without overriding native false", async () => {
    const { useAppConfig, useOnlineStatus } = await load();
    const restore = setNavigatorOnline(true);
    try {
      await mountHook(useOnlineStatus);
      await resolveProbe(0, false);
      expect(useAppConfig.getState().isOnline).toBe(false);
      expect(useAppConfig.getState().connectionStatusKnown).toBe(true);

      await act(async () => {
        window.dispatchEvent(new Event("online"));
        await Promise.resolve();
        await Promise.resolve();
      });

      // Authoritative native false still owns `isOnline`.
      expect(useAppConfig.getState().isOnline).toBe(false);
      // The browser's own view is still recorded.
      expect(useAppConfig.getState().browserOnlineEvidence).toBe(true);
    } finally {
      restore();
    }
  });
});

describe("3b: nativeOnline — a weak true is refused only against native false", () => {
  it("keeps a confirmed native false through a weak browser true", async () => {
    const { useAppConfig, useOnlineStatus } = await load();
    await mountHook(useOnlineStatus);
    await resolveProbe(0, false);

    const restore = setNavigatorOnline(true);
    try {
      await act(async () => {
        useAppConfig.getState().setOnlineFromBrowserEvidence(true);
        await Promise.resolve();
      });
      // Weak optimism must not re-enable ordering after native said offline.
      expect(useAppConfig.getState().isOnline).toBe(false);
      expect(useAppConfig.getState().connectionStatusKnown).toBe(true);
    } finally {
      restore();
    }
  });

  it("allows a weak browser true when native last said online", async () => {
    const { useAppConfig, useOnlineStatus } = await load();
    await mountHook(useOnlineStatus);
    await resolveProbe(0, true);

    const restore = setNavigatorOnline(true);
    try {
      await act(async () => {
        useAppConfig.getState().setOnlineFromBrowserEvidence(false);
        useAppConfig.getState().setOnlineFromBrowserEvidence(true);
        await Promise.resolve();
      });
      // Native's last word was online, so the weak recovery is accepted.
      expect(useAppConfig.getState().isOnline).toBe(true);
    } finally {
      restore();
    }
  });

  it("a weak false may still disable after a native online", async () => {
    const { useAppConfig, useOnlineStatus } = await load();
    await mountHook(useOnlineStatus);
    await resolveProbe(0, true);

    await act(async () => {
      useAppConfig.getState().setOnlineFromBrowserEvidence(false);
      await Promise.resolve();
    });
    expect(useAppConfig.getState().isOnline).toBe(false);
  });

  it("recording the browser's offline view alone cannot claim a native change", async () => {
    // Confirm native online, then a browser `offline` signal arrives. The
    // browser view must be recorded WITHOUT touching the native verdict: only a
    // failing probe or the deadline may weaken it.
    const { useAppConfig, useOnlineStatus } = await load();
    await mountHook(useOnlineStatus);
    await resolveProbe(0, true);
    expect(useAppConfig.getState().isOnline).toBe(true);
    expect(useAppConfig.getState().connectionStatusKnown).toBe(true);
    expect(useAppConfig.getState().lastConfirmedOnline).toBe(true);

    const probesBefore = network.statusCalls;
    const restore = setNavigatorOnline(false);
    try {
      await act(async () => {
        window.dispatchEvent(new Event("offline"));
        await Promise.resolve();
        await Promise.resolve();
      });

      // The browser view is recorded…
      expect(useAppConfig.getState().browserOnlineEvidence).toBe(false);
      // …but the confirmed native verdict still stands.
      expect(useAppConfig.getState().isOnline).toBe(true);
      expect(useAppConfig.getState().connectionStatusKnown).toBe(true);
      expect(useAppConfig.getState().lastConfirmedOnline).toBe(true);
      // Exactly one probe was issued for the signal (no double-probe).
      expect(network.statusCalls).toBe(probesBefore + 1);
    } finally {
      restore();
    }
  });
});

describe("3b: item 4 — unvalidated plugin payloads", () => {
  it("a non-boolean provided getStatus payload takes the failure path", async () => {
    network.nonBooleanStatus = true;
    const { useAppConfig, useOnlineStatus } = await load();
    const restore = setNavigatorOnline(true);
    try {
      await mountHook(useOnlineStatus);
      await flush();
      await flush();
      // Weak evidence only: a malformed answer is not authoritative.
      expect(useAppConfig.getState().connectionStatusKnown).toBe(false);
    } finally {
      restore();
    }
  });

  it("ignores a non-boolean listener payload", async () => {
    const { useAppConfig, useOnlineStatus } = await load();
    await mountHook(useOnlineStatus);
    await resolveProbe(0, true);
    expect(useAppConfig.getState().isOnline).toBe(true);

    await act(async () => {
      network.listeners[0]({ connected: "nope" as unknown as boolean });
      await Promise.resolve();
    });
    // The malformed event must not flip the confirmed value.
    expect(useAppConfig.getState().isOnline).toBe(true);
  });
});

describe("3b: H1 — one bounded deadline per probe", () => {
  it("writes weak evidence when a probe never settles", async () => {
    vi.useFakeTimers();
    try {
      const { useAppConfig, useOnlineStatus } = await load();
      const restore = setNavigatorOnline(false);
      try {
        await act(async () => {
          // Mount without letting microtasks race the fake clock.
          await mountHook(useOnlineStatus);
        });

        // Still unconfirmed: the probe has not answered.
        expect(useAppConfig.getState().connectionStatusKnown).toBe(false);

        await act(async () => {
          vi.advanceTimersByTime(5000);
        });

        // Deadline expiry writes only weak browser evidence.
        expect(useAppConfig.getState().browserOnlineEvidence).toBe(false);
        expect(useAppConfig.getState().connectionStatusKnown).toBe(false);
      } finally {
        restore();
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels the deadline on a newer revision so it cannot write late", async () => {
    vi.useFakeTimers();
    try {
      const { useAppConfig, useOnlineStatus } = await load();
      const restore = setNavigatorOnline(true);
      try {
        await act(async () => {
          await mountHook(useOnlineStatus);
        });
        await resolveProbe(0, false);
        expect(useAppConfig.getState().isOnline).toBe(false);
        expect(useAppConfig.getState().connectionStatusKnown).toBe(true);

        // A resume issues a newer probe; the OLD deadline must not fire later
        // and resurrect weak browser evidence over the confirmed value.
        await act(async () => {
          window.dispatchEvent(new CustomEvent("burg:appstate", { detail: { isActive: true } }));
          await Promise.resolve();
          await Promise.resolve();
          await Promise.resolve();
        });
        await act(async () => {
          vi.advanceTimersByTime(5000);
          await Promise.resolve();
        });

        // The confirmed native false still owns the flag.
        expect(useAppConfig.getState().isOnline).toBe(false);
        expect(useAppConfig.getState().connectionStatusKnown).toBe(true);
      } finally {
        restore();
      }
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("3b: item 3 — ordering, fences and lifecycle", () => {
  it("registers the listener before probing", async () => {
    const { useOnlineStatus } = await load();
    await mountHook(useOnlineStatus);
    await flush();

    // ORDER, not counts: the first listener registration precedes the probe.
    const firstListener = network.callLog.indexOf("addListener");
    const firstProbe = network.callLog.indexOf("getStatus");
    expect(firstListener).toBeGreaterThanOrEqual(0);
    expect(firstProbe).toBeGreaterThanOrEqual(0);
    expect(firstListener).toBeLessThan(firstProbe);
  });

  it("a probe resolving after unmount writes nothing", async () => {
    const { useAppConfig, useOnlineStatus } = await load();
    const unmount = await mountHook(useOnlineStatus);
    const before = useAppConfig.getState();

    unmount();
    await act(async () => {
      network.probes[0].resolve({ connected: true });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(useAppConfig.getState().isOnline).toBe(before.isOnline);
    expect(useAppConfig.getState().connectionStatusKnown).toBe(before.connectionStatusKnown);
  });

  it("a probe rejecting after unmount writes nothing", async () => {
    const { useAppConfig, useOnlineStatus } = await load();
    const unmount = await mountHook(useOnlineStatus);
    const before = useAppConfig.getState();

    unmount();
    await act(async () => {
      network.probes[0].reject(new Error("late failure"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(useAppConfig.getState().isOnline).toBe(before.isOnline);
    expect(useAppConfig.getState().connectionStatusKnown).toBe(before.connectionStatusKnown);
  });

  it("StrictMode mount registers one live handle and removes it once", async () => {
    const { useAppConfig, useOnlineStatus } = await load();
    // Observable: resolves inside the mock addListener when the hook calls it.
    let signalListener: () => void = () => {};
    const listenerCalled = new Promise<void>((resolve) => {
      signalListener = resolve;
    });
    network.onListener = signalListener;
    try {
      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);
      await act(async () => {
        root!.render(
          <React.StrictMode>
            <Mount hook={useOnlineStatus} />
          </React.StrictMode>,
        );
      });
      // Await the ACTUAL mock call, not a module-settlement heuristic.
      await act(async () => {
        await listenerCalled;
      });

      // The synthetic native global must survive settlement.
      expect(fixtureCapacitor()?.isNativePlatform()).toBe(true);

      const liveHandles = network.handles.filter((h) => h.remove.mock.calls.length === 0);
      expect(network.handles.length).toBeGreaterThanOrEqual(1);
      // Exactly one listener survives StrictMode's mount/unmount/mount cycle.
      expect(liveHandles.length).toBe(1);
      // At most one registration is ever live at a time.
      expect(network.addListenerCalls).toBeLessThanOrEqual(2);
      // Registering a listener is NOT evidence of connectivity. The mocked
      // getStatus returns a PENDING promise and no listener event has fired, so
      // a native cold start MUST stay unconfirmed.
      expect(useAppConfig.getState().connectionStatusKnown).toBe(false);

      act(() => root!.unmount());
      root = null;
      await settleReleasedImport();
      // Every handle created was cleaned up exactly once.
      for (const handle of network.handles) {
        expect(handle.remove).toHaveBeenCalledTimes(1);
      }
    } finally {
      // Nothing diagnostic to restore; the module-level mock stays as declared.
    }
  });

  it("native visibilitychange and pageshow re-probe", async () => {
    const { useOnlineStatus } = await load();
    await mountHook(useOnlineStatus);
    // The resume path re-imports; settle it with the documented primitive.
    await settleReleasedImport();
    const before = network.statusCalls;

    await act(async () => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await settleReleasedImport();
    expect(network.statusCalls).toBe(before + 1);

    await act(async () => {
      window.dispatchEvent(new Event("pageshow"));
    });
    await settleReleasedImport();
    expect(network.statusCalls).toBe(before + 2);
  });

  it("the browser offline signal on native re-probes rather than writing blindly", async () => {
    const { useAppConfig, useOnlineStatus } = await load();
    await mountHook(useOnlineStatus);
    await settleReleasedImport();
    await resolveProbe(0, true);
    expect(useAppConfig.getState().isOnline).toBe(true);

    const restore = setNavigatorOnline(false);
    const before = network.statusCalls;
    try {
      await act(async () => {
        window.dispatchEvent(new Event("offline"));
      });
      await settleReleasedImport();
      // It asked the plugin instead of trusting the browser alone.
      expect(network.statusCalls).toBe(before + 1);
    } finally {
      restore();
    }
  });

  it("the root route is the single mount owner and no other src file calls the hook", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const srcDir = path.resolve(__dirname, "..", "..");
    const rootFile = path.join(srcDir, "routes", "__root.tsx");
    const hookModule = path.join(srcDir, "shared", "hooks", "useOnlineStatus.ts");
    const callers: string[] = [];

    async function walk(dir: string): Promise<void> {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
          continue;
        }
        if (!/[.]tsx?$/.test(entry.name) || /[.]test[.]tsx?$/.test(entry.name)) continue;
        // The hook's own module declares the function; a declaration is not a
        // mount. Skip it so the scan measures CALL SITES only.
        if (full === hookModule) continue;

        const text = await fs.readFile(full, "utf8");
        // Calls only: `useOnlineStatus()` as an expression, not the
        // `export function useOnlineStatus()` declaration.
        if (/(?<!function\s)(?<!function)useOnlineStatus\(\)/.test(text)) {
          callers.push(full);
        }
      }
    }

    await walk(srcDir);
    // Exactly one call site across all of src, and it is the root route.
    expect(callers).toEqual([rootFile]);

    // Strict presence: the root route really does mount it.
    const rootText = await fs.readFile(rootFile, "utf8");
    expect(rootText).toMatch(/useOnlineStatus\(\)/);
  });
});
