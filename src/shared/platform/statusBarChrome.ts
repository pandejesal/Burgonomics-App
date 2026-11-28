/**
 * Status-bar / system-bar chrome for the Capacitor shell.
 *
 * The EMULATOR audit (2026-11-26) found the customer status bar on a solid
 * black band with its icons invisible. Two causes, both fixed here:
 *
 * 1. The bar was given the *hero* green (#0E4825) while the app header it
 *    actually sits above is `--surface` (#FFFFFF in light, #121212 in dark).
 *    On Android 15+/targetSdk 36 the legacy `StatusBar.setBackgroundColor`
 *    is ignored altogether (edge-to-edge is enforced), so the visible strip is
 *    the window background — the theme colour in res/values{-night}.
 * 2. The icon colour was pinned to "light content on dark" (Style.Dark) even
 *    while the light theme painted a white strip underneath them: white on
 *    white.
 *
 * So the chrome is derived from the *resolved theme*, applied at startup and
 * again on every `burg:themechange`, with the native styles.xml colours
 * matching the same two values so the very first frame (before JS runs) is
 * already readable.
 *
 * `Style.Light` / `SystemBarsStyle.Light` mean "dark icons on a light
 * background"; `Dark` means "light icons on a dark background". Both semantics
 * are spelled out at the use sites below because the naming is counter-intuitive.
 */

export type ResolvedTheme = "light" | "dark";
export type ThemePreference = ResolvedTheme | "system";

export interface StatusBarChrome {
  /** Painted behind the bar. Matches the app header surface. */
  backgroundColor: string;
  /** `DARK` = light icons (dark header); `LIGHT` = dark icons (light header). */
  style: "DARK" | "LIGHT";
}

/**
 * Must stay in sync with `--surface` in `src/styles.css` (light #ffffff, dark
 * #121212). The same pair is duplicated in
 * `android/app/src/main/res/values{,-night}/colors.xml`; a unit test in
 * `statusBarChrome.test.ts` reads that file so the two cannot drift silently.
 */
export const STATUS_BAR_CHROME: Readonly<Record<ResolvedTheme, StatusBarChrome>> = Object.freeze({
  light: Object.freeze({ backgroundColor: "#FFFFFF", style: "LIGHT" }) as StatusBarChrome,
  dark: Object.freeze({ backgroundColor: "#121212", style: "DARK" }) as StatusBarChrome,
});

/** Resolves a stored preference against the OS setting. */
export function resolveStatusBarChrome(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): StatusBarChrome {
  if (preference === "system") {
    return systemPrefersDark ? STATUS_BAR_CHROME.dark : STATUS_BAR_CHROME.light;
  }
  return STATUS_BAR_CHROME[preference];
}

/**
 * Reads the theme the document is actually painted with.
 *
 * `applyThemeToDocument` writes `data-theme` and toggles `.dark`; the pre-paint
 * `theme-boot.js` writes both too, so at bootstrap time either is authoritative.
 */
export function readResolvedTheme(doc: Document | null): ResolvedTheme {
  if (!doc) return "light";
  const attr = doc.documentElement.getAttribute("data-theme");
  if (attr === "dark" || attr === "light") return attr;
  return doc.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Plugin surfaces, injected so the module is testable without a shell. */
export interface StatusBarPlugins {
  /** Legacy plugin: supported on Android <= 14 and iOS. */
  setLegacyStyle: (style: "DARK" | "LIGHT") => Promise<void> | void;
  /** Android <= 14 / iOS background. A no-op (not an error) on Android 15+. */
  setBackgroundColor?: (color: string) => Promise<void> | void;
  /** Core SystemBars (targetSdk 36 surface); also paints the decor background. */
  setSystemBarStyle?: (style: "DARK" | "LIGHT") => Promise<void> | void;
}

/**
 * Applies one chrome in order of "least likely to throw": the core bar first
 * (it owns the visible strip on modern Android), then the legacy plugin, then
 * the colour. Every step is independently guarded, so a shell without one
 * plugin still gets the other.
 */
export async function applyStatusBarChrome(
  platform: string,
  chrome: StatusBarChrome,
  plugins: StatusBarPlugins,
): Promise<void> {
  await runGuarded(() => plugins.setSystemBarStyle?.(chrome.style));
  await runGuarded(() => plugins.setLegacyStyle(chrome.style));
  if (platform === "android") {
    await runGuarded(() => plugins.setBackgroundColor?.(chrome.backgroundColor));
  }
}

async function runGuarded(call: () => Promise<void> | void | undefined): Promise<void> {
  try {
    await call();
  } catch {
    /* a single unavailable plugin must not stop the rest of the chrome */
  }
}

/** True when a document theme changed event should re-apply the chrome. */
export function isThemeChangeEvent(event: Event): boolean {
  if (event.type !== "burg:themechange") return false;
  const detail = (event as CustomEvent<{ resolved?: unknown }>).detail;
  return detail?.resolved === "light" || detail?.resolved === "dark";
}

/**
 * Re-applies the chrome whenever the theme changes and when the app becomes
 * visible again (an OS theme flip under a "system" preference re-applies
 * `applyThemePreference`, which dispatches `burg:themechange`, so one listener
 * covers both).
 *
 * The caller owns the native-only check: `bootstrapNativePlatform` returns
 * before this runs in a browser, and this stays a plain listener so it can be
 * tested without a Capacitor shell.
 *
 * Returns a detach function.
 */
export function watchStatusBarChrome(
  win: Window,
  apply: (theme: ResolvedTheme) => void,
): () => void {
  const onThemeChange = (event: Event) => {
    if (!isThemeChangeEvent(event)) return;
    apply((event as CustomEvent<{ resolved: ResolvedTheme }>).detail.resolved);
  };
  win.addEventListener("burg:themechange", onThemeChange);

  // A resume can follow an OS theme switch with no in-app re-apply.
  const onVisibility = () => {
    if (win.document.visibilityState !== "visible") return;
    apply(readResolvedTheme(win.document));
  };
  win.document.addEventListener("visibilitychange", onVisibility);

  return () => {
    win.removeEventListener("burg:themechange", onThemeChange);
    win.document.removeEventListener("visibilitychange", onVisibility);
  };
}
