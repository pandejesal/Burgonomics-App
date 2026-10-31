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
 * Once the run ends (or is cancelled) the push/pop class is dropped again, so the
 * `will-change` compositing hint — which would otherwise make this container the
 * containing block for every `position: fixed` descendant for the life of the
 * route — exists only while the slide is actually in flight (audit 05-02).
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
  // Counter only: it exists so that clearing `transitionClass` below can ask for
  // a re-render. The class itself stays in stateRef because it is resolved
  // during render (see the note above).
  const [, setSettleTick] = React.useState(0);

  const settleTransition = React.useCallback(() => {
    if (stateRef.current.transitionClass === "") return;
    stateRef.current = { ...stateRef.current, transitionClass: "" };
    setSettleTick((tick) => tick + 1);
  }, []);

  const containerRef = React.useRef<HTMLDivElement | null>(null);

  // React only registers `animationend`, and in a DOM without `AnimationEvent`
  // (jsdom) it listens for a vendor-prefixed name instead, so both settle
  // signals are attached natively on the container itself. A cancelled run
  // (container hidden mid-slide, animation torn down by the browser) fires
  // `animationcancel` and no `animationend` at all — without this, `will-change:
  // transform` would outlive the transition and keep reparenting `position:
  // fixed` children (audit 05-02). Filtered to the container's own animation so
  // a child that ends or cancels cannot settle the route early.
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleSettle = (event: Event) => {
      if (event.target !== container) return;
      settleTransition();
    };
    container.addEventListener("animationend", handleSettle);
    container.addEventListener("animationcancel", handleSettle);
    return () => {
      container.removeEventListener("animationend", handleSettle);
      container.removeEventListener("animationcancel", handleSettle);
    };
  }, [pathname, settleTransition]);

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
      ref={containerRef}
      className={`route-transition-container ${stateRef.current.transitionClass}`.trim()}
    >
      {children}
    </div>
  );
}
