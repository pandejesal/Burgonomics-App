import * as React from "react";
import {
  resolveOutletOpenState,
  type KitchenHoursState,
  type OutletHoursDocuments,
} from "@/core/constants/operatingHours";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import type { Store } from "@/features/stores/models/Store";

/** Re-check cadence. Boundary precision only needs to be better than a minute. */
const TICK_MS = 30_000;

/**
 * Value equality for the resolver's verdict. `resolveOutletOpenState` returns a
 * fresh object on every call, so a refresh that published it unconditionally
 * would re-render (and re-arm the tick) even when nothing observable changed.
 */
export function sameKitchenHoursState(a: KitchenHoursState, b: KitchenHoursState): boolean {
  return (
    a.isOpen === b.isOpen &&
    a.minutesNow === b.minutesNow &&
    a.minutesUntilOpen === b.minutesUntilOpen &&
    a.minutesUntilClose === b.minutesUntilClose &&
    a.source === b.source &&
    a.openLabel === b.openLabel &&
    a.closeLabel === b.closeLabel &&
    a.closedByStaff === b.closedByStaff &&
    a.hoursInvalid === b.hoursInvalid
  );
}

/**
 * Projects a mapped outlet onto the resolver's document bag.
 *
 * The staff-close signal is a property of the storefront document
 * (`storeStatus.ts` stamps `isOpen: false` next to `storeStatusOverride`), so it
 * is always passed through. Hours keep their real provenance: a row seeded only
 * in the partner mirror enters as `adminStore`, never as `store`, so
 * `state.source` cannot claim a document that does not exist.
 *
 * Branch hours are deliberately absent: the customer app has no read path to
 * `branches/{id}` (the server gate resolves that level), and inventing a read
 * here would be a new private-data dependency for the menu screen.
 */
export function outletHoursDocuments(
  store: Store | null | undefined,
): Omit<OutletHoursDocuments, "now"> {
  if (!store) return {};

  const storefront = {
    isOpen: store.isOpen,
    storeStatusOverride: store.storeStatusOverride === true,
  };
  const fromStorefront = store.hours && store.hoursSource !== "admin_store" ? store.hours : null;
  const mirrorHours =
    store.hoursSource === "admin_store" ? store.hours : (store.adminStoreHours ?? null);

  return {
    store: fromStorefront ? { ...storefront, hours: fromStorefront } : storefront,
    adminStore: mirrorHours ? { hours: mirrorHours } : null,
  };
}

/**
 * Live kitchen-hours state.
 *
 * Menus and checkout screens stay open across opening/closing boundaries, so
 * a value computed once at mount goes stale and leaves the checkout button
 * enabled after closing time. This re-reads on a 30s tick and on tab focus so
 * a screen left open overnight re-locks itself when the customer returns.
 * The active outlet's own hours are passed to the one shared resolver.
 */
export function useKitchenHours(now: Date = new Date()): KitchenHoursState {
  const store = useStoreSelection((s: any) => s.activeStore);
  // A selector may return a new-but-equal store object (a shallow copy, a
  // rehydrate, or a test mock). `outletHoursDocuments` projects only JSON-safe
  // values (booleans/strings/null) and excludes the clock, so keying on the
  // projected JSON keeps equal stores from re-running the effect or re-arming
  // the interval, while a real hours change still refreshes the verdict.
  const docsKey = JSON.stringify(outletHoursDocuments(store));
  const documents = React.useMemo(
    () => JSON.parse(docsKey) as Omit<OutletHoursDocuments, "now">,
    [docsKey],
  );
  const [state, setState] = React.useState<KitchenHoursState>(() =>
    resolveOutletOpenState({ ...documents, now }),
  );

  React.useEffect(() => {
    const refresh = () =>
      setState((prev) => {
        const next = resolveOutletOpenState(documents);
        return sameKitchenHoursState(prev, next) ? prev : next;
      });
    refresh();

    const interval = setInterval(refresh, TICK_MS);
    // Coming back from a backgrounded WebView is the common case (app
    // backgrounded over the boundary, then resumed) — recheck immediately.
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [documents]);

  return state;
}
