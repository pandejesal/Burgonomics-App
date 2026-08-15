import * as React from "react";
import { useLocation } from "@tanstack/react-router";

let lastPathname = typeof window !== "undefined" ? window.location.pathname : "";
let isPopNavigation = false;
let isFirstLoad = true;

if (typeof window !== "undefined") {
  window.addEventListener(
    "popstate",
    () => {
      isPopNavigation = true;
    },
    { passive: true },
  );
}

interface ConsumerRouteTransitionProps {
  children: React.ReactNode;
}

/**
 * ConsumerRouteTransition
 *
 * Provides native mobile screen transitions (slide-in on push, slide-out on pop)
 * for consumer routes only. Detects back-navigation vs forward pushes, disables on
 * initial load, suppresses scrollbar flicker, and respects prefers-reduced-motion.
 */
export function ConsumerRouteTransition({ children }: ConsumerRouteTransitionProps) {
  const location = useLocation();
  const pathname = location.pathname;
  const isAdmin = pathname.startsWith("/admin");

  const [transitionClass, setTransitionClass] = React.useState<string>("");

  React.useEffect(() => {
    if (isAdmin) {
      setTransitionClass("");
      lastPathname = pathname;
      return;
    }

    if (isFirstLoad) {
      isFirstLoad = false;
      lastPathname = pathname;
      setTransitionClass("");
      return;
    }

    if (pathname !== lastPathname) {
      const direction = isPopNavigation ? "route-transition-pop" : "route-transition-push";
      isPopNavigation = false;
      lastPathname = pathname;
      setTransitionClass(direction);
    }
  }, [pathname, isAdmin]);

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <div
      key={pathname}
      className={`route-transition-container ${transitionClass}`.trim()}
    >
      {children}
    </div>
  );
}
