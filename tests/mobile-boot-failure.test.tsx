/** @vitest-environment jsdom */
/**
 * Device startup regression: the QA APK (com.burgonomics.devicetest, built
 * without .env / google-services) fails the Firebase fail-closed import. The
 * native splash is configured `launchAutoHide: false`, and the only caller of
 * `SplashScreen.hide()` lives in `bootstrapNativePlatform()` — which runs only
 * AFTER a successful boot import. Result on the SM-S921B: ConfigErrorScreen
 * rendered underneath a splash that never went away.
 *
 * These tests import the entry module itself (side-effect import) so they pin
 * the real ordering rather than a reimplementation: the error screen must be
 * committed to the DOM BEFORE the splash is hidden, and a synchronous throw
 * from `boot()` must land on the same path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bootModule = vi.hoisted(() => ({ boot: vi.fn() }));
const splashModule = vi.hoisted(() => ({ hide: vi.fn() }));

vi.mock("@capacitor/splash-screen", () => ({ SplashScreen: { hide: splashModule.hide } }));

/** Let the entry's fire-and-forget async IIFE finish (import + microtasks). */
const settle = async (): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

async function importEntry(): Promise<void> {
  vi.resetModules();
  await import("../src/mobile-entry");
  await settle();
}

function useNativeAndroid(): void {
  Object.defineProperty(window, "Capacitor", {
    configurable: true,
    value: { getPlatform: () => "android", isNativePlatform: () => true },
  });
}

function useBrowser(): void {
  delete (window as { Capacitor?: unknown }).Capacitor;
}

function alertText(): string | null {
  return document.querySelector('[role="alert"]')?.textContent ?? null;
}

describe("mobile entry — bootstrap failure must reveal the error screen", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    bootModule.boot.mockReset();
    splashModule.hide.mockReset();
    splashModule.hide.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete (window as { Capacitor?: unknown }).Capacitor;
    vi.doUnmock("../src/boot");
  });

  it("renders the error screen and hides the splash after React mounts (native, rejected boot import)", async () => {
    useNativeAndroid();
    // Records whether the error screen was already in the DOM at hide time.
    const alertVisibleAtHide: boolean[] = [];
    splashModule.hide.mockImplementation(async () => {
      alertVisibleAtHide.push(document.querySelector('[role="alert"]') !== null);
    });
    vi.doMock("../src/boot", () => {
      throw new Error("Firebase: no default app available");
    });

    await importEntry();

    // The rejection reason itself comes from the module registry, so assert
    // the screen that is presented rather than its technical-details string.
    expect(alertText()).toContain("The app could not start");
    expect(splashModule.hide).toHaveBeenCalledTimes(1);
    expect(splashModule.hide).toHaveBeenCalledWith({ fadeOutDuration: 250 });
    // Ordering: mount first, reveal second.
    expect(alertVisibleAtHide).toEqual([true]);
  });

  it("catches a synchronous throw from boot() and reveals the error screen (native)", async () => {
    useNativeAndroid();
    bootModule.boot.mockImplementation(() => {
      throw new Error("App Check plugin failed to load");
    });
    vi.doMock("../src/boot", () => ({ boot: bootModule.boot }));
    const alertVisibleAtHide: boolean[] = [];
    splashModule.hide.mockImplementation(async () => {
      alertVisibleAtHide.push(document.querySelector('[role="alert"]') !== null);
    });

    await importEntry();

    expect(bootModule.boot).toHaveBeenCalledTimes(1);
    expect(alertText()).toContain("App Check plugin failed to load");
    expect(splashModule.hide).toHaveBeenCalledTimes(1);
    expect(alertVisibleAtHide).toEqual([true]);
  });

  it("leaves browser behaviour unchanged (error screen shown, no splash plugin use)", async () => {
    useBrowser();
    vi.doMock("../src/boot", () => {
      throw new Error("missing configuration");
    });

    await importEntry();

    expect(alertText()).toContain("The app could not start");
    expect(splashModule.hide).not.toHaveBeenCalled();
  });

  it("keeps the error screen visible when the splash plugin itself rejects", async () => {
    useNativeAndroid();
    splashModule.hide.mockRejectedValue(new Error("SplashScreen.hide not implemented"));
    vi.doMock("../src/boot", () => {
      throw new Error("Firebase: no default app available");
    });

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      await importEntry();
      await settle();
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }

    expect(alertText()).toContain("The app could not start");
    expect(unhandled).toEqual([]);
  });

  it("does not double-run the healthy boot path (one boot call, no error screen, splash untouched)", async () => {
    useNativeAndroid();
    vi.doMock("../src/boot", () => ({ boot: bootModule.boot }));

    await importEntry();

    expect(bootModule.boot).toHaveBeenCalledTimes(1);
    expect(bootModule.boot).toHaveBeenCalledWith(document.getElementById("app"));
    expect(document.querySelector('[role="alert"]')).toBeNull();
    // Splash hiding stays owned by bootstrapNativePlatform on the success path.
    expect(splashModule.hide).not.toHaveBeenCalled();
  });

  it("keeps the splash up (no blank WebView) when the error screen cannot be rendered", async () => {
    useNativeAndroid();
    const { revealBootstrapFailure } = await import("../src/shared/platform/bootstrapFailure");

    // Not a DOM element: createRoot throws before anything is presented.
    await revealBootstrapFailure({} as HTMLElement, new Error("boom"));

    expect(splashModule.hide).not.toHaveBeenCalled();
  });
});
