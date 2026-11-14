/** @vitest-environment jsdom */
/**
 * Status-bar semantics on the deep-green (#0E4825) header.
 *
 * The two Capacitor surfaces use the *same* enum names for opposite reasons:
 *
 * - `@capacitor/status-bar` `Style.Dark` == `"DARK"` == light text for dark
 *   backgrounds.
 * - `@capacitor/core` `SystemBarsStyle.Dark` == `"DARK"` == light icon/text
 *   content on a dark background; the native Android implementation maps it to
 *   `setAppearanceLightStatusBars(false)`.
 *
 * `"LIGHT"` therefore means *dark icons*, which is what made the header icons
 * unreadable on the green bar. These tests pin the value that produces light
 * content on Android shell startup (config) and at runtime (both APIs), and
 * pin that a bar-style failure cannot take the rest of the native boot down.
 *
 * Native rendering itself is not asserted here: no device, emulator or
 * screenshot is involved, and nothing below measures real contrast.
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

/** Let the fire-and-forget bootstrap work (and its 50 ms splash timer) finish. */
const settle = async (ms = 90): Promise<void> => {
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

describe("capacitor configuration — green header needs light system-bar content", () => {
  it("configures SystemBars DARK (light content on the dark green bar) and keeps the bars visible", () => {
    expect(plugins.SystemBars.style).toBe("DARK");
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

  it("aligns the legacy StatusBar config with light content on the same green background", () => {
    expect(plugins.StatusBar.style).toBe("DARK");
    expect(plugins.StatusBar.backgroundColor).toBe("#0E4825");
    expect(plugins.StatusBar.overlaysWebView).toBe(false);
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
    expect(plugins.SystemBars).toMatchObject({ style: "DARK", hidden: false });
    expect(plugins.StatusBar).toMatchObject({
      style: "DARK",
      backgroundColor: "#0E4825",
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

  it("applies SystemBarsStyle.Dark on Android and keeps the green background", async () => {
    await bootOn("android");

    expect(systemBarsModule.setStyle).toHaveBeenCalledTimes(1);
    expect(systemBarsModule.setStyle).toHaveBeenCalledWith({ style: "DARK" });
    // Never the dark-icon value.
    expect(systemBarsModule.setStyle).not.toHaveBeenCalledWith({ style: "LIGHT" });
    // Both bars stay visible: styling must not hide the navigation bar.
    expect(systemBarsModule.hide).not.toHaveBeenCalled();

    // Legacy shell path still gets the same (light content) meaning.
    expect(statusBarModule.setStyle).toHaveBeenCalledWith({ style: "DARK" });
    expect(statusBarModule.setBackgroundColor).toHaveBeenCalledWith({ color: "#0E4825" });

    // Existing native layout marker (safe-area CSS hooks) is retained.
    expect(document.documentElement.classList.contains("platform-android")).toBe(true);
  });

  it("applies SystemBarsStyle.Dark on iOS without touching the Android-only background colour", async () => {
    await bootOn("ios");

    expect(systemBarsModule.setStyle).toHaveBeenCalledTimes(1);
    expect(systemBarsModule.setStyle).toHaveBeenCalledWith({ style: "DARK" });
    expect(statusBarModule.setStyle).toHaveBeenCalledWith({ style: "DARK" });
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
    expect(statusBarModule.setStyle).toHaveBeenCalledWith({ style: "DARK" });
    expect(statusBarModule.setBackgroundColor).toHaveBeenCalledWith({ color: "#0E4825" });
    // Splash released, keyboard + lifecycle listeners still registered.
    expect(splashModule.hide).toHaveBeenCalledWith({ fadeOutDuration: 250 });
    expect(keyboardModule.addListener).toHaveBeenCalledTimes(2);
    expect(appModule.addListener.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps SystemBars styling applied when the legacy StatusBar plugin fails", async () => {
    statusBarModule.setStyle.mockRejectedValue(new Error("StatusBar not implemented"));

    await expect(bootOn("android")).resolves.toBeUndefined();

    expect(systemBarsModule.setStyle).toHaveBeenCalledWith({ style: "DARK" });
    expect(splashModule.hide).toHaveBeenCalledWith({ fadeOutDuration: 250 });
    expect(keyboardModule.addListener).toHaveBeenCalledTimes(2);
  });
});
