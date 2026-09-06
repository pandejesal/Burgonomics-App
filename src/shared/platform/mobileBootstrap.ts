/**
 * Native shell bootstrap.
 *
 * Loaded only from `src/mobile-entry.tsx` (Capacitor build). All Capacitor
 * plugins are dynamically imported so the web SSR bundle never pulls them
 * in. Every call is a no-op when running in a browser (`isNative() === false`).
 */
import { isNative, getPlatform } from "./platform";
import { initPushNotifications } from "./pushNotifications";
import { sanitizeRedirectUrl } from "@/features/auth/utils/routeUtils";

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

    // Status bar — brand green, light content style (matches capacitor.config.ts StatusBar plugin).
    try {
      await StatusBar.setStyle({ style: Style.Light });
      if (getPlatform() === "android") {
        await StatusBar.setBackgroundColor({ color: "#0E4825" });
      }
    } catch {
      /* status bar not available on this device */
    }

    // Hide splash once React has mounted (mobile-entry has already rendered).
    setTimeout(() => {
      void SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => undefined);
    }, 50);

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
        const url = new URL(event.url);
        const schemeOk = url.protocol === "burgonomics:";
        const hostOk =
          url.protocol === "https:" &&
          ["burgonomics.com", "www.burgonomics.com", "burgonomics.netlify.app"].includes(
            url.hostname.toLowerCase()
          );
        if (!schemeOk && !hostOk) return;
        const path = url.pathname + url.search + url.hash;
        const safe = sanitizeRedirectUrl(path, "");
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

    // Hardware / Gesture Back Button handling (Android Native).
    App.addListener("backButton", ({ canGoBack }) => {
      // 1. If an open modal dialog or sheet is present, attempt close button click or dispatch Escape to window
      const openModal =
        document.querySelector('[role="dialog"]') ||
        document.querySelector('[data-state="open"]') ||
        document.querySelector("[data-vaul-drawer]");
      if (openModal) {
        const closeBtn = openModal.querySelector<HTMLButtonElement>(
          'button[aria-label="Close"], button[data-drawer-close], [data-radix-collection-item]',
        );
        if (closeBtn) {
          closeBtn.click();
          return;
        }
        window.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Escape",
            code: "Escape",
            keyCode: 27,
            which: 27,
            bubbles: true,
            cancelable: true,
          }),
        );
        return;
      }

      // 2. Navigate back in history if available and not at root route
      const hash = window.location.hash.replace(/^#/, "");
      const path = hash || window.location.pathname;
      const isRoot = !path || path === "/" || path === "/home" || path === "/stores";

      if (canGoBack && !isRoot) {
        window.history.back();
      } else {
        // At root screen, minimize app instead of abrupt termination
        void App.minimizeApp();
      }
    });
  } catch (err) {
    console.warn("[burgonomics] native bootstrap failed", err);
  }
}
