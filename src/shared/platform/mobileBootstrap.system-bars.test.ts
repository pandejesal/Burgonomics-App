/** @vitest-environment jsdom */
/**
 * Status-bar semantics on Android, reworked after the EMULATOR audit
 * (2026-11-26) found a white-on-white bar on the customer app.
 *
 * The decisive change: the bar is no longer pinned to "light content on the
 * dark green hero". It takes the colour of the *app header surface* and flips
 * icon contrast with the resolved theme (`statusBarChrome.ts`), while the
 * native `res/values{-night}` colours cover the first frame before JS runs.
 *
 * Tests here pin the wiring (which plugin call gets which value, in which
 * order) and that no bar failure can strand the splash or the deep links.
 * Native rendering and real contrast are NOT asserted — no device is involved.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import capacitorConfig from "../../../capacitor.config";

const splashModule = vi.hoisted(() => ({
  hide: vi.fn(async () => undefined),
}));

const statusBarModule = vi.hoisted(() => ({
  setStyle: vi.fn(async () => undefined),
  setBackgroundColor: vi.fn(async () => undefined),
}));

const systemBarsModule = vi.hoisted(() => ({
  setStyle: vi.fn(async () => undefined),
  show: vi.fn(async () => undefined),
  hide: vi.fn(async () => undefined),
}));

const keyboardModule = vi.hoisted(() => ({
  addListener: vi.fn(() => ({ remove: vi.fn() })),
}));

const appModule = vi.hoisted(() => ({
  addListener: vi.fn(() => ({ remove: vi.fn() })),
  minimizeApp: vi.fn(async () => undefined),
}));

const pushModule = vi.hoisted(() => ({
  initPushNotifications: vi.fn(async () => undefined),
}));

vi.mock("@capacitor/splash-screen", () => ({ SplashScreen: { hide: splashModule.hide } }));
vi.mock("@capacitor/status-bar", () => ({
  StatusBar: {
    setStyle: statusBarModule.setStyle,
    setBackgroundColor: statusBarModule.setBackgroundColor,
  },
  Style: { Dark: "DARK", Light: "LIGHT", Default: "DEFAULT" },
}));
vi.mock("@capacitor/core", () => ({
  SystemBars: {
    setStyle: systemBarsModule.setStyle,
    show: systemBarsModule.show,
    hide: systemBarsModule.hide,
  },
  SystemBarsStyle: { Dark: "DARK", Light: "LIGHT", Default: "DEFAULT" },
}));
vi.mock("@capacitor/keyboard", () => ({ Keyboard: keyboardModule }));
vi.mock("@capacitor/app", () => ({ App: appModule }));
vi.mock("./pushNotifications", () => pushModule);

interface StatusBarPluginConfig {
  style?: string;
  backgroundColor?: string;
  overlaysWebView?: boolean;
}

interface SystemBarsPluginConfig {
  style?: string;
  hidden?: boolean;
  insetsHandling?: string;
}

const plugins = (capacitorConfig as { plugins: Record<string, unknown> }).plugins as {
  StatusBar: StatusBarPluginConfig;
  SystemBars: SystemBarsPluginConfig;
  Geolocation?: { permissions?: string[] };
  PushNotifications?: { presentationOptions?: string[] };
};

interface IosShellConfig {
  contentInset?: string;
  limitsNavigationsToAppBoundDomains?: boolean;
  webContentsDebuggingEnabled?: boolean;
}

interface AndroidShellConfig {
  allowMixedContent?: boolean;
  webContentsDebuggingEnabled?: boolean;
}

const iosShell = (capacitorConfig as { ios?: IosShellConfig }).ios ?? {};
const androidShell = (capacitorConfig as { android?: AndroidShellConfig }).android ?? {};

/**
 * Let the fire-and-forget bootstrap work finish, including the first-paint
 * splash release. jsdom has no rAF (no `pretendToBeVisual`), so the release
 * comes from the short no-rAF timer; wait past that.
 */
const settle = async (ms = 600): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
};

function setPlatform(platform: "android" | "ios" | "web"): void {
  if (platform === "web") {
    delete (window as { Capacitor?: unknown }).Capacitor;
    return;
  }
  Object.defineProperty(window, "Capacitor", {
    configurable: true,
    value: { getPlatform: () => platform, isNativePlatform: () => true },
  });
}

async function bootOn(platform: "android" | "ios" | "web"): Promise<void> {
  vi.resetModules();
  setPlatform(platform);
  const { bootstrapNativePlatform } = await import("./mobileBootstrap");
  await bootstrapNativePlatform();
  await settle();
}

describe("capacitor configuration — the bar follows the app theme, not the hero green", () => {
  it("leaves SystemBars on DEFAULT so the device appearance picks the first frame", () => {
    // The native window background (res/values{-night}/colors.xml) is a light
    // #FFFFFF or dark #121212 surface, and DEFAULT asks the plugin to match its
    // icon contrast to that appearance. Pinning DARK is what produced light
    // icons over a light surface whenever app and device themes disagreed.
    expect(plugins.SystemBars.style).toBe("DEFAULT");
    expect(plugins.SystemBars.hidden).toBe(false);
  });

  it("keeps the existing Android inset mode instead of disabling safe-area handling", () => {
    // No explicit value means the plugin default ("css"): native inset padding
    // plus injected --safe-area-inset-* variables. The regression this guards
    // is opting out (`disable`) to dodge the separate upstream null-document
    // error, which would remove safe areas entirely.
    expect(plugins.SystemBars.insetsHandling ?? "css").toBe("css");
    expect(plugins.SystemBars.insetsHandling).not.toBe("disable");
  });

  it("aligns the legacy StatusBar config with the light header surface", () => {
    // DEFAULT follows the device appearance, and with a #FFFFFF bar that means
    // dark icons in light mode. No combination in the config produces light
    // icons on this white bar; the runtime chrome corrects the rare case where
    // the app theme and the device theme disagree.
    expect(plugins.StatusBar.style).toBe("DEFAULT");
    expect(plugins.StatusBar.backgroundColor).toBe("#FFFFFF");
    expect(plugins.StatusBar.overlaysWebView).toBe(false);
  });

  it("keeps the splash off fullscreen/immersive so the bars stay in place", () => {
    // The audit's screenshots showed a dead band at the top right after the
    // immersive splash dismissed. The splash now sits under the normal bars.
    const splash = (capacitorConfig as { plugins: Record<string, Record<string, unknown>> }).plugins
      .SplashScreen;
    expect(splash.splashFullScreen).toBe(false);
    expect(splash.splashImmersive).toBe(false);
    // Splash until the app is ready: no fixed auto-hide timer.
    expect(splash.launchAutoHide).toBe(false);
  });
});

describe("native shell hardening — Web Inspector must be off in every build", () => {
  it("disables iOS web contents debugging explicitly", () => {
    // Without this, Capacitor enables the Web Inspector when DEBUG is set or via
    // the SPM CAPACITOR_DEBUG fallback, leaving inspection to a build-time
    // default. The explicit false removes that implicit path.
    //
    // This is configuration intent, NOT evidence that any previously shipped
    // Release build was inspectable — no such build was inspected.
    expect(iosShell.webContentsDebuggingEnabled).toBe(false);
  });

  it("keeps the Android debugging flag off as well", () => {
    expect(androidShell.webContentsDebuggingEnabled).toBe(false);
  });

  it("preserves the reviewed iOS shell behaviour alongside the flag", () => {
    expect(iosShell.contentInset).toBe("always");
    expect(iosShell.limitsNavigationsToAppBoundDomains).toBe(true);
    expect(androidShell.allowMixedContent).toBe(false);
  });

  it("leaves every UI bar, permission and plugin surface untouched", () => {
    // The hardening must not become a vehicle for unrelated shell edits.
    expect(plugins.SystemBars).toMatchObject({ style: "DEFAULT", hidden: false });
    expect(plugins.StatusBar).toMatchObject({
      style: "DEFAULT",
      backgroundColor: "#FFFFFF",
      overlaysWebView: false,
    });
    expect(plugins.Geolocation).toMatchObject({ permissions: ["location"] });
    expect(plugins.PushNotifications).toMatchObject({
      presentationOptions: ["badge", "sound", "alert"],
    });
  });
});

describe("bootstrapNativePlatform — runtime system-bar styling", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    splashModule.hide.mockReset();
    splashModule.hide.mockResolvedValue(undefined);
    statusBarModule.setStyle.mockReset();
    statusBarModule.setStyle.mockResolvedValue(undefined);
    statusBarModule.setBackgroundColor.mockReset();
    statusBarModule.setBackgroundColor.mockResolvedValue(undefined);
    systemBarsModule.setStyle.mockReset();
    systemBarsModule.setStyle.mockResolvedValue(undefined);
    systemBarsModule.show.mockReset();
    systemBarsModule.hide.mockReset();
    keyboardModule.addListener.mockReset();
    keyboardModule.addListener.mockReturnValue({ remove: vi.fn() });
    appModule.addListener.mockReset();
    appModule.addListener.mockReturnValue({ remove: vi.fn() });
    pushModule.initPushNotifications.mockReset();
    pushModule.initPushNotifications.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete (window as { Capacitor?: unknown }).Capacitor;
  });

  it("applies dark icons on the light surface in the light theme (Android)", async () => {
    await bootOn("android");

    // `LIGHT` on both surfaces == dark icons, which is the only readable
    // combination above a #FFFFFF bar.
    expect(systemBarsModule.setStyle).toHaveBeenCalledTimes(1);
    expect(systemBarsModule.setStyle).toHaveBeenCalledWith({ style: "LIGHT" });
    expect(systemBarsModule.setStyle).not.toHaveBeenCalledWith({ style: "DARK" });
    // Both bars stay visible: styling must not hide the navigation bar.
    expect(systemBarsModule.hide).not.toHaveBeenCalled();

    // The legacy surface gets the same meaning and the header's own colour.
    expect(statusBarModule.setStyle).toHaveBeenCalledWith({ style: "LIGHT" });
    expect(statusBarModule.setBackgroundColor).toHaveBeenCalledWith({ color: "#FFFFFF" });

    // Existing native layout marker (safe-area CSS hooks) is retained.
    expect(document.documentElement.classList.contains("platform-android")).toBe(true);
  });

  it("switches to light icons and #121212 when the document is dark", async () => {
    document.documentElement.setAttribute("data-theme", "dark");
    await bootOn("android");
    document.documentElement.removeAttribute("data-theme");

    expect(systemBarsModule.setStyle).toHaveBeenCalledWith({ style: "DARK" });
    expect(statusBarModule.setStyle).toHaveBeenCalledWith({ style: "DARK" });
    expect(statusBarModule.setBackgroundColor).toHaveBeenCalledWith({ color: "#121212" });
  });

  it("re-applies the chrome when the app theme changes at runtime", async () => {
    await bootOn("android");
    document.documentElement.setAttribute("data-theme", "dark");
    window.dispatchEvent(new CustomEvent("burg:themechange", { detail: { resolved: "dark" } }));
    await settle();

    expect(systemBarsModule.setStyle).toHaveBeenLastCalledWith({ style: "DARK" });
    expect(statusBarModule.setBackgroundColor).toHaveBeenLastCalledWith({ color: "#121212" });
    document.documentElement.removeAttribute("data-theme");
  });

  it("applies light-theme chrome on iOS without the Android-only background", async () => {
    await bootOn("ios");

    expect(systemBarsModule.setStyle).toHaveBeenCalledTimes(1);
    expect(systemBarsModule.setStyle).toHaveBeenCalledWith({ style: "LIGHT" });
    expect(statusBarModule.setStyle).toHaveBeenCalledWith({ style: "LIGHT" });
    expect(statusBarModule.setBackgroundColor).not.toHaveBeenCalled();
    expect(document.documentElement.classList.contains("platform-ios")).toBe(true);
  });

  it("does not touch either status-bar API in a plain browser", async () => {
    await bootOn("web");

    expect(systemBarsModule.setStyle).not.toHaveBeenCalled();
    expect(systemBarsModule.show).not.toHaveBeenCalled();
    expect(systemBarsModule.hide).not.toHaveBeenCalled();
    expect(statusBarModule.setStyle).not.toHaveBeenCalled();
    expect(statusBarModule.setBackgroundColor).not.toHaveBeenCalled();
    expect(document.documentElement.className).toBe("");
    expect(pushModule.initPushNotifications).not.toHaveBeenCalled();
  });

  it("keeps the rest of the native boot working when SystemBars styling fails", async () => {
    systemBarsModule.setStyle.mockRejectedValue(new Error("SystemBars not implemented"));

    await expect(bootOn("android")).resolves.toBeUndefined();

    // The legacy surface is applied independently of the core failure.
    expect(statusBarModule.setStyle).toHaveBeenCalledWith({ style: "LIGHT" });
    expect(statusBarModule.setBackgroundColor).toHaveBeenCalledWith({ color: "#FFFFFF" });
    // Splash released, keyboard + lifecycle + back-button listeners registered.
    expect(splashModule.hide).toHaveBeenCalledWith({ fadeOutDuration: 250 });
    expect(keyboardModule.addListener).toHaveBeenCalledTimes(2);
    expect(appModule.addListener.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps SystemBars styling applied when the legacy StatusBar plugin fails", async () => {
    statusBarModule.setStyle.mockRejectedValue(new Error("StatusBar not implemented"));

    await expect(bootOn("android")).resolves.toBeUndefined();

    expect(systemBarsModule.setStyle).toHaveBeenCalledWith({ style: "LIGHT" });
    expect(splashModule.hide).toHaveBeenCalledWith({ fadeOutDuration: 250 });
    expect(keyboardModule.addListener).toHaveBeenCalledTimes(2);
  });

  it("registers the hardware BACK listener on the App plugin", async () => {
    await bootOn("android");

    const calls = appModule.addListener.mock.calls as unknown as Array<[string]>;
    const backCalls = calls.filter(([event]) => event === "backButton");
    expect(backCalls).toHaveLength(1);
  });

  it("removes every retained App listener on root teardown", async () => {
    const remove = vi.fn();
    appModule.addListener.mockReturnValue({ remove });
    vi.resetModules();
    setPlatform("android");
    const mod = await import("./mobileBootstrap");
    await mod.bootstrapNativePlatform();
    await settle();

    expect(appModule.addListener).toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();

    mod.disposeNativePlatform();
    expect(remove).toHaveBeenCalledTimes(appModule.addListener.mock.calls.length);
  });
});
