import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Locate, RefreshCw, Search as SearchIcon, X, AlertTriangle, MapPin } from "lucide-react";
import { AppShell } from "@/shared/layouts/AppShell";
import { Text } from "@/shared/components/common/Text";
import { AppButton } from "@/shared/components/common/AppButton";
import { SearchBar } from "@/shared/components/common/SearchBar";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { FailureState } from "@/shared/components/feedback/FailureState";
import { Skeleton } from "@/shared/components/feedback/Skeleton";
import {
  StoreCard,
  NearestStoreSheet,
  FulfillmentSheet,
  useStoreSelection,
  storeSupportsFulfillment,
  useLocationPermission,
  type Store,
} from "@/features/stores";
import {
  useAddressStore,
  selectSelectedAddress,
  selectAddresses,
} from "@/features/addresses/state/addressStore";
import { toast } from "sonner";
import { ConfirmDialog } from "@/shared/components/common/ConfirmDialog";
import { cartRepository, useCartStore, selectHasItems } from "@/features/cart";
import { ModeSegmentedSwitch } from "@/features/home/components/ModeSegmentedSwitch";
import { cn } from "@/lib/utils";
import { haversineKm } from "@/features/stores/utils/distance";
import {
  hasUsableCoords,
  isStoreInDeliveryArea,
  selectVisibleStores,
  getDeliveryDistanceKm,
  MAX_PICKUP_DISTANCE_KM,
  PICKUP_TOO_FAR_MESSAGE,
} from "@/features/stores/utils/serviceArea";

/** Rounds a km distance to 1 decimal, or undefined when it is not usable. */
function roundKm(km: number): number | undefined {
  return Number.isFinite(km) ? Number.parseFloat(km.toFixed(1)) : undefined;
}

/**
 * Distance for display and sorting, ALWAYS recomputed from the position the
 * customer currently has. A `distanceKm` left over from an earlier read (or a
 * previous address) must never decide what the card claims.
 */
function withCurrentDistance(
  list: Store[],
  coords: { lat: number; lng: number } | null,
): Store[] {
  if (!coords) return list;
  return list.map((s) => ({
    ...s,
    distanceKm: roundKm(getDeliveryDistanceKm(s, coords.lat, coords.lng)),
  }));
}

/**
 * SCR-004 Store Selection.
 *
 * Public screen. Guests and authenticated users alike land here to pick
 * a store. The selected store is persisted via Zustand `persist` and
 * survives across sessions.
 */
export const Route = createFileRoute("/stores")({
  head: () => ({
    meta: [
      { title: "Choose a store — Burgonomics" },
      {
        name: "description",
        content: "Pick your nearest Burgonomics 100% Pure Vegetarian kitchen.",
      },
    ],
  }),
  component: StoreSelectionPage,
});

function StoreSelectionPage() {
  const navigate = useNavigate();
  const {
    activeStore,
    recentStores,
    searchHistory,
    stores,
    status,
    coords,
    error,
    fulfillment,
    loadStores,
    loadNearby,
    refresh,
    searchStores,
    setActiveStore,
    setFulfillment,
    addSearchTerm,
  } = useStoreSelection();

  const permission = useLocationPermission();
  
  // Get selected delivery address for coordinate precedence
  const selectedAddress = useAddressStore(selectSelectedAddress);
  // Only offer the saved-address shortcut when one actually exists.
  const savedAddresses = useAddressStore(selectAddresses);

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Store[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [nearestSheet, setNearestSheet] = useState<Store | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<Store | null>(null);
  const [fulfillmentFor, setFulfillmentFor] = useState<Store | null>(null);
  const [farStoreWarning, setFarStoreWarning] = useState<{ store: Store; distanceKm: number } | null>(null);

  const hasCartItems = useCartStore(selectHasItems);
  const cartStoreId = useCartStore((s) => s.storeId);

  const [sortBy, setSortBy] = useState<"distance" | "alphabetical">("alphabetical");

  // Position precedence:
  // (a) selected delivery address with a finite lat/lng
  // (b) device/cached GPS
  // (c) null -> the screen asks for a location instead of guessing one
  const userCoords = useMemo(() => {
    const addressCoords =
      selectedAddress?.lat !== undefined && selectedAddress?.lng !== undefined
        ? { lat: selectedAddress.lat, lng: selectedAddress.lng }
        : null;
    const candidate = addressCoords ?? coords ?? permission.coords ?? null;
    // A non-finite pair is "no position", never a position at (0,0).
    return hasUsableCoords(candidate) ? candidate : null;
  }, [selectedAddress, coords, permission.coords]);

  const hasLocation = hasUsableCoords(userCoords);
  // Delivery is also the policy for an unresolved mode (see serviceArea).
  const deliveryMode = fulfillment === "delivery" || fulfillment === null;

  /**
   * Delivery-area annotation for one card.
   *
   * Out-of-area is only ever true for DELIVERY mode when we actually know
   * where the user is (no position -> nothing is blocked). The distance is
   * backfilled from the user's coordinates so the badge can always say
   * "· X km away" even for a store row that never carried one.
   */
  const annotateForArea = (s: Store): { store: Store; outOfArea: boolean } => {
    const uc = userCoords;
    if (!uc) return { store: s, outOfArea: false };

    // Recomputed from the CURRENT position: a stale distanceKm from an earlier
    // read (or a previous address) must never decide the badge or the claim.
    const distanceKm = roundKm(getDeliveryDistanceKm(s, uc.lat, uc.lng));
    const store = distanceKm !== undefined ? { ...s, distanceKm } : s;
    const outOfArea =
      fulfillment === "delivery" && !isStoreInDeliveryArea(s, uc.lat, uc.lng);
    return { store, outOfArea };
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("burg.cached_coords");
      if (saved) {
        setSortBy("distance");
      }
    }
  }, []);

  const handleSortByDistance = async () => {
    if (sortBy === "distance") return;

    // Sorting by distance needs a position: ask for one instead of guessing.
    if (hasLocation) {
      setSortBy("distance");
      toast.success("Sorted by distance", {
        description: "Nearest kitchens are displayed first.",
      });
      return;
    }

    if (!hasLocation) {
      const res = await permission.request();
      if (res.status === "granted" && res.coords) {
        // The coords effect below owns the nearby re-rank.
        setSortBy("distance");
        toast.success("Sorted by distance", {
          description: "Nearest kitchens are displayed first.",
        });
      } else {
        toast.error("Location permission needed", {
          description: "Burgonomics needs GPS permissions to calculate distance and sort.",
        });
      }
    }
  };

  /**
   * First load: read the directory IMMEDIATELY, and ask for a position in
   * parallel. Waiting for the GPS prompt before reading anything is what made
   * the screen sit on its "ready + empty" default and claim there were no
   * stores.
   */
  useEffect(() => {
    // The directory read owns `status`. The location outcome must NOT rewrite
    // it: writing "permission_denied" while the read was still pending cleared
    // `directoryPending` and rendered a false "No stores" for a customer who
    // already had a usable saved address. Permission state is the hook's to
    // own, and it already exposes status/coords/error.
    void loadStores();
    void permission.request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * The single owner of position updates. `loadNearby` records the coordinates
   * and re-ranks the rows already in memory, so a granted fix can never
   * duplicate the directory read or start a second load race.
   */
  useEffect(() => {
    if (permission.status === "granted" && permission.coords) {
      void loadNearby(permission.coords);
    }
  }, [permission.coords, permission.status, loadNearby]);

  // Debounced search.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const results = await searchStores(q);
      if (cancelled) return;
      setSearchResults(results);
      setSearching(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, searchStores]);

  const onUseLocation = async () => {
    const res = await permission.request();
    if (res.status === "granted" && res.coords) {
      // The coords effect owns the re-rank; no second directory read here.
      if (res.error) {
        // P1-8: dev-only diagnostics — production never exposes raw GPS
        // errors or the mock Bandra fallback coordinates to customers.
        if (import.meta.env.DEV) {
          toast("Using simulated location", {
            description: "GPS failed: " + res.error + ". Fell back to mock Bandra coordinates.",
          });
        }
      } else {
        toast.success("Location updated", {
          description: "Showing stores nearest to your GPS position.",
        });
      }
    } else if (res.status === "denied") {
      toast("Location permission denied", {
        description: "You can still search or pick a store manually.",
      });
    } else if (res.status === "blocked") {
      toast("Location access is blocked", {
        description: "Enable location in system settings to use this feature.",
      });
    } else if (res.status === "unavailable") {
      toast("Location unavailable", {
        description:
          res.error || "Please make sure your device's GPS/location is enabled and try again.",
      });
    }
  };

  const onPullRefresh = async () => {
    setPulling(true);
    try {
      await refresh();
    } finally {
      // A thrown refresh must still release the spinner — otherwise the
      // refresh button spins forever with no recovery path.
      setPulling(false);
    }
  };

  /**
   * Applies the selection and navigates home.
   * Returns false when the delivery-area guard rejected it (that path has
   * already toasted the reason) so callers never announce or clean up as if
   * the switch had happened.
   */
  const commitSelection = (s: Store): boolean => {
    setActiveStore(s);
    // setActiveStore rejects out-of-area stores while DELIVERY is active (it
    // toasts the reason) — bail before we announce a selection that never
    // happened or navigate away as if it had.
    if (useStoreSelection.getState().activeStore?.id !== s.id) return false;
    if (query.trim()) addSearchTerm(query.trim());
    toast.success(`${s.name} selected`);
    let current = useStoreSelection.getState().fulfillment;
    if (!current || !storeSupportsFulfillment(s, current)) {
      if (s.supports.delivery) current = "delivery";
      else if (s.supports.takeaway) current = "takeaway";
      else if (s.supports.dineIn) current = "dinein";
      if (current) setFulfillment(current);
    }
    void navigate({ to: "/home" });
    return true;
  };

  const onSelect = (s: Store) => {
    // Distance enforcement: block selecting an outlet beyond the pickup
    // geofence (MAX_PICKUP_DISTANCE_KM) for takeaway or dine-in
    if (userCoords) {
      const distance = haversineKm(userCoords, { lat: s.lat, lng: s.lng });
      const currentF = useStoreSelection.getState().fulfillment;
      if (distance > MAX_PICKUP_DISTANCE_KM && (currentF === "takeaway" || currentF === "dinein")) {
        toast.error("Branch is too far away", {
          description: `${s.name} is ${Math.round(distance)} km away. ${PICKUP_TOO_FAR_MESSAGE}`,
        });
        return;
      }
      if (distance > 12 && (currentF === "takeaway" || currentF === "dinein")) {
        setFarStoreWarning({ store: s, distanceKm: Math.round(distance) });
        return;
      }
    }

    // Guard: switching stores wipes the cart because menu availability
    // and pricing may differ across stores.
    if (hasCartItems && cartStoreId && cartStoreId !== s.id) {
      setPendingSwitch(s);
      return;
    }
    commitSelection(s);
  };

  const confirmSwitch = () => {
    if (!pendingSwitch) return;
    const next = pendingSwitch;
    setPendingSwitch(null);
    setTimeout(() => {
      // Commit FIRST: if the delivery-area guard rejects the switch, the
      // cart must survive — a rejection that already cost the items would
      // be worse than no switch at all.
      if (!commitSelection(next)) return;
      void cartRepository.clear();
    }, 200);
  };

  const onConfirmNearest = (s: Store) => {
    setNearestSheet(null);
    setTimeout(() => {
      onSelect(s);
    }, 200);
  };

  const resolvingLocation = permission.status === "idle" || permission.status === "prompting";
  const directoryPending = (status === "idle" || status === "loading") && stores.length === 0;
  // Never a false "no stores": idle, the first GPS prompt and an in-flight read
  // are all loading states.
  const initialLoading = !error && (directoryPending || (!hasLocation && resolvingLocation));
  const locationRequired = !hasLocation && !resolvingLocation && !error;

  /**
   * ONE visibility policy for every list on this screen (all stores, nearby,
   * recently viewed, search results, nearest candidate). `selectVisibleStores`
   * fails closed without a position, so a missing location can never leak the
   * whole directory or a distant outlet into the UI.
   */
  const visibleAll = useMemo(
    () => selectVisibleStores(stores, userCoords, fulfillment),
    [stores, userCoords, fulfillment],
  );
  const visibleRecents = useMemo(
    () => selectVisibleStores(recentStores, userCoords, fulfillment),
    [recentStores, userCoords, fulfillment],
  );
  const visibleSearch = useMemo(
    () => (searchResults ? selectVisibleStores(searchResults, userCoords, fulfillment) : null),
    [searchResults, userCoords, fulfillment],
  );

  const listStores = useMemo(() => {
    const base = withCurrentDistance(visibleSearch ?? visibleAll, userCoords);
    if (sortBy === "distance" && userCoords) {
      return [...base].sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    }
    return base;
  }, [visibleSearch, visibleAll, sortBy, userCoords]);

  /** Nearest candidates: the same visible set, ranked by the current position. */
  const nearbyList = useMemo(
    () =>
      searchResults || !userCoords
        ? []
        : [...withCurrentDistance(visibleAll, userCoords)]
            .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
            .slice(0, 3),
    [visibleAll, searchResults, userCoords],
  );

  /**
   * Offer the nearest kitchen once per mount when nothing is selected yet. The
   * candidate is already radius-filtered; nothing is auto-selected and no cart
   * is touched — the sheet still asks.
   */
  const autoPromptedRef = React.useRef(false);
  useEffect(() => {
    if (autoPromptedRef.current || activeStore) return;
    const candidate = nearbyList[0];
    if (!candidate) return;
    autoPromptedRef.current = true;
    setNearestSheet(candidate);
  }, [nearbyList, activeStore]);

  // De-dupe rows already shown above: Recently viewed (2) and Nearby render
  // their own cards, so the All-stores list skips those ids when not
  // searching — no outlet appears twice. The map keeps the full set.
  const visibleStores = useMemo(() => {
    if (searchResults) return listStores;
    const shown = new Set([
      ...visibleRecents.slice(0, 2).map((s) => s.id),
      ...nearbyList.map((s) => s.id),
    ]);
    if (shown.size === 0) return listStores;
    return listStores.filter((s) => !shown.has(s.id));
  }, [listStores, searchResults, visibleRecents, nearbyList]);

  // Visual truth for the sort tabs: highlight Nearest only when live coords
  // exist to order by (listStores already falls back to alphabetical sort
  // without them, so highlighting sortBy alone would lie).
  const effectiveSortBy = sortBy === "distance" && userCoords ? "distance" : "alphabetical";

  const hasDirectoryRows = stores.length > 0;
  // Three distinct truths: nothing to show yet (loading), a real failure
  // (error), or zero rows that survive the radius for a known position.
  const showEmpty = !initialLoading && !error && !locationRequired && listStores.length === 0;

  return (
    <AppShell
      title="Choose a store"
      showTabs={false}
      showTopBar={true}
      // In-app back: Store Selection sits behind Home in the stack, so the
      // TopBar must render a real back control. Without `backTo` the header
      // rendered an empty placeholder and the only way out was the OS back
      // gesture. Gated on an existing selection so a cold launch (no store
      // yet) can't bounce back to Home's `replace`-to-/stores redirect loop.
      backTo={activeStore ? "/home" : undefined}
      rightSlot={
        <button
          type="button"
          onClick={() => void onPullRefresh()}
          aria-label="Refresh stores"
          className="grid h-11 w-11 place-items-center rounded-full hover:bg-bg-secondary"
        >
          <RefreshCw className={`h-5 w-5 ${pulling ? "animate-spin" : ""}`} aria-hidden />
        </button>
      }
    >
      <div className="mx-auto max-w-[520px] space-y-5 px-4 pb-8 pt-3">
        {/* Search + location */}
        <div className="space-y-2">
          {/* Mode is explicit, never inferred. The radius policy is per
              fulfillment (store radius for delivery, the 25 km pickup ceiling
              for takeaway/dine-in), so without this control an outlet that is
              pickup-eligible is unreachable from this screen and the empty
              copy's "switch mode" advice has no way to be followed. */}
          <ModeSegmentedSwitch value={fulfillment} onChange={setFulfillment} />
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <SearchBar
                placeholder="City, area or store"
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
                aria-label="Search stores"
                className={query ? "pr-12" : undefined}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 grid h-8 w-8 place-items-center rounded-full text-text-secondary hover:bg-bg-secondary"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
            <AppButton
              variant="outlined"
              size="sm"
              className="shrink-0"
              iconLeft={<Locate className="h-4 w-4" aria-hidden />}
              onClick={() => void onUseLocation()}
              loading={permission.status === "prompting"}
              aria-label="Use my current location"
            >
              Nearby
            </AppButton>
          </div>

          {permission.status === "prompting" && (
            <Text variant="caption" className="text-primary font-medium animate-pulse">
              Acquiring GPS location... Please wait.
            </Text>
          )}

          {locationRequired && (
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-warning" />
                <div className="space-y-1">
                  <Text variant="bodyMedium" className="font-semibold text-text-primary">
                    {permission.status === "blocked"
                      ? "Location is blocked"
                      : permission.status === "unavailable"
                        ? "GPS is unavailable"
                        : "Choose your location"}
                  </Text>
                  <Text variant="caption" className="text-text-secondary block">
                    {deliveryMode
                      ? "We only list kitchens that can deliver to your location, so set one to see them."
                      : "We only list kitchens within pickup range of your location, so set one to see them."}
                  </Text>
                  {permission.status === "blocked" && (
                    <Text variant="caption" className="text-[11px] font-medium text-text-secondary">
                      Turn location on in your browser or site settings, then tap Use my location.
                    </Text>
                  )}
                  {permission.status === "unavailable" && (
                    <Text variant="caption" className="text-[11px] font-medium text-text-secondary">
                      Make sure location services are enabled on your device, then try again.
                    </Text>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <AppButton
                  variant="outlined"
                  size="sm"
                  onClick={() => void onUseLocation()}
                  loading={permission.status === "prompting"}
                  iconLeft={<Locate className="h-3.5 w-3.5" />}
                  className="bg-surface text-xs font-semibold shrink-0 whitespace-nowrap"
                >
                  Use my location
                </AppButton>
                {savedAddresses.length > 0 && (
                  <AppButton
                    variant="outlined"
                    size="sm"
                    onClick={() => void navigate({ to: "/profile/addresses" })}
                    iconLeft={<MapPin className="h-3.5 w-3.5" />}
                    className="bg-surface text-xs font-semibold shrink-0 whitespace-nowrap"
                  >
                    Saved addresses
                  </AppButton>
                )}
              </div>
            </div>
          )}

          {hasLocation && !initialLoading && !locationRequired && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Text variant="caption" tone="secondary" className="flex items-center gap-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                  Showing stores near you.
                </Text>
              </div>
            </div>
          )}

          {!query && searchHistory.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {searchHistory.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => setQuery(term)}
                  className="inline-flex items-center gap-1 rounded-full border border-divider bg-surface px-3 py-1 type-caption text-text-secondary hover:border-primary/40"
                >
                  <SearchIcon className="h-3 w-3" aria-hidden />
                  {term}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Error: friendly copy, never raw backend strings. */}
        {error && !initialLoading && (
          <FailureState
            kind={
              /offline|network|fetch|failed to fetch|unavailable|timeout/i.test(error)
                ? "OFFLINE"
                : "UNKNOWN"
            }
            title="We couldn't load stores"
            message={
              /offline|network|fetch|failed to fetch|unavailable|timeout/i.test(error)
                ? "You're offline. Check your connection and try again."
                : "Something went wrong. Please try again."
            }
            onRetry={() => void refresh()}
          />
        )}

        {/* Loading skeleton mirrors the loaded card layout to avoid shift. */}
        {initialLoading && (
          <div
            className="space-y-2"
            role="status"
            aria-label="Loading stores"
            aria-busy="true"
            aria-live="polite"
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-[var(--radius-medium)] border border-divider bg-surface px-3 py-2.5"
              >
                <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              </div>
            ))}
          </div>
        )}

        {/* Recent stores */}
        {!searchResults && !initialLoading && !locationRequired && visibleRecents.length > 0 && (
          <section aria-labelledby="recent-stores">
            <Text
              as="h2"
              variant="titleMedium"
              tone="secondary"
              id="recent-stores"
              className="mb-2"
            >
              Recently viewed
            </Text>
            <div className="space-y-2">
              {visibleRecents.slice(0, 2).map((s) => {
                const { store, outOfArea } = annotateForArea(s);
                return (
                  <StoreCard
                    key={`recent-${s.id}`}
                    store={store}
                    selected={activeStore?.id === s.id}
                    onSelect={onSelect}
                    outOfArea={outOfArea}
                    fulfillment={fulfillment}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* Nearby */}
        {nearbyList.length > 0 && (
          <section aria-labelledby="nearby-stores">
            <Text
              as="h2"
              variant="titleMedium"
              tone="secondary"
              id="nearby-stores"
              className="mb-2"
            >
              Nearby
            </Text>
            <div className="space-y-2">
              {nearbyList.map((s) => {
                const { store, outOfArea } = annotateForArea(s);
                return (
                  <StoreCard
                    key={`nearby-${s.id}`}
                    store={store}
                    selected={activeStore?.id === s.id}
                    onSelect={onSelect}
                    outOfArea={outOfArea}
                    fulfillment={fulfillment}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* All / Search results */}
        {!initialLoading && !error && !locationRequired && (
          <section aria-labelledby="all-stores">
            <div className="mb-3 flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
              <Text as="h2" variant="titleMedium" tone="secondary" id="all-stores">
                {searchResults
                  ? `${listStores.length} result${listStores.length === 1 ? "" : "s"}`
                  : "All stores"}
              </Text>
              {searching ? (
                <Text variant="caption" tone="secondary">
                  Searching…
                </Text>
              ) : (
                <div
                  className="flex items-center gap-1 bg-bg-secondary p-0.5 rounded-lg border border-divider text-xs"
                  role="radiogroup"
                  aria-label="Sort stores"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={effectiveSortBy === "alphabetical"}
                    onClick={() => {
                      setSortBy("alphabetical");
                      toast.success("Sorted alphabetically");
                    }}
                    className={cn(
                      "px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer",
                      effectiveSortBy === "alphabetical"
                        ? "bg-surface text-text shadow-sm border border-divider/10"
                        : "text-text-secondary hover:text-text",
                    )}
                  >
                    Alphabetical
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={effectiveSortBy === "distance"}
                    onClick={() => void handleSortByDistance()}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer",
                      effectiveSortBy === "distance"
                        ? "bg-surface text-text shadow-sm border border-divider/10"
                        : "text-text-secondary hover:text-text",
                    )}
                  >
                    <Locate className="h-3 w-3" />
                    <span>Nearest</span>
                  </button>
                </div>
              )}
            </div>

            {showEmpty ? (
              searchResults ? (
                <EmptyState
                  title={`No stores in your area match "${query}"`}
                  description="Try a different city or area, or clear the search."
                  actionLabel="Clear search"
                  onAction={() => setQuery("")}
                />
              ) : hasDirectoryRows ? (
                <EmptyState
                  title={deliveryMode ? "No stores deliver here yet" : "No stores nearby for pickup"}
                  description={
                    fulfillment === "takeaway" || fulfillment === "dinein"
                      ? `Every kitchen is beyond the ${MAX_PICKUP_DISTANCE_KM} km pickup range for this location. Choose a closer address or switch to delivery.`
                      : "Every kitchen is outside the delivery area for this location. Choose a closer address or switch to takeaway."
                  }
                  actionLabel="Use my location"
                  onAction={() => void onUseLocation()}
                />
              ) : (
                <EmptyState
                  title="No stores found"
                  description="No stores are available right now."
                  actionLabel="Retry"
                  onAction={() => void refresh()}
                />
              )
            ) : (
              <div className="space-y-2">
                {visibleStores.map((s) => {
                  const { store, outOfArea } = annotateForArea(s);
                  return (
                    <StoreCard
                      key={s.id}
                      store={store}
                      selected={activeStore?.id === s.id}
                      onSelect={onSelect}
                      outOfArea={outOfArea}
                      fulfillment={fulfillment}
                    />
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>

      <NearestStoreSheet
        open={!!nearestSheet}
        onOpenChange={(o) => !o && setNearestSheet(null)}
        store={nearestSheet}
        onConfirm={onConfirmNearest}
        onChoose={() => setNearestSheet(null)}
        fulfillment={fulfillment}
        userCoords={userCoords}
      />

      <ConfirmDialog
        open={!!pendingSwitch}
        onOpenChange={(o) => !o && setPendingSwitch(null)}
        title="Switch stores and clear cart?"
        description={
          pendingSwitch
            ? `Your cart has items from another store. Switching to ${pendingSwitch.name} will clear your cart because menu availability may differ.`
            : undefined
        }
        confirmLabel="Switch & clear"
        cancelLabel="Stay here"
        destructive
        onConfirm={() => void confirmSwitch()}
      />

      <ConfirmDialog
        open={!!farStoreWarning}
        onOpenChange={(o) => !o && setFarStoreWarning(null)}
        title="Outlet is Far Away"
        description={
          farStoreWarning
            ? `${farStoreWarning.store.name} is ${farStoreWarning.distanceKm} km away from your location. Are you sure you want to select this branch for takeaway or dine-in?`
            : undefined
        }
        confirmLabel="Yes, I'm heading there"
        cancelLabel="Choose Closer Branch"
        onConfirm={() => {
          if (farStoreWarning) {
            const chosen = farStoreWarning.store;
            setFarStoreWarning(null);
            if (hasCartItems && cartStoreId && cartStoreId !== chosen.id) {
              setPendingSwitch(chosen);
            } else {
              commitSelection(chosen);
            }
          }
        }}
      />

      <FulfillmentSheet
        open={!!fulfillmentFor}
        onOpenChange={(o) => !o && setFulfillmentFor(null)}
        store={fulfillmentFor ?? activeStore}
        value={fulfillment}
        onConfirm={(f) => {
          setFulfillment(f);
          setFulfillmentFor(null);
          setTimeout(() => {
            void navigate({ to: "/home" });
          }, 200);
        }}
      />
    </AppShell>
  );
}
