/** @vitest-environment jsdom */
/**
 * Status-bar chrome on Android (EMULATOR audit, 2026-11-26).
 *
 * The audit found the bar on a solid band with no visible icons on the
 * customer app, and near-white bar with white icons on the Partner console.
 * These tests pin three things:
 *
 *  1. The chrome is derived from the *resolved theme*, matching the app
 *     header surface (`--surface` #FFFFFF / #121212), not the hero green.
 *  2. The icon style flips with it: `LIGHT` (dark icons) on white, `DARK`
 *     (light icons) on near-black.
 *  3. The native res/values{-night}/colors.xml hold the SAME two colours, so
 *     the very first frame (before JS runs) is already readable — a unit test
 *     reading the XML is what keeps them from drifting.
 *
 * No device is involved and nothing here measures real contrast.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import capacitorConfig from "../../../capacitor.config";
import {
  STATUS_BAR_CHROME,
  applyStatusBarChrome,
  isThemeChangeEvent,
  readResolvedTheme,
  resolveStatusBarChrome,
  watchStatusBarChrome,
} from "./statusBarChrome";

const WORKTREE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function nativeColor(file: string, name: string): string {
  const xml = readFileSync(path.join(WORKTREE_ROOT, "android/app/src/main/res", file), "utf8");
  const match = xml.match(new RegExp(`<color name="${name}">(#[0-9A-Fa-f]{6})</color>`));
  if (!match) throw new Error(`${name} not declared in ${file}`);
  return match[1].toUpperCase();
}

function nativeBool(file: string, name: string): boolean {
  const xml = readFileSync(path.join(WORKTREE_ROOT, "android/app/src/main/res", file), "utf8");
  const match = xml.match(new RegExp(`<bool name="${name}">(true|false)</bool>`));
  if (!match) throw new Error(`${name} not declared in ${file}`);
  return match[1] === "true";
}

describe("status-bar chrome is the header surface, not the hero green", () => {
  it("uses white + dark icons in the light theme", () => {
    expect(STATUS_BAR_CHROME.light).toEqual({ backgroundColor: "#FFFFFF", style: "LIGHT" });
  });

  it("uses the dark surface + light icons in the dark theme", () => {
    expect(STATUS_BAR_CHROME.dark).toEqual({ backgroundColor: "#121212", style: "DARK" });
  });

  it("resolves a 'system' preference against the OS setting", () => {
    expect(resolveStatusBarChrome("system", true)).toEqual(STATUS_BAR_CHROME.dark);
    expect(resolveStatusBarChrome("system", false)).toEqual(STATUS_BAR_CHROME.light);
    expect(resolveStatusBarChrome("light", true)).toEqual(STATUS_BAR_CHROME.light);
    expect(resolveStatusBarChrome("dark", false)).toEqual(STATUS_BAR_CHROME.dark);
  });

  it("reads the theme the document is actually painted with", () => {
    const root = document.documentElement;
    root.setAttribute("data-theme", "dark");
    expect(readResolvedTheme(document)).toBe("dark");
    root.setAttribute("data-theme", "light");
    expect(readResolvedTheme(document)).toBe("light");
    root.removeAttribute("data-theme");
    root.classList.add("dark");
    expect(readResolvedTheme(document)).toBe("dark");
    root.classList.remove("dark");
    root.setAttribute("data-theme", "light");
  });
});

describe("native first frame carries the same colours", () => {
  it("values/colors.xml declares the light-theme status-bar colours", () => {
    expect(nativeColor("values/colors.xml", "statusBarColor")).toBe(
      STATUS_BAR_CHROME.light.backgroundColor.toUpperCase(),
    );
    // true == dark icons on a light bar; mirrors runtime style "LIGHT".
    expect(nativeBool("values/colors.xml", "statusBarDarkIcons")).toBe(true);
  });

  it("values-night/colors.xml declares the dark-theme status-bar colours", () => {
    expect(nativeColor("values-night/colors.xml", "statusBarColor")).toBe(
      STATUS_BAR_CHROME.dark.backgroundColor.toUpperCase(),
    );
    // false == light icons on a dark bar; mirrors runtime style "DARK".
    expect(nativeBool("values-night/colors.xml", "statusBarDarkIcons")).toBe(false);
  });

  it("keeps the native icon bool in step with the runtime style polarity", () => {
    expect(nativeBool("values/colors.xml", "statusBarDarkIcons")).toBe(
      STATUS_BAR_CHROME.light.style === "LIGHT",
    );
    expect(nativeBool("values-night/colors.xml", "statusBarDarkIcons")).toBe(
      STATUS_BAR_CHROME.dark.style === "LIGHT",
    );
  });

  it("styles.xml paints an opaque bar, dark icons and the header surface", () => {
    const xml = readFileSync(
      path.join(WORKTREE_ROOT, "android/app/src/main/res/values/styles.xml"),
      "utf8",
    );
    // Opaque status bar is what makes the icon colour visible at all.
    expect(xml).toMatch(/<item name="android:statusBarColor">@color\/statusBarColor<\/item>/);
    expect(xml).toMatch(
      /<item name="android:windowLightStatusBar">@bool\/statusBarDarkIcons<\/item>/,
    );
    // Never translucent: that is how the bar ended up unreadable white-on-white.
    expect(xml).not.toMatch(/windowTranslucentStatus">true/);
    // Safe areas stay with the SystemBars plugin (`insetsHandling: css`).
    expect(xml).not.toMatch(/fitsSystemWindows">true/);
  });

  it("capacitor config keeps the plugin surfaces aligned with the light first frame", () => {
    const plugins = (
      capacitorConfig as {
        plugins: Record<
          string,
          { style?: string; insetsHandling?: string; backgroundColor?: string }
        >;
      }
    ).plugins;
    expect(plugins.SystemBars?.insetsHandling ?? "css").toBe("css");
    // DEFAULT = follow the device appearance, which matches the native window
    // background (res/values{-night}/colors.xml) that paints the first frame.
    expect(plugins.SystemBars?.style).toBe("DEFAULT");
    // The legacy surface follows the device appearance too, so a light device
    // gets dark icons on the white bar instead of the old fixed light icons.
    expect(plugins.StatusBar?.style).toBe("DEFAULT");
    expect(plugins.StatusBar?.backgroundColor).toBe(STATUS_BAR_CHROME.light.backgroundColor);
  });

  it("locks the phone-first activity to portrait in the manifest", () => {
    // EMULATOR audit: rotating to landscape rendered a blank grey frame with no
    // UI. The customer flow is authored for one column, so the OS is told not to
    // rotate it; `configChanges` still lists orientation so a multi-window
    // rotation can never recreate the WebView.
    const manifest = readFileSync(
      path.join(WORKTREE_ROOT, "android/app/src/main/AndroidManifest.xml"),
      "utf8",
    );
    expect(manifest).toMatch(/android:screenOrientation="portrait"/);
    expect(manifest).toMatch(/configChanges="[^"]*orientation[^"]*"/);
    // Safe areas come from the SystemBars plugin, never from the activity.
    expect(manifest).not.toMatch(/fitsSystemWindows="true"/);
  });
});

describe("applyStatusBarChrome", () => {
  it("orders core bar first, then legacy style, then the Android background", async () => {
    const calls: string[] = [];
    await applyStatusBarChrome("android", STATUS_BAR_CHROME.light, {
      setSystemBarStyle: (style) => void calls.push(`system:${style}`),
      setLegacyStyle: (style) => void calls.push(`legacy:${style}`),
      setBackgroundColor: (color) => void calls.push(`bg:${color}`),
    });
    expect(calls).toEqual(["system:LIGHT", "legacy:LIGHT", "bg:#FFFFFF"]);
  });

  it("skips the Android-only background on iOS", async () => {
    const calls: string[] = [];
    await applyStatusBarChrome("ios", STATUS_BAR_CHROME.dark, {
      setSystemBarStyle: (style) => void calls.push(`system:${style}`),
      setLegacyStyle: (style) => void calls.push(`legacy:${style}`),
      setBackgroundColor: (color) => void calls.push(`bg:${color}`),
    });
    expect(calls).toEqual(["system:DARK", "legacy:DARK"]);
  });

  it("keeps applying the remaining surfaces when one plugin rejects", async () => {
    const calls: string[] = [];
    await applyStatusBarChrome("android", STATUS_BAR_CHROME.dark, {
      setSystemBarStyle: () => Promise.reject(new Error("SystemBars not implemented")),
      setLegacyStyle: (style) => void calls.push(`legacy:${style}`),
      setBackgroundColor: (color) => void calls.push(`bg:${color}`),
    });
    expect(calls).toEqual(["legacy:DARK", "bg:#121212"]);
  });

  it("resolves without any plugin at all", async () => {
    await expect(
      applyStatusBarChrome("android", STATUS_BAR_CHROME.light, {
        setLegacyStyle: () => undefined,
      }),
    ).resolves.toBeUndefined();
  });
});

describe("watchStatusBarChrome", () => {
  it("re-applies on a resolved theme change and ignores unrelated events", () => {
    const applied: string[] = [];
    const detach = watchStatusBarChrome(window, (theme) => void applied.push(theme));

    window.dispatchEvent(new CustomEvent("burg:themechange", { detail: { resolved: "dark" } }));
    window.dispatchEvent(new CustomEvent("burg:themechange", { detail: { resolved: "system" } }));
    window.dispatchEvent(new CustomEvent("other:event", { detail: { resolved: "light" } }));

    expect(applied).toEqual(["dark"]);
    detach();
  });

  it("re-applies the painted theme when the app becomes visible again", () => {
    const applied: string[] = [];
    const detach = watchStatusBarChrome(window, (theme) => void applied.push(theme));

    document.documentElement.setAttribute("data-theme", "dark");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(applied).toEqual(["dark"]);
    detach();
    document.documentElement.setAttribute("data-theme", "light");
  });

  it("recognises only well-formed theme events", () => {
    expect(
      isThemeChangeEvent(new CustomEvent("burg:themechange", { detail: { resolved: "dark" } })),
    ).toBe(true);
    expect(
      isThemeChangeEvent(new CustomEvent("burg:themechange", { detail: { resolved: null } })),
    ).toBe(false);
    expect(isThemeChangeEvent(new Event("visibilitychange"))).toBe(false);
  });
});
