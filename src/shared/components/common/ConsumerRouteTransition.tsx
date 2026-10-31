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
 *
 * The direction is resolved *during render* and stored per pathname, because the
 * container is keyed by `pathname`: computing it in an effect meant the freshly
 * mounted screen first painted with the PREVIOUS navigation's class, then
 * swapped direction one frame later — restarting the animation mid-flight and
 * leaving screens looking frozen between the old and new routes.
 */
export function ConsumerRouteTransition({ children }: ConsumerRouteTransitionProps) {
  const location = useLocation();
  const pathname = location.pathname;

  const stateRef = React.useRef({ pathname: lastPathname, transitionClass: "" });

  // First paint must not animate, but the first *navigation* after mount must:
  // consume the "first load" flag as soon as the screen is up. On later path
  // changes this only rewrites values the render-time block already advanced,
  // so it is a no-op for animation state.
  React.useEffect(() => {
    isFirstLoad = false;
    lastPathname = pathname;
  }, [pathname]);

  if (stateRef.current.pathname !== pathname) {
    const transitionClass = isFirstLoad
      ? ""
      : isPopNavigation
        ? "route-transition-pop"
        : "route-transition-push";
    // Consume the direction exactly once per pathname change so the next
    // navigation can't inherit it.
    isFirstLoad = false;
    isPopNavigation = false;
    lastPathname = pathname;
    stateRef.current = { pathname, transitionClass };
  }

  return (
    <div
      key={pathname}
      className={`route-transition-container ${stateRef.current.transitionClass}`.trim()}
    >
      {children}
    </div>
  );
}
