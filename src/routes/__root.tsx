import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportAppError } from "../lib/error-reporting";
import { AppToaster } from "@/shared/components/feedback/AppToaster";

/**
 * Route-context error sink — forwards unhandled browser errors to the
 * existing error-reporting pipeline with the current route path.
 * Uses sendBeacon when available for best-effort delivery on page unload;
 * falls back to console.error when sendBeacon is unavailable or blocked.
 */
function reportErrorToSink(error: unknown, routeContext: string) {
  reportAppError(error, {
    boundary: "window_event_listener",
    routeContext,
    mechanism: error instanceof PromiseRejectionEvent ? "unhandledrejection" : "onerror",
  });
  // Best-effort beacon (no secrets, no PII — error.message only)
  try {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : String(error);
    const payload = JSON.stringify({
      type: "browser_error",
      message,
      route: routeContext,
      ts: new Date().toISOString(),
    });
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon("/api/error-report", payload);
    }
  } catch {
    // Non-fatal: if beacon fails, console.error is the last resort
    console.error("[error-sink] beacon failed", error);
  }
}
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { useAuthStore } from "@/features/auth/state/authStore";
import { useCartStore } from "@/features/cart/state/cartStore";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { useAddressStore } from "@/features/addresses/state/addressStore";
import { useCheckoutStore } from "@/features/checkout/state/checkoutStore";
import { useOrdersStore } from "@/features/orders/state/ordersStore";
import { useProfileStore } from "@/features/profile/state/profileStore";
import { useFavoritesStore } from "@/features/favorites/state/favoritesStore";
import { useNotificationsStore } from "@/features/notifications/state/notificationsStore";
import { useSettingsStore } from "@/features/settings/state/settingsStore";
import { useSearchStore } from "@/features/menu/state/searchStore";
import { profileRepository } from "@/features/profile/repositories/ProfileRepository";
import { APP } from "@/core/constants/app";
import { logger } from "@/core/logging/logger";
import { BrandMascot } from "@/shared/components/common/BrandMascot";
import { appConfig, isProd } from "@/core/config/env";
import { GlobalErrorBoundary, GlobalErrorFallback } from "@/shared/components/error";
import { getPlatform } from "@/shared/platform/platform";
import { ConsumerRouteTransition } from "@/shared/components/common/ConsumerRouteTransition";

if (typeof window !== "undefined" && !isProd()) {
  const keyId = appConfig.integrations.razorpayKeyId;
  const backend = appConfig.integrations.paymentsApiBaseUrl;

  console.info(
    `[burgonomics] Razorpay: ${keyId ? "live test key present" : "MISSING VITE_RAZORPAY_KEY_ID (simulation)"} · backend: ${backend || "MISSING VITE_PAYMENTS_API_BASE_URL (simulation)"}`,
  );
}

function NotFoundComponent() {
  const Mascot = BrandMascot;
  return (
    <div className="app-shell grid min-h-[100dvh] place-items-center px-6">
      <div className="flex flex-col items-center text-center">
        <Mascot size={140} float />
        <h1 className="type-display-large mt-4 text-primary">404</h1>
        <h2 className="type-headline-large mt-1">This page ran out of buns</h2>
        <p className="type-body-medium mt-2 text-text-secondary">
          The page you're looking for doesn't exist. Let's get you back to the good stuff.
        </p>
        <div className="mt-6">
          <Link
            to="/home"
            className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-orange-gradient px-6 type-label-large text-primary-foreground shadow-[var(--shadow-brand)]"
          >
            Take me home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  const router = useRouter();
  const err = error instanceof Error ? error : new Error(String(error));

  useEffect(() => {
    logger.error("route.error", err, { message: err.message });
    reportAppError(err, { boundary: "tanstack_root_error_component" });
  }, [err]);

  return (
    <GlobalErrorFallback
      error={err}
      resetErrorBoundary={() => {
        router.invalidate();
        reset();
      }}
    />
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1",
      },
      { name: "theme-color", content: "#023020" },
      { title: `${APP.name} — ${APP.tagline}` },
      {
        name: "description",
        content:
          "BURGONOMICS — The House of DAMN GOOD BURGERS!! 100% Pure Veg. Order fresh from your nearest BURGONOMICS store.",
      },
      { name: "author", content: APP.name },
      { property: "og:title", content: `${APP.name} — ${APP.tagline}` },
      {
        property: "og:description",
        content:
          "BURGONOMICS — The House of DAMN GOOD BURGERS!! 100% Pure Veg, made fresh, served fast.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Lilita+One&family=Montserrat:wght@300;400;500;600;700;800;900&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  // If we are rendering inside the SPA entry (#app), avoid rendering <html> and <body>
  // to prevent severe DOM nesting violations that break React event delegation.
  const isBrowser = typeof document !== "undefined";
  if (isBrowser && document.getElementById("app")) {
    return <>{children}</>;
  }

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const theme = useSettingsStore((s) => s.theme);

  // Rehydrate persisted Zustand stores + bootstrap auth session on the client only.
  useEffect(() => {
    void import("@/core/network/authSetup")
      .then(({ setupHttpAuth }) => setupHttpAuth())
      .catch(() => {
        // Non-fatal: repositories fall back to unauthenticated calls.
      });
    void useAuthStore.getState().bootstrap();
    void useCartStore.persist.rehydrate();
    void useStoreSelection.persist.rehydrate();
    void useAddressStore.persist.rehydrate();
    void useCheckoutStore.persist.rehydrate();
    void useOrdersStore.persist.rehydrate();
    void useProfileStore.persist.rehydrate();
    void useFavoritesStore.persist.rehydrate();
    void useNotificationsStore.persist.rehydrate();
    void useSettingsStore.persist.rehydrate();
    void useSearchStore.persist.rehydrate();
  }, []);

  // Sync theme with document element
  useEffect(() => {
    const root = window.document.documentElement;
    const applyTheme = () => {
      let activeTheme: "light" | "dark" = "light";

      if (theme === "system") {
        const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
        activeTheme = systemTheme;
      } else {
        activeTheme = theme === "dark" ? "dark" : "light";
      }

      if (activeTheme === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    };

    applyTheme();

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const listener = () => applyTheme();
      mediaQuery.addEventListener("change", listener);
      return () => mediaQuery.removeEventListener("change", listener);
    }
  }, [theme]);

  // Sync active platform class (supports ?platform=ios simulation)
  useEffect(() => {
    const root = window.document.documentElement;
    const currentPlatform = getPlatform();
    root.classList.remove("platform-ios", "platform-android", "platform-web");
    root.classList.add(`platform-${currentPlatform}`);
  }, []);

  // Keep the profile cache in sync with the auth session.
  useEffect(() => {
    return useAuthStore.subscribe((state, prev) => {
      if (state.user?.id !== prev.user?.id) {
        profileRepository.hydrateFromAuth(state.user);
      }
    });
  }, []);

  // Forward unhandled promise rejections + window errors to the report sink
  // with the current route path so async failures are never silently lost.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      reportErrorToSink(reason, window.location.pathname);
      logger.error("window.unhandledrejection", reason, {
        message: reason instanceof Error ? reason.message : String(reason),
      });
    };

    const handleWindowError = (event: ErrorEvent) => {
      reportErrorToSink(event.error ?? event.message, window.location.pathname);
      logger.error("window.error", event.error ?? event.message, {
        message: event.message,
      });
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleWindowError);
    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      window.removeEventListener("error", handleWindowError);
    };
  }, []);

  useOnlineStatus();

  return (
    <GlobalErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ConsumerRouteTransition>
          <Outlet />
        </ConsumerRouteTransition>
        <AppToaster />
        <div id="recaptcha-container"></div>
      </QueryClientProvider>
    </GlobalErrorBoundary>
  );
}
