// @vitest-environment jsdom
// MINIMAL REPRODUCER — StrictMode only.
//
// Is "0 mock addListener / 0 mock getStatus" a defect in the REAL hook, or an
// artefact of the existing harness's fresh-module graph (`vi.resetModules`,
// gated factories, getter-factory churn)? Everything here is STATIC: one import
// each of hook and store, and exactly ONE stubbed seam — the typed client
// gateway `@/shared/platform/networkClient`. No vendor-module mock, no registry
// churn, no dynamic import in the test, no platform mock. The REAL platform
// helper reads the synthetic `window.Capacitor` set before mount.
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppConfig } from "@/core/state/appConfigStore";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/** Stable controlled client: controlled handle and controlled probe. */
const net = vi.hoisted(() => {
  const state = {
    addListenerCalls: 0,
    getStatusCalls: 0,
    callLog: [] as string[],
    handles: [] as Array<{ remove: ReturnType<typeof vi.fn> }>,
    resolveProbe: null as null | ((status: { connected: boolean }) => void),
    onListener: null as null | (() => void),
  };
  const Network = {
    addListener: (_event: string, _listener: (status: { connected: boolean }) => void) => {
      state.addListenerCalls += 1;
      state.callLog.push("addListener");
      state.onListener?.();
      state.onListener = null;
      const handle = { remove: vi.fn(async () => undefined) };
      state.handles.push(handle);
      return Promise.resolve(handle);
    },
    getStatus: () => {
      state.getStatusCalls += 1;
      state.callLog.push("getStatus");
      return new Promise<{ connected: boolean }>((resolve) => {
        state.resolveProbe = resolve;
      });
    },
  };
  return { state, Network };
});

// The ONLY stubbed seam: the typed client gateway the hook loads through.
// The hook's own state/revision/ordering logic is untouched and real.
vi.mock("@/shared/platform/networkClient", () => ({
  loadNativeNetworkClient: async () => net.Network,
}));

interface CapacitorGlobal {
  Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
}
const bridge = () => (window as unknown as CapacitorGlobal).Capacitor;
const liveHandles = () => net.state.handles.filter((h) => h.remove.mock.calls.length === 0);

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function MountHook(): null {
  useOnlineStatus();
  return null;
}

/** Arm BEFORE mount: resolves inside the mock `addListener` when the REAL hook calls it. */
function armListenerSignal(): Promise<void> {
  let signal: () => void = () => {};
  const called = new Promise<void>((resolve) => {
    signal = resolve;
  });
  net.state.onListener = signal;
  return called;
}

/** Await the ACTUAL mock call — never a module-settlement heuristic. */
async function mountStrictThenAwaitListener(listenerCalled: Promise<void>): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <React.StrictMode>
        <MountHook />
      </React.StrictMode>,
    );
  });
  await act(async () => {
    await listenerCalled;
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function unmount(): Promise<void> {
  await act(async () => {
    root!.unmount();
  });
  root = null;
  container?.remove();
  container = null;
}

beforeEach(() => {
  net.state.addListenerCalls = 0;
  net.state.getStatusCalls = 0;
  net.state.callLog = [];
  net.state.handles = [];
  net.state.resolveProbe = null;
  net.state.onListener = null;
  (window as unknown as CapacitorGlobal).Capacitor = {
    isNativePlatform: () => true, // bridge must stay true for the whole case
    getPlatform: () => "android",
  };
  // Cold native start: unconfirmed; the browser view stays weak evidence only.
  useAppConfig.setState({
    isOnline: false,
    connectionStatusKnown: false,
    browserOnlineEvidence: true,
  });
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
  delete (window as unknown as CapacitorGlobal).Capacitor;
});

describe("StrictMode minimal reproducer (static imports, stable mock)", () => {
  it("binds one live listener before probing; unknown until the probe answers", async () => {
    await mountStrictThenAwaitListener(armListenerSignal());

    expect(net.state.addListenerCalls).toBeGreaterThanOrEqual(1);
    // Listener-before-probe: the hook's stated ordering contract.
    expect(net.state.callLog.indexOf("addListener")).toBeGreaterThanOrEqual(0);
    expect(net.state.callLog.indexOf("getStatus")).toBeGreaterThanOrEqual(0);
    expect(net.state.callLog.indexOf("addListener")).toBeLessThan(
      net.state.callLog.indexOf("getStatus"),
    );
    expect(bridge()?.isNativePlatform?.()).toBe(true); // survives StrictMode
    // Exactly one live handle survives StrictMode's mount/unmount/mount cycle.
    expect(liveHandles().length).toBe(1);
    // Registering a listener is not connectivity evidence.
    expect(useAppConfig.getState().isOnline).toBe(false);
    expect(useAppConfig.getState().connectionStatusKnown).toBe(false);

    await act(async () => {
      net.state.resolveProbe?.({ connected: true });
      await Promise.resolve();
    });
    expect(useAppConfig.getState().isOnline).toBe(true);
    expect(useAppConfig.getState().connectionStatusKnown).toBe(true);

    await unmount();
    for (const handle of net.state.handles) {
      expect(handle.remove).toHaveBeenCalledTimes(1);
    }
  });

  it("unmount before the probe resolves: handle removed once, no late write", async () => {
    await mountStrictThenAwaitListener(armListenerSignal());
    expect(net.state.getStatusCalls).toBeGreaterThanOrEqual(1);
    expect(liveHandles().length).toBe(1);
    const before = useAppConfig.getState();

    await unmount();
    await act(async () => {
      net.state.resolveProbe?.({ connected: true });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(useAppConfig.getState().isOnline).toBe(before.isOnline);
    expect(useAppConfig.getState().connectionStatusKnown).toBe(before.connectionStatusKnown);
    for (const handle of net.state.handles) {
      expect(handle.remove).toHaveBeenCalledTimes(1);
    }
  });
});
