/** @vitest-environment jsdom */
/**
 * Hardware BACK on Android: the EMULATOR audit (2026-11-26) pressed BACK on
 * both first screens and nothing happened — no in-app navigation, no exit.
 *
 * These tests pin the decision table and the side effects of the handler that
 * `mobileBootstrap` registers on the Capacitor App plugin. No device is
 * involved: the router history and the plugin are injected.
 */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  EXIT_ARM_WINDOW_MS,
  decideBackAction,
  dismissOpenOverlay,
  findOpenOverlay,
  initAndroidBackButton,
  isEntryPath,
  normalisePath,
  type AppPluginLike,
  type BackAction,
  type BackDecisionInput,
} from "./androidBackButton";

const base: BackDecisionInput = {
  hasOpenOverlay: false,
  canGoBack: true,
  pathname: "/menu",
  armedAt: null,
  now: 1000,
};

function decide(overrides: Partial<BackDecisionInput>): BackAction {
  return decideBackAction({ ...base, ...overrides });
}

describe("decideBackAction — overlay first, then history, then exit", () => {
  it("closes an open sheet/modal before touching history, even on an entry screen", () => {
    expect(decide({ hasOpenOverlay: true, canGoBack: true, pathname: "/menu" })).toBe(
      "close-overlay",
    );
    expect(decide({ hasOpenOverlay: true, canGoBack: false, pathname: "/home" })).toBe(
      "close-overlay",
    );
    expect(decide({ hasOpenOverlay: true, canGoBack: false, pathname: "/" })).toBe("close-overlay");
  });

  it("pops router history from a sub-route", () => {
    expect(decide({ pathname: "/cart", canGoBack: true })).toBe("history-back");
    expect(decide({ pathname: "/menu/product/burger", canGoBack: true })).toBe("history-back");
  });

  it("goes home instead of terminating when a sub-route has no history", () => {
    // Deep link / cold start: the WebView is the first entry of the stack.
    expect(decide({ pathname: "/orders/ord_1/track", canGoBack: false })).toBe("go-home");
  });

  it("arms exit on an entry screen and exits only on the second press", () => {
    expect(decide({ pathname: "/home", canGoBack: false })).toBe("arm-exit");
    expect(decide({ pathname: "/home", canGoBack: false, armedAt: 1000, now: 1000 + 200 })).toBe(
      "exit",
    );
  });
  it("disarms the exit press once the window has passed", () => {
    expect(
      decide({
        pathname: "/home",
        canGoBack: false,
        armedAt: 1000,
        now: 1000 + EXIT_ARM_WINDOW_MS + 1,
      }),
    ).toBe("arm-exit");
  });

  it("treats every real entry screen as an entry screen", () => {
    expect(isEntryPath("/")).toBe(true);
    expect(isEntryPath("/home")).toBe(true);
    expect(isEntryPath("/splash")).toBe(true);
    // Trailing slash and query/fragment are not a new entry state.
    expect(isEntryPath("/home/")).toBe(true);
    expect(normalisePath("/home?from=app#top")).toBe("/home");
    expect(isEntryPath(normalisePath("/home?from=app"))).toBe(true);
    // A store selection screen is a sub-route: BACK must navigate, not exit.
    expect(isEntryPath("/stores")).toBe(false);
    expect(decide({ pathname: "/stores", canGoBack: false })).toBe("go-home");
  });
});

describe("findOpenOverlay / dismissOpenOverlay", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("ignores a mounted-but-closed vaul drawer", () => {
    document.body.innerHTML =
      '<div data-vaul-drawer data-state="closed"><div role="dialog" data-state="closed"></div></div>';
    expect(findOpenOverlay(document)).toBeNull();
  });

  it("finds an open Radix dialog and closes it through its own close button", () => {
    document.body.innerHTML = `
      <div role="dialog" data-state="open" aria-modal="true">
        <button aria-label="Close">x</button>
      </div>`;
    const overlay = findOpenOverlay(document);
    expect(overlay).not.toBeNull();

    const button = overlay!.querySelector("button")!;
    const click = vi.spyOn(button, "click");
    expect(dismissOpenOverlay(window, overlay!)).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("falls back to Escape when the overlay has no close button", () => {
    document.body.innerHTML = '<div role="dialog" data-state="open"></div>';
    const seen = vi.fn();
    window.addEventListener("keydown", seen, { once: true });
    dismissOpenOverlay(window, findOpenOverlay(document)!);
    expect(seen).toHaveBeenCalledTimes(1);
    expect((seen.mock.calls[0][0] as KeyboardEvent).key).toBe("Escape");
  });

  it("lets a component cancel the hardware-back event instead of Escape", () => {
    document.body.innerHTML = '<div role="dialog" data-state="open"></div>';
    const overlay = findOpenOverlay(document)!;
    const escape = vi.fn();
    window.addEventListener("keydown", escape, { once: true });
    overlay.addEventListener("burg:hardware-back", (event) => event.preventDefault(), {
      once: true,
    });

    expect(dismissOpenOverlay(window, overlay)).toBe(true);
    expect(escape).not.toHaveBeenCalled();
  });

  it("ignores a hidden or aria-hidden overlay", () => {
    document.body.innerHTML = `
      <div role="dialog" data-state="open" aria-hidden="true"></div>
      <div role="dialog" data-state="open" hidden></div>`;
    expect(findOpenOverlay(document)).toBeNull();
  });
});

describe("initAndroidBackButton — the listener actually registered on the shell", () => {
  type Listener = (event: { canGoBack: boolean }) => void;
  let registered: Listener | null;
  let exitApp: Mock<() => void>;
  let back: Mock<() => void>;
  let goHome: Mock<() => void>;
  let removeListener: Mock<() => void>;

  const app: AppPluginLike = {
    addListener: (_event, listener) => {
      registered = listener as Listener;
      return Promise.resolve({ remove: () => removeListener() });
    },
    exitApp: () => exitApp(),
  };

  beforeEach(() => {
    registered = null;
    exitApp = vi.fn<() => void>();
    back = vi.fn<() => void>();
    goHome = vi.fn<() => void>();
    removeListener = vi.fn<() => void>();
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "#/home");
    Object.defineProperty(window, "Capacitor", {
      configurable: true,
      value: { getPlatform: () => "android", isNativePlatform: () => true },
    });
  });

  const press = (canGoBack: boolean) => registered?.({ canGoBack });

  it("is a no-op in the browser", () => {
    Object.defineProperty(window, "Capacitor", {
      configurable: true,
      value: { getPlatform: () => "web", isNativePlatform: () => false },
    });
    initAndroidBackButton({ app, history: { back, goHome } });
    expect(registered).toBeNull();
  });

  it("is a no-op on iOS (the platform owns its own swipe-back)", () => {
    Object.defineProperty(window, "Capacitor", {
      configurable: true,
      value: { getPlatform: () => "ios", isNativePlatform: () => true },
    });
    initAndroidBackButton({ app, history: { back, goHome } });
    expect(registered).toBeNull();
  });

  it("navigates back on a sub-route", () => {
    initAndroidBackButton({ app, history: { back, goHome } });
    window.history.replaceState({}, "", "#/menu");
    press(true);
    expect(back).toHaveBeenCalledTimes(1);
    expect(exitApp).not.toHaveBeenCalled();
  });

  it("arms exit, then exits on the second press at an entry screen", () => {
    initAndroidBackButton({ app, history: { back, goHome } });
    window.history.replaceState({}, "", "#/home");

    press(false);
    expect(back).not.toHaveBeenCalled();
    expect(exitApp).not.toHaveBeenCalled();

    press(false);
    expect(exitApp).toHaveBeenCalledTimes(1);
  });

  it("never exits while a sheet is open — it dismisses the sheet", () => {
    initAndroidBackButton({ app, history: { back, goHome } });
    window.history.replaceState({}, "", "#/home");
    document.body.innerHTML = '<div role="dialog" data-state="open"></div>';

    press(false);
    press(false);

    expect(exitApp).not.toHaveBeenCalled();
    expect(findOpenOverlay(document)).not.toBeNull();
  });

  it("survives a shell where the App plugin throws on registration", () => {
    const throwing: AppPluginLike = {
      addListener: () => {
        throw new Error("App plugin not synced");
      },
    };
    expect(() => initAndroidBackButton({ app: throwing, history: { back, goHome } })).not.toThrow();
  });

  it("goes home through the router, then pops router history on BACK", () => {
    // r2 regression: the old handler called history.pushState({}, "", "#/home"),
    // which wiped TanStack's idx/key/__TSR_index. A router-owned goHome writes
    // those fields itself, so the next BACK still sees a usable router stack.
    const goHome = vi.fn<() => void>(() => {
      window.history.replaceState({ idx: 0, key: "home", __TSR_index: 0 }, "", "#/home");
    });
    const back = vi.fn<() => void>(() => {
      window.history.replaceState({ idx: 0, key: "home", __TSR_index: 0 }, "", "#/home");
    });
    const canGoBack = () => ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;
    const pushState = vi.spyOn(window.history, "pushState");
    initAndroidBackButton({ app, history: { back, canGoBack, goHome } });

    // Deep link lands on a sub-route with no router history behind it.
    window.history.replaceState({ idx: 0, key: "deep", __TSR_index: 0 }, "", "#/orders/ord_1");
    press(false);
    expect(goHome).toHaveBeenCalledTimes(1);
    expect(pushState).not.toHaveBeenCalled();
    expect(exitApp).not.toHaveBeenCalled();

    // The router navigates to a sub-route and writes its own history state.
    window.history.replaceState({ idx: 1, key: "menu", __TSR_index: 1 }, "", "#/menu");
    press(false);
    expect(back).toHaveBeenCalledTimes(1);
    pushState.mockRestore();
  });

  it("removes the App listener when the root tears down", async () => {
    const dispose = initAndroidBackButton({ app, history: { back, goHome } });
    await Promise.resolve();
    await Promise.resolve();
    expect(removeListener).not.toHaveBeenCalled();

    dispose();
    expect(removeListener).toHaveBeenCalledTimes(1);
  });
});
