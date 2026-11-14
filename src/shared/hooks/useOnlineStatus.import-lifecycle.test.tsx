// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Import-lifecycle contract for `useOnlineStatus`.
 *
 * These cases gate OUR typed loader (`@/shared/platform/networkClient`) rather
 * than the vendor module registry, so the controlled client can be withheld
 * without touching `@capacitor/network` or `window.Capacitor` at all.
 *
 * That boundary matters: earlier attempts mocked the vendor module and used a
 * test-side `import("@capacitor/network")`, which let the real `@capacitor/core`
 * initialise and replace the synthetic global. Replacing the loader removes that
 * whole class of interference, so no module-registry mocking is needed here.
 */

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/** Counters the controlled clients record into, reset per case. */
const state = vi.hoisted(() => ({
  issued: [] as Array<{ resolve: (v: { connected: boolean }) => void }>,
  addListenerCalls: 0,
  getStatusCalls: 0,
}));

/** A plain client, used when a case does not need a gated one. */
function baseClient() {
  return {
    getStatus: () => Promise.resolve({ connected: true }),
    addListener: () => Promise.resolve({ remove: async () => undefined }),
  };
}

/**
 * Install a GATED loader: it resolves with the built client only after
 * `release()`, and signals `entered`/`settled` so tests await FACTS.
 *
 * This is a loader seam (`vi.doMock` on OUR module), never the SDK registry.
 */
function gatedLoader(build: () => unknown) {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let markEntered: () => void = () => {};
  const entered = new Promise<void>((resolve) => {
    markEntered = resolve;
  });
  let markSettled: () => void = () => {};
  const settled = new Promise<void>((resolve) => {
    markSettled = resolve;
  });

  // The MODULE FACTORY must return synchronously: the hook statically imports
  // this module, so gating the factory would block module evaluation.
  // Only the LOAD FUNCTION is gated — that is the I/O seam under test.
  vi.doMock("@/shared/platform/networkClient", () => ({
    loadNativeNetworkClient: async () => {
      markEntered();
      try {
        await gate;
        return build();
      } finally {
        markSettled();
      }
    },
  }));

  return { entered, settled, release };
}

/**
 * Multi-call controllable loader: each `loadNativeNetworkClient()` invocation
 * gets its own gate, so a test can resolve call 2 before call 1.
 *
 * The module factory returns synchronously (only the load function is gated),
 * and `calls` lets a test assert how many loader invocations actually happened.
 */
function sequencedLoader(build: (index: number) => unknown) {
  const calls: Array<{
    entered: Promise<void>;
    release: () => void;
    settled: Promise<void>;
  }> = [];

  vi.doMock("@/shared/platform/networkClient", () => ({
    loadNativeNetworkClient: async () => {
      const index = calls.length;
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let markEntered: () => void = () => {};
      const entered = new Promise<void>((resolve) => {
        markEntered = resolve;
      });
      let markSettled: () => void = () => {};
      const settled = new Promise<void>((resolve) => {
        markSettled = resolve;
      });
      calls.push({ entered, release, settled });
      markEntered();
      try {
        await gate;
        return build(index);
      } finally {
        markSettled();
      }
    },
  }));

  return { calls };
}

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

function setNavigatorOnline(value: boolean): () => void {
  const original = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value });
  return () => {
    if (original) Object.defineProperty(window.navigator, "onLine", original);
    else Reflect.deleteProperty(window.navigator, "onLine");
  };
}

/** Fresh module graph for this case. */
async function load() {
  vi.resetModules();
  const { useAppConfig } = await import("@/core/state/appConfigStore");
  const { useOnlineStatus } = await import("@/shared/hooks/useOnlineStatus");
  return { useAppConfig, useOnlineStatus };
}

/**
 * Let the gated loader's resolution reach the hook's `then` handler. The seam
 * resolves an ordinary promise (no module resolution), so a few microtask turns
 * inside `act` are deterministic. No timers, no polling.
 */
async function settleReleasedImport(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
}

/**
 * Finish a custom factory: release, wait for real completion, then restore.
 *
 * Restoring before the loader settles would let a late resolution leak into the
 * next case.
 */
async function dispose(
  handle: { settled: Promise<void>; release: () => void },
): Promise<void> {
  handle.release();
  await settleReleasedImport();
  await handle.settled;
  vi.doMock("@/shared/platform/networkClient", () => ({
    loadNativeNetworkClient: async () => baseClient(),
  }));
  vi.resetModules();
}

function Mount({ hook }: { hook: () => void }): null {
  hook();
  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function mountHook(hook: () => void): Promise<() => void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<Mount hook={hook} />);
  });
  return () => {
    act(() => root!.unmount());
    root = null;
    container?.remove();
    container = null;
  };
}

beforeEach(() => {
  state.issued = [];
  state.addListenerCalls = 0;
  state.getStatusCalls = 0;
  setNative(true);
  vi.doMock("@/shared/platform/networkClient", () => ({
    loadNativeNetworkClient: async () => baseClient(),
  }));
  vi.resetModules();
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  vi.useRealTimers();
});

describe("3b: H1 — one bounded deadline per probe", () => {
  it("also covers a never-settling IMPORT, not just a loaded client", async () => {
    // The deadline policy must bound the import too: a plugin whose module never
    // resolves would otherwise leave PAY disabled forever with no evidence.
    vi.useFakeTimers();
    const factory = gatedLoader(() => baseClient());
    // Start with the browser reporting ONLINE, so the expiry assertion cannot
    // pass for free. The navigator flips to offline only AFTER mount, with no
    // browser event, so the only thing that can write it is the deadline.
    const restoreInitial = setNavigatorOnline(true);
    let restoreFlip: (() => void) | null = null;
    try {
      const { useAppConfig } = await load();
      expect(useAppConfig.getState().browserOnlineEvidence).toBe(true);

      const { useOnlineStatus } = await import("@/shared/hooks/useOnlineStatus");
      await act(async () => {
        await mountHook(useOnlineStatus);
      });

      // The import genuinely reached the gated factory and is still pending.
      await factory.entered;
      expect(useAppConfig.getState().connectionStatusKnown).toBe(false);
      expect(useAppConfig.getState().browserOnlineEvidence).toBe(true);

      // Flip the browser's view WITHOUT dispatching an event.
      restoreFlip = setNavigatorOnline(false);
      await act(async () => {
        vi.advanceTimersByTime(5000);
        await Promise.resolve();
        await Promise.resolve();
      });

      // Only the deadline could have written the weak false.
      expect(useAppConfig.getState().browserOnlineEvidence).toBe(false);
      expect(useAppConfig.getState().connectionStatusKnown).toBe(false);
    } finally {
      // Restore in reverse order: the flip first, then the initial value.
      restoreFlip?.();
      restoreInitial();
      factory.release();
      // Real timers are required to await the factory's real completion.
      vi.useRealTimers();
      await dispose(factory);
    }
  });
});

describe("3b: item 3 — ordering, fences and lifecycle", () => {
  it("an import settling after unmount writes nothing and registers no listener", async () => {
    const factory = gatedLoader(() => ({
      getStatus: () => {
        state.getStatusCalls += 1;
        return Promise.resolve({ connected: true });
      },
      addListener: () => {
        state.addListenerCalls += 1;
        return Promise.resolve({ remove: async () => undefined });
      },
    }));
    try {
      const { useAppConfig } = await load();
      const { useOnlineStatus } = await import("@/shared/hooks/useOnlineStatus");
      const unmount = await mountHook(useOnlineStatus);

      // Wait until the hook's import genuinely reached the gated factory…
      await factory.entered;
      // …then unmount while the module is still pending.
      unmount();
      expect(state.addListenerCalls).toBe(0);
      expect(state.getStatusCalls).toBe(0);

      const before = useAppConfig.getState();
      factory.release();
      // Never import the real package here: it initialises @capacitor/core and
      // overwrites window.Capacitor. Settle the hook's own import instead.
      await settleReleasedImport();

      // The late import must not register a listener or issue a probe…
      expect(state.addListenerCalls).toBe(0);
      expect(state.getStatusCalls).toBe(0);
      // …and must not write state.
      expect(useAppConfig.getState().isOnline).toBe(before.isOnline);
      expect(useAppConfig.getState().connectionStatusKnown).toBe(before.connectionStatusKnown);
    } finally {
      await dispose(factory);
    }
  });

  it("overlapping pending imports with a resume in between: only the newest may write", async () => {
    // Observable: resolves inside the mock getStatus when the hook calls it.
    let signalProbe: () => void = () => {};
    const probeIssued = new Promise<void>((resolve) => {
      signalProbe = resolve;
    });
    const factory = gatedLoader(() => ({
      getStatus: () => {
        signalProbe();
        return new Promise<{ connected: boolean }>((resolve) => {
          state.issued.push({ resolve });
        });
      },
      addListener: () => Promise.resolve({ remove: async () => undefined }),
    }));
    try {
      const { useAppConfig } = await load();
      const { useOnlineStatus } = await import("@/shared/hooks/useOnlineStatus");
      await mountHook(useOnlineStatus);

      // The hook's import reached the gated factory.
      await factory.entered;

      // A resume arrives while the import is still gated.
      await act(async () => {
        window.dispatchEvent(new CustomEvent("burg:appstate", { detail: { isActive: true } }));
      });

      factory.release();
      // Never import the real package: it initialises @capacitor/core and
      // replaces window.Capacitor. Settle the hook's own import instead.
      await settleReleasedImport();

      // Await the ACTUAL mock probe call, not a module-settlement heuristic.
      await act(async () => {
        await probeIssued;
      });

      // A real native effect must survive to the gated module and probe.
      expect(fixtureCapacitor()?.isNativePlatform()).toBe(true);
      expect(state.issued.length).toBeGreaterThanOrEqual(1);

      // Newest probe resolves offline…
      await act(async () => {
        state.issued[state.issued.length - 1].resolve({ connected: false });
        await Promise.resolve();
      });
      expect(useAppConfig.getState().isOnline).toBe(false);
      // Still the synthetic native global after settlement.
      expect(fixtureCapacitor()?.isNativePlatform()).toBe(true);

      // …an older, stale one resolving online must not override it.
      if (state.issued.length > 1) {
        await act(async () => {
          state.issued[0].resolve({ connected: true });
          await Promise.resolve();
        });
        expect(useAppConfig.getState().isOnline).toBe(false);
      }
    } finally {
      await dispose(factory);
    }
  });

  it("one 5000ms envelope covers loader + probe, not 5000ms each", async () => {
    // Loader takes 4500 ms, then getStatus NEVER settles. If the loader and the
    // probe each got their own budget the weak fallback would appear at ~9500 ms.
    vi.useFakeTimers();
    const restoreInitial = setNavigatorOnline(true);
    let restoreFlip: (() => void) | null = null;
    /** Factory first, so the holder can reuse the factory's own inferred type. */
    const hangingClient = () => ({
      getStatus: () => new Promise<{ connected: boolean }>(() => {}),
      addListener: () => Promise.resolve({ remove: async () => undefined }),
    });
    /**
     * Holder object, not a bare `let`: a `let` assigned only inside a closure is
     * control-flow narrowed to `null` at the cleanup site (TS2349). A property
     * read is not narrowed that way.
     *
     * The resolver type is `ReturnType<typeof hangingClient>` — the SAME type the
     * promise resolves with — so `remove(): Promise<undefined>` cannot drift into
     * a hand-written `Promise<void>` mismatch (TS2345).
     */
    const loaderDeferred = {
      resolve: null as null | ((client: ReturnType<typeof hangingClient>) => void),
    };
    vi.doMock("@/shared/platform/networkClient", () => ({
      loadNativeNetworkClient: () =>
        new Promise<ReturnType<typeof hangingClient>>((resolve) => {
          loaderDeferred.resolve = (client) => resolve(client);
        }),
    }));
    try {
      const { useAppConfig } = await load();
      expect(useAppConfig.getState().browserOnlineEvidence).toBe(true);

      const { useOnlineStatus } = await import("@/shared/hooks/useOnlineStatus");
      await act(async () => {
        await mountHook(useOnlineStatus);
      });
      // The loader has been issued (still pending).
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(loaderDeferred.resolve).not.toBeNull();

      // Deliver the loader at 4500 ms, then flip the browser view with no event.
      await act(async () => {
        vi.advanceTimersByTime(4500);
      });
      restoreFlip = setNavigatorOnline(false);
      await act(async () => {
        loaderDeferred.resolve?.(hangingClient());
        await Promise.resolve();
      });

      // 500 ms later the TOTAL 5000 ms budget has elapsed.
      await act(async () => {
        vi.advanceTimersByTime(500);
        await Promise.resolve();
        await Promise.resolve();
      });

      // Weak evidence appears, and connectivity stays unconfirmed.
      expect(useAppConfig.getState().browserOnlineEvidence).toBe(false);
      expect(useAppConfig.getState().connectionStatusKnown).toBe(false);
    } finally {
      loaderDeferred.resolve?.(hangingClient());
      restoreFlip?.();
      restoreInitial();
      vi.useRealTimers();
      vi.doMock("@/shared/platform/networkClient", () => ({
        loadNativeNetworkClient: async () => baseClient(),
      }));
      vi.resetModules();
    }
  });

  it("an older loader resolving late must not cancel the newest attempt's deadline", async () => {
    // Two loader calls: mount (call 1) and a resume (call 2). Call 2 resolves
    // first and its probe hangs; call 1 resolves ~1 s later. The deadline that
    // must fire belongs to the NEWEST attempt.
    //
    // The browser starts ONLINE so the expected weak false cannot already be
    // true at the start — that earlier version of this test passed vacuously.
    vi.useFakeTimers();
    const probesIssued: number[] = [];
    const loader = sequencedLoader(() => ({
      getStatus: () => {
        probesIssued.push(probesIssued.length + 1);
        return new Promise<{ connected: boolean }>(() => {});
      },
      addListener: () => Promise.resolve({ remove: async () => undefined }),
    }));
    const restoreInitial = setNavigatorOnline(true);
    let restoreFlip: (() => void) | null = null;
    try {
      const { useAppConfig } = await load();
      // Browser evidence starts TRUE, so a later weak false is a real change.
      expect(useAppConfig.getState().browserOnlineEvidence).toBe(true);

      const { useOnlineStatus } = await import("@/shared/hooks/useOnlineStatus");
      await act(async () => {
        await mountHook(useOnlineStatus);
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(loader.calls.length).toBe(1);

      // Resume issues a second loader call while the first is still pending.
      await act(async () => {
        window.dispatchEvent(new CustomEvent("burg:appstate", { detail: { isActive: true } }));
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(loader.calls.length).toBe(2);

      // Newest loader (call 2) resolves first; its probe hangs.
      await act(async () => {
        loader.calls[1].release();
        await Promise.resolve();
        await Promise.resolve();
      });
      // Exactly one probe, from the newest attempt.
      expect(probesIssued.length).toBe(1);

      // ~1 s later the OLD loader resolves. Its stale `.then` must not touch the
      // newer attempt's deadline, and it must not issue a probe of its own.
      await act(async () => {
        vi.advanceTimersByTime(1000);
        loader.calls[0].release();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(probesIssued.length).toBe(1);

      // Flip the browser view WITHOUT dispatching an event.
      restoreFlip = setNavigatorOnline(false);

      // Immediately before the newest attempt expires the recorded weak view is
      // still TRUE and connectivity is still unconfirmed.
      expect(useAppConfig.getState().browserOnlineEvidence).toBe(true);
      expect(useAppConfig.getState().connectionStatusKnown).toBe(false);
      expect(useAppConfig.getState().lastConfirmedOnline).toBeNull();

      // Advance to 5000 ms measured from the NEWEST attempt (1 s already spent).
      await act(async () => {
        vi.advanceTimersByTime(4000);
        await Promise.resolve();
        await Promise.resolve();
      });

      // The newest deadline fired and wrote weak browser evidence only.
      expect(useAppConfig.getState().browserOnlineEvidence).toBe(false);
      expect(useAppConfig.getState().connectionStatusKnown).toBe(false);
      expect(useAppConfig.getState().lastConfirmedOnline).toBeNull();
    } finally {
      for (const call of loader.calls) call.release();
      restoreFlip?.();
      restoreInitial();
      vi.useRealTimers();
      vi.doMock("@/shared/platform/networkClient", () => ({
        loadNativeNetworkClient: async () => baseClient(),
      }));
      vi.resetModules();
    }
  });
});
