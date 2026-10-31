import * as React from "react";
import type { ApprovedStoreAnnouncement } from "../approvedHomeContent";

const ROTATION_MS = 6000;

/** Announcements only: no store selection, links, booking or ordering actions. */
export function UpcomingBranches({ stores }: { stores: readonly ApprovedStoreAnnouncement[] }) {
  const rail = React.useRef<HTMLUListElement>(null);
  const [active, setActive] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const [visible, setVisible] = React.useState(true);
  const [pageVisible, setPageVisible] = React.useState(
    () => typeof document === "undefined" || !document.hidden,
  );
  // Fail safe until the client preference is known.
  const [reducedMotion, setReducedMotion] = React.useState(true);

  React.useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReducedMotion(preference.matches);
      if (preference.matches) setPaused(true);
    };
    update();
    preference.addEventListener?.("change", update);
    return () => preference.removeEventListener?.("change", update);
  }, []);

  React.useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
            threshold: 0.15,
          });
    if (rail.current) observer?.observe(rail.current);
    return () => {
      document.removeEventListener("visibilitychange", update);
      observer?.disconnect();
    };
  }, []);

  const goTo = React.useCallback(
    (index: number) => {
      if (stores.length === 0) return;
      const next = (index + stores.length) % stores.length;
      setActive(next);
      const element = rail.current;
      if (element?.clientWidth)
        element.scrollTo({
          left: element.clientWidth * next,
          behavior: reducedMotion ? "auto" : "smooth",
        });
    },
    [stores.length, reducedMotion],
  );

  React.useEffect(() => {
    if (stores.length < 2 || paused || hovered || reducedMotion || !visible || !pageVisible) return;
    const timer = window.setTimeout(() => goTo(active + 1), ROTATION_MS);
    return () => window.clearTimeout(timer);
  }, [stores.length, active, paused, hovered, reducedMotion, visible, pageVisible, goTo]);

  React.useEffect(() => {
    const align = () => {
      const element = rail.current;
      if (element?.clientWidth)
        element.scrollTo({ left: element.clientWidth * active, behavior: "auto" });
    };
    window.addEventListener("resize", align);
    return () => window.removeEventListener("resize", align);
  }, [active]);

  const manualGoTo = (index: number) => {
    setPaused(true);
    goTo(index);
  };

  return (
    <section
      id="upcoming-stores"
      aria-labelledby="home-upcoming-heading"
      aria-roledescription="carousel"
      className="space-y-3"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setHovered(false);
      }}
      onPointerDownCapture={(event) => {
        if (event.pointerType !== "mouse") setHovered(false);
      }}
      onFocusCapture={() => setPaused(true)}
    >
      <div className="space-y-1">
        <h2
          id="home-upcoming-heading"
          className="type-brand-heading text-[1.375rem] leading-tight text-text-primary"
        >
          Upcoming Branches
        </h2>
      </div>
      <div className="min-w-0 border-t border-divider bg-surface">
        <ul
          ref={rail}
          tabIndex={0}
          aria-label="Upcoming branches, scroll horizontally"
          aria-live="off"
          style={{ overscrollBehaviorY: "auto" }}
          className="flex w-full min-w-0 snap-x snap-mandatory overflow-x-auto overscroll-x-contain no-scrollbar focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          onPointerDown={() => setPaused(true)}
          onScroll={(event) => {
            const element = event.currentTarget;
            if (element.clientWidth)
              setActive(
                Math.max(
                  0,
                  Math.min(stores.length - 1, Math.round(element.scrollLeft / element.clientWidth)),
                ),
              );
          }}
          onKeyDown={(event) => {
            const index =
              event.key === "ArrowLeft"
                ? active - 1
                : event.key === "ArrowRight"
                  ? active + 1
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? stores.length - 1
                      : null;
            if (index === null) return;
            event.preventDefault();
            manualGoTo(index);
          }}
        >
          {stores.map((store, index) => (
            <li
              key={store.id}
              data-active={index === active}
              className="w-full min-w-0 shrink-0 snap-start px-4 py-4"
            >
              <div role="group" aria-roledescription="slide" aria-label={store.name}>
                <h3 className="type-subheading break-words text-base leading-snug text-text-primary">
                  {store.name}
                </h3>
                <p className="mt-1 type-caption break-words text-text-secondary">
                  {store.location}
                </p>
                {store.openingText && (
                  <p className="mt-2 type-caption break-words text-text-secondary">
                    {store.openingText}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
        <span className="sr-only" aria-live={paused ? "polite" : "off"}>
          {stores[active]?.name}
        </span>
      </div>
    </section>
  );
}
