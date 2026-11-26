/**
 * Native shell bootstrap.
 *
 * Loaded only from `src/mobile-entry.tsx` (Capacitor build). All Capacitor
 * plugins are dynamically imported so the web SSR bundle never pulls them
 * in. Every call is a no-op when running in a browser (`isNative() === false`).
 */
import { isNative, getPlatform } from "./platform";
import { initPushNotifications } from "./pushNotifications";
import { toast } from "@/shared/components/feedback/AppToaster";
import { initAndroidBackButton, type RouterHistoryLike } from "./androidBackButton";
import {
  applyStatusBarChrome,
  readResolvedTheme,
  resolveStatusBarChrome,
  watchStatusBarChrome,
  type ResolvedTheme,
} from "./statusBarChrome";
import { sanitizeRedirectUrl } from "@/features/auth/utils/routeUtils";

/**
 * Top-level route segments this app actually serves, derived from the route
 * FILES at build time rather than from a hand-kept list. TanStack file routes
 * name the first segment: `cart.tsx` → `/cart`, `menu.index.tsx` → `/menu`,
 * `menu.product.$productId.tsx` → `/menu`. A new route file is therefore
 * addressable immediately and a typo — or a foreign domain — never is.
 */
const ROUTE_MODULES = Object.keys(import.meta.glob("../../routes/*.{ts,tsx}"));

function routeHostOf(modulePath: string): string[] {
  const file = modulePath.slice(modulePath.lastIndexOf("/") + 1);
  if (/\.test\.tsx?$/.test(file)) return [];
  const segment = file.replace(/\.tsx?$/, "").split(".")[0];
  if (!segment || segment === "__root" || segment === "index") return [];
  return [segment];
}

/** The accepted first route segments (e.g. "orders", "menu"), sorted. */
export const APP_ROUTE_HOSTS: readonly string[] = Object.freeze(
  [...new Set(ROUTE_MODULES.flatMap(routeHostOf))].sort(),
);

/**
 * Resolves and validates an incoming native app URL (custom scheme or universal link).
 * Returns the safe in-app route string, or null if invalid or unsafe.
 */
export function resolveAppUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const schemeOk = url.protocol === "burgonomics:";
    const hostOk =
      url.protocol === "https:" &&
      ["burgonomics.com", "www.burgonomics.com", "burgonomics.netlify.app"].includes(
        url.hostname.toLowerCase(),
      );
    if (!schemeOk && !hostOk) return null;

    // A URL parser puts the first path segment of a custom-scheme URL in the
    // HOSTNAME, so `burgonomics://evil.com/x` would otherwise be pushed into the
    // router as the in-app path `/evil.com/x`. Only a real top-level route
    // segment may stand in that position; the host-less `burgonomics:///path`
    // form keeps resolving from the pathname alone.
    const host = schemeOk ? url.hostname.toLowerCase() : "";
    if (schemeOk && host && !APP_ROUTE_HOSTS.includes(host)) return null;

    const route = schemeOk ? (host ? `/${host}${url.pathname}` : url.pathname) : url.pathname;
    const path = route + url.search + url.hash;
    const safe = sanitizeRedirectUrl(path, "");
    return safe || null;
  } catch {
    return null;
  }
}

export async function bootstrapNativePlatform(): Promise<void> {
  if (!isNative()) return;

  const platform = getPlatform();
  document.documentElement.classList.add(`platform-${platform}`);

  // Initialize push notification listeners
  void initPushNotifications();

  try {
    const [{ SplashScreen }, { StatusBar, Style }, { Keyboard }, { App }] = await Promise.all([
      import("@capacitor/splash-screen"),
      import("@capacitor/status-bar"),
      import("@capacitor/keyboard"),
      import("@capacitor/app"),
    ]);

    /**
     * Status-bar chrome. It is derived from the resolved theme and matches the
     * app header surface (`--surface`, #FFFFFF / #121212), NOT the hero green:
     * the audit found a white-on-white bar on the customer app because the
     * icons were pinned to "light content on dark" above a light surface.
     *
     * Modern Android (targetSdk 36) renders this through core `SystemBars` and
     * ignores `StatusBar.setBackgroundColor`; the native res/values{-night}
     * colours cover the first frame, this covers runtime changes.
     */
    const applyChrome = async (theme: ResolvedTheme) => {
      const chrome = resolveStatusBarChrome(theme, false);
      await applyStatusBarChrome(platform, chrome, {
        setSystemBarStyle: async (style) => {
          const core = await import("@capacitor/core");
          await core.SystemBars.setStyle({
            style: style === "DARK" ? core.SystemBarsStyle.Dark : core.SystemBarsStyle.Light,
          });
        },
        setLegacyStyle: async (style) => {
          await StatusBar.setStyle({ style: style === "DARK" ? Style.Dark : Style.Light });
        },
        setBackgroundColor: async (color) => {
          await StatusBar.setBackgroundColor({ color });
        },
      });
    };

    // A shell without @capacitor/core's SystemBars throws inside the guarded
    // helper, so one failure cannot take the splash, keyboard or links down.
    try {
      await applyChrome(readResolvedTheme(document));
      watchStatusBarChrome(window, (theme) => {
        void applyChrome(theme);
      });
    } catch {
      /* system bars unavailable on this shell */
    }

    // Splash release: after the first PAINTED frame, not a fixed 50 ms timer.
    // On a saturated host (EMULATOR audit: 20-23 s cold start) the timer fired
    // before React had painted, so the splash disappeared over an empty
    // WebView — the blank screen the audit captured. Two frames guarantee one
    // committed paint; the splash config keeps `launchAutoHide: false`, so
    // nothing else can take it down early.
    afterFirstPaint(() => {
      void SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => undefined);
    });

    // Keyboard — let the WebView resize naturally so inputs stay visible.
    try {
      Keyboard.addListener("keyboardWillShow", () => {
        document.documentElement.classList.add("kb-open");
      });
      Keyboard.addListener("keyboardWillHide", () => {
        document.documentElement.classList.remove("kb-open");
      });
    } catch {
      /* keyboard plugin not registered */
    }

    // Deep links (burgonomics://path or https universal links). Allowlisted:
    // any scheme/host the OS delivers is otherwise pushed straight into the
    // router (open redirect into arbitrary in-app or external targets).
    App.addListener("appUrlOpen", (event) => {
      try {
        const safe = resolveAppUrl(event.url);
        if (safe) {
          window.history.pushState({}, "", safe);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }
      } catch {
        /* ignore malformed deep link */
      }
    });

    // Lifecycle — surface via CustomEvent so features can subscribe.
    App.addListener("appStateChange", ({ isActive }) => {
      window.dispatchEvent(new CustomEvent("burg:appstate", { detail: { isActive } }));
    });

    // Hardware / Gesture Back Button (Android). Decision table + overlay
    // dismissal live in ./androidBackButton so they are unit-testable; the
    // router history is passed in so BACK pops it instead of guessing from
    // window.history (which the audit showed going nowhere).
    initAndroidBackButton({
      app: App,
      history: historyForRouter(),
      onArmExit: () => {
        // Android's own convention for "press back again to exit": say so once,
        // otherwise a first press on Home looks like nothing happened.
        toast("Press back again to exit", { duration: 2000 });
      },
    });
  } catch (err) {
    console.warn("[burgonomics] native bootstrap failed", err);
  }
}

/**
 * Waits for the first PAINTED frame before running `callback`.
 *
 * `requestAnimationFrame` fires before paint, so two callbacks are chained: the
 * second runs after the first committed frame. A shell without rAF (or a
 * backgrounded WebView, where rAF is throttled) falls back to a short timer, so
 * the splash is always released rather than stranded.
 */
function afterFirstPaint(callback: () => void): void {
  // `done` makes the release exactly once even when the safety timer and the
  // rAF chain both come due (the timer is not cleared if it already fired).
  let done = false;
  const runOnce = () => {
    if (done) return;
    done = true;
    callback();
  };

  // A shell with rAF gets a generous safety net: the point of the wait is that
  // a slow host must NOT release the splash over an unpainted WebView (that is
  // exactly the blank screen the audit captured), so the timer only has to
  // cover a backgrounded WebView where rAF is throttled indefinitely — not to
  // race the paint. Without rAF there is nothing to wait for, so a short timer
  // releases the splash instead of stranding it.
  const hasAnimationFrame =
    typeof window !== "undefined" && typeof window.requestAnimationFrame === "function";
  const safetyMs = hasAnimationFrame ? 10000 : 400;
  const safetyTimer = setTimeout(runOnce, safetyMs);
  if (!hasAnimationFrame) return;

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      clearTimeout(safetyTimer);
      runOnce();
    });
  });
}

/**
 * Router history bridge. The TanStack router keeps its own stack, and
 * `window.history.length` alone counts unrelated entries (deep-link pushes,
 * external navigations). `registerRouterHistory()` is called from `boot.tsx`
 * once the router exists; until it does, BACK falls back to `window.history`.
 */
let routerHistory: RouterHistoryLike | null = null;

export function registerRouterHistory(history: RouterHistoryLike | null): void {
  routerHistory = history;
}

function historyForRouter(): RouterHistoryLike {
  return {
    back: () => {
      if (routerHistory) routerHistory.back();
      else window.history.back();
    },
    canGoBack: () => Boolean(routerHistory?.canGoBack?.() ?? false),
  };
}
