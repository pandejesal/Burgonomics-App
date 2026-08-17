import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Locate, RefreshCw, Search as SearchIcon, X, AlertTriangle } from "lucide-react";
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
import { toast } from "sonner";
import { ConfirmDialog } from "@/shared/components/common/ConfirmDialog";
import { cartRepository, useCartStore, selectHasItems } from "@/features/cart";
import { cn } from "@/lib/utils";
import { haversineKm } from "@/features/stores/utils/distance";

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
    nearby,
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
    markPermissionDenied,
  } = useStoreSelection();

  const permission = useLocationPermission();

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Store[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [nearestSheet, setNearestSheet] = useState<Store | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<Store | null>(null);
  const [fulfillmentFor, setFulfillmentFor] = useState<Store | null>(null);

  const hasCartItems = useCartStore(selectHasItems);
  const cartStoreId = useCartStore((s) => s.storeId);

  const [sortBy, setSortBy] = useState<"distance" | "alphabetical">("alphabetical");

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

    const activeCoords = coords ?? permission.coords;
    if (!activeCoords) {
      const res = await permission.request();
      if (res.status === "granted" && res.coords) {
        await loadNearby(res.coords);
        setSortBy("distance");
        toast.success("Sorted by distance", {
          description: "Nearest kitchens are displayed first.",
        });
      } else {
        toast.error("Location permission needed", {
          description: "Burgonomics needs GPS permissions to calculate distance and sort.",
        });
      }
    } else {
      setSortBy("distance");
      toast.success("Sorted by distance", {
        description: "Nearest kitchens are displayed first.",
      });
    }
  };

  // Initial load — try location first; fall back to a coord-less list.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // If we already have cached coordinates, load nearby immediately!
      if (permission.coords && permission.status === "granted") {
        await loadNearby(permission.coords);
        return;
      }

      if (status !== "idle" && stores.length > 0) return;
      const res = await permission.request();
      if (cancelled) return;
      if (res.status === "granted" && res.coords) {
        await loadNearby(res.coords);
        const s = useStoreSelection.getState();
        // Only prompt the nearest-store sheet when nothing is selected yet.
        if (!s.activeStore && s.nearby[0]) {
          setNearestSheet(s.nearby[0]);
        }
      } else {
        if (res.status === "denied" || res.status === "blocked") {
          markPermissionDenied();
        }
        await loadStores();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync background coordinates and recalculate nearby stores dynamically
  useEffect(() => {
    if (permission.coords && permission.status === "granted") {
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
    setSearching(true);
    const t = setTimeout(async () => {
      const results = await searchStores(q);
      setSearchResults(results);
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query, searchStores]);

  const onUseLocation = async () => {
    const res = await permission.request();
    if (res.status === "granted" && res.coords) {
      await loadNearby(res.coords);
      const first = useStoreSelection.getState().nearby[0];
      if (first) {
        setNearestSheet(first);
      }
      if (res.error) {
        // This occurs if it fell back to mock in dev mode
        toast("Using simulated location", {
          description: "GPS failed: " + res.error + ". Fell back to mock Bandra coordinates.",
        });
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
    await refresh();
    setPulling(false);
  };

  const commitSelection = (s: Store) => {
    setActiveStore(s);
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
  };

  const onSelect = (s: Store) => {
    // Guard: switching stores wipes the cart because menu availability
    // and pricing may differ across stores.
    if (hasCartItems && cartStoreId && cartStoreId !== s.id) {
      setPendingSwitch(s);
      return;
    }
    commitSelection(s);
  };

  const confirmSwitch = async () => {
    if (!pendingSwitch) return;
    await cartRepository.clear();
    const next = pendingSwitch;
    setPendingSwitch(null);
    setTimeout(() => {
      commitSelection(next);
    }, 200);
  };

  const onConfirmNearest = (s: Store) => {
    setNearestSheet(null);
    setTimeout(() => {
      onSelect(s);
    }, 200);
  };

  const initialLoading =
    (status === "loading" || status === "detecting_location") && stores.length === 0;

  const listStores = useMemo(() => {
    const baseList = searchResults ?? stores;
    const activeCoords = coords ?? permission.coords;

    if (sortBy === "distance" && activeCoords) {
      return [...baseList]
        .map((s) => ({
          ...s,
          distanceKm: s.distanceKm ?? haversineKm(activeCoords, { lat: s.lat, lng: s.lng }),
        }))
        .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    }

    return [...baseList].sort((a, b) => a.name.localeCompare(b.name));
  }, [searchResults, stores, sortBy, coords, permission.coords]);

  const nearbyList = useMemo(
    () => (searchResults ? [] : nearby.slice(0, 3)),
    [nearby, searchResults],
  );

  const showEmpty = !initialLoading && !error && listStores.length === 0;

  return (
    <AppShell
      title="Choose a store"
      showTabs={false}
      showTopBar={true}
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
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <SearchBar
                placeholder="Search by city, area, or store"
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
                aria-label="Search stores"
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

          {permission.status === "unavailable" && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 space-y-2">
              <div className="flex items-start gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <Text variant="bodyMedium" className="font-semibold text-red-800">
                    GPS Signal Offline
                  </Text>
                  <Text variant="caption" className="text-red-700 block">
                    Please make sure location service is enabled on your device and try again.
                  </Text>
                </div>
              </div>
              <AppButton
                variant="outlined"
                size="sm"
                onClick={() => void onUseLocation()}
                loading={permission.isLoading}
                iconLeft={<Locate className="h-3.5 w-3.5" />}
                className="bg-surface text-xs font-semibold"
              >
                Retry GPS
              </AppButton>
            </div>
          )}

          {(permission.status === "denied" ||
            permission.status === "blocked" ||
            status === "permission_denied") && (
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-amber-600" />
                <div className="space-y-1">
                  <Text variant="bodyMedium" className="font-semibold text-amber-800">
                    Location Access Needed
                  </Text>
                  <Text variant="caption" className="text-amber-700 block">
                    To display nearest kitchens, calculate exact distances, and estimate delivery
                    travel times, Burgonomics needs access to your location coordinates.
                  </Text>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <AppButton
                  variant="outlined"
                  size="sm"
                  onClick={() => void onUseLocation()}
                  loading={permission.status === "prompting"}
                  iconLeft={<Locate className="h-3.5 w-3.5" />}
                  className="bg-surface text-xs font-semibold"
                >
                  Retry Detection
                </AppButton>
                <Text variant="caption" tone="secondary" className="text-[11px] font-medium">
                  or pick a kitchen manually below:
                </Text>
              </div>
            </div>
          )}

          {coords && status !== "permission_denied" && permission.status !== "prompting" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Text variant="caption" tone="secondary" className="flex items-center gap-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
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

        {/* Error */}
        {error && !initialLoading && (
          <FailureState
            kind="UNKNOWN"
            title="We couldn't load stores"
            message={error}
            onRetry={() => void refresh()}
          />
        )}

        {/* Loading skeleton */}
        {initialLoading && (
          <div className="space-y-2" aria-busy="true" aria-live="polite">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-[var(--radius-medium)] border border-divider bg-surface p-3"
              >
                <Skeleton className="h-12 w-12 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recent stores */}
        {!searchResults && !initialLoading && recentStores.length > 0 && (
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
              {recentStores.slice(0, 2).map((s) => (
                <StoreCard
                  key={`recent-${s.id}`}
                  store={s}
                  selected={activeStore?.id === s.id}
                  onSelect={onSelect}
                />
              ))}
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
              {nearbyList.map((s) => (
                <StoreCard
                  key={`nearby-${s.id}`}
                  store={s}
                  selected={activeStore?.id === s.id}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </section>
        )}

        {/* All / Search results */}
        {!initialLoading && !error && (
          <section aria-labelledby="all-stores">
            <div className="mb-3 flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
              <Text as="h2" variant="titleMedium" tone="secondary" id="all-stores">
                {searchResults
                  ? `${searchResults.length} result${searchResults.length === 1 ? "" : "s"}`
                  : "All stores"}
              </Text>
              {searching ? (
                <Text variant="caption" tone="secondary">
                  Searching…
                </Text>
              ) : (
                <div className="flex items-center gap-1 bg-bg-secondary p-0.5 rounded-lg border border-divider text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setSortBy("alphabetical");
                      toast.success("Sorted alphabetically");
                    }}
                    className={cn(
                      "px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer",
                      sortBy === "alphabetical"
                        ? "bg-surface text-text shadow-sm border border-divider/10"
                        : "text-text-secondary hover:text-text",
                    )}
                  >
                    Alphabetical
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSortByDistance()}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer",
                      sortBy === "distance"
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
              <EmptyState
                title="No stores found"
                description={
                  query
                    ? `We couldn't find a store matching "${query}". Try a different city or area.`
                    : "No stores are available right now."
                }
                actionLabel={query ? "Clear search" : "Retry"}
                onAction={() => (query ? setQuery("") : void refresh())}
              />
            ) : (
              <div className="space-y-2">
                {listStores.map((s) => (
                  <StoreCard
                    key={s.id}
                    store={s}
                    selected={activeStore?.id === s.id}
                    onSelect={onSelect}
                  />
                ))}
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
