import * as React from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Search, WifiOff, RefreshCw, ShoppingBag, ArrowRight, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";

import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { AppShell } from "@/shared/layouts/AppShell";
import { Skeleton } from "@/shared/components/feedback/Skeleton";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { useHydrated } from "@/shared/hooks/useHydrated";
import { useAppConfig } from "@/core/state/appConfigStore";
import { toUserMessage } from "@/core/errors/userMessages";

import {
  orderRepository,
  OrderHistoryCard,
  type Order,
  type OrderHistoryBucket,
  type OrderSortKey,
} from "@/features/orders";

export const Route = createFileRoute("/orders/")({
  head: () => ({
    meta: [
      { title: "Orders — Burgonomics" },
      { name: "description", content: "All your past and active orders with 1-tap reorder." },
    ],
  }),
  component: OrderHistoryPage,
});

const BUCKETS: Array<{ id: OrderHistoryBucket; label: string }> = [
  { id: "ongoing", label: "Active Orders" },
  { id: "past", label: "Past Feasts" },
  { id: "cancelled", label: "Cancelled" },
];

const PAGE_SIZE = 10;

function OrderHistoryPage() {
  const navigate = useNavigate();
  const hydrated = useHydrated();
  const isOnline = useAppConfig((s) => s.isOnline);

  const [bucket, setBucket] = React.useState<OrderHistoryBucket>("ongoing");
  // L1: no sort control is rendered, so the list order is fixed. Keep the key
  // as a constant instead of a dead setter/SORTS list that implies a feature
  // the UI never offers.
  const sort: OrderSortKey = "recent";
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Debounce search input
  React.useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  // CUST-F1: one monotonic token covers every list read. A response may only
  // write state while it is still the newest request. Without this, a slow
  // refresh (or pagination append) started under one tab could land AFTER a
  // newer tab's response and paint the wrong rows / wrong pagination state —
  // the per-effect `cancelled` flag cannot see across these entry points.
  const requestGeneration = React.useRef(0);
  const isMounted = React.useRef(true);
  // Latest filter snapshot for cross-path validity checks (loadMore). Assigned
  // in an effect (not during render) — loadMore fires from post-commit events.
  const filterRef = React.useRef({ bucket, search });
  React.useEffect(() => {
    filterRef.current = { bucket, search };
  }, [bucket, search]);
  React.useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  const isCurrentRequest = React.useCallback((gen: number) => {
    return isMounted.current && gen === requestGeneration.current;
  }, []);

  const applyListResult = React.useCallback(
    (
      res: Awaited<ReturnType<typeof orderRepository.listOrders>>,
      origin: "list" | "refresh",
    ) => {
      if (res.success) {
        setOrders(res.data.items);
        setHasMore(res.data.hasMore);
        setPage(1);
        setError(null);
      } else {
        // Failure branch is typed raw-capable (OrderRepository) — log + map,
        // keeping the original per-path log tag for triage.
        console.error(`[orders] ${origin} failed:`, res.error);
        setError(toUserMessage(res));
      }
    },
    [],
  );

  // Load whenever any filter changes
  React.useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    const gen = ++requestGeneration.current;
    setLoading(true);
    setError(null);
    void orderRepository
      .listOrders({ bucket, sort, search, page: 1, pageSize: PAGE_SIZE })
      .then((res) => {
        if (cancelled || !isCurrentRequest(gen)) return;
        applyListResult(res, "list");
      })
      .catch((err) => {
        // A thrown rejection must end the skeleton and offer a retry (P1-8:
        // raw text is dropped to the generic copy), never spin forever.
        if (cancelled || !isCurrentRequest(gen)) return;
        console.error("[orders] list exception:", err);
        setError(toUserMessage(err));
      })
      .finally(() => {
        if (cancelled || !isCurrentRequest(gen)) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, bucket, sort, search, applyListResult, isCurrentRequest]);

  const loadMore = React.useCallback(async () => {
    if (loadingMore || !hasMore) return;
    // The response must still be the newest intent AND the filter must be
    // unchanged from click to resolution. Generation closes the ABA window
    // (load more -> switch tab -> switch back: the first visit's page 2 must
    // never land on the second visit's fresh page 1) and refresh-during-
    // loadMore; the filter snapshot refuses cross-bucket/search appends.
    const requestedBucket = bucket;
    const requestedSearch = search;
    const requestedPage = page + 1;
    const gen = requestGeneration.current;
    const stillRelevant = () =>
      isMounted.current &&
      gen === requestGeneration.current &&
      requestedBucket === filterRef.current.bucket &&
      requestedSearch === filterRef.current.search;
    setLoadingMore(true);
    try {
      const res = await orderRepository.listOrders({
        bucket: requestedBucket,
        sort,
        search: requestedSearch,
        page: requestedPage,
        pageSize: PAGE_SIZE,
      });
      if (!stillRelevant()) return;
      if (res.success) {
        if (res.data.page !== requestedPage) {
          // OrderRepository's empty-page local fallback echoes page 1 with the
          // whole remaining list; appending it to a later page would duplicate
          // rows. Fail-closed on pagination too: a re-armed button here would
          // silently no-op on every further tap, so pagination ends instead
          // (repository owner: features/orders — the echo itself may be worth
          // strengthening there; this guard stays client-side).
          console.error("[orders] load more page mismatch:", {
            requestedPage,
            served: res.data.page,
          });
          setHasMore(false);
          return;
        }
        setOrders((prev) => [...prev, ...res.data.items]);
        setHasMore(res.data.hasMore);
        setPage(requestedPage);
      } else {
        console.error("[orders] load more failed:", res.error);
        toast.error("Couldn't load older feasts", { description: toUserMessage(res) });
      }
    } catch (err) {
      // Never a silent no-op: the customer tapped the control and must get
      // feedback (raw text stays out of the toast — P1-8). But only for the
      // context the customer is still looking at — an abandoned request that
      // rejects after a tab switch must not toast against the new bucket.
      if (!stillRelevant()) return;
      console.error("[orders] load more exception:", err);
      toast.error("Couldn't load older feasts", { description: toUserMessage(err) });
    } finally {
      if (isMounted.current) setLoadingMore(false);
    }
  }, [loadingMore, hasMore, bucket, search, page, sort]);

  const handleRefresh = React.useCallback(() => {
    const gen = ++requestGeneration.current;
    setLoading(true);
    void orderRepository
      .listOrders({ bucket, sort, search, page: 1, pageSize: PAGE_SIZE })
      .then((res) => {
        if (!isCurrentRequest(gen)) return;
        applyListResult(res, "refresh");
      })
      .catch((err) => {
        if (!isCurrentRequest(gen)) return;
        console.error("[orders] refresh exception:", err);
        setError(toUserMessage(err));
      })
      .finally(() => {
        if (!isCurrentRequest(gen)) return;
        setLoading(false);
      });
  }, [bucket, sort, search, applyListResult, isCurrentRequest]);

  return (
    <ProtectedRoute>
      <AppShell
        title="Your Orders"
        showTabs
        showTopBar
        rightSlot={
          <button
            type="button"
            aria-label="Refresh orders"
            onClick={handleRefresh}
            className="flex h-11 w-11 items-center justify-center rounded-full text-text-primary hover:bg-bg-secondary cursor-pointer"
          >
            <RefreshCw className={`h-4.5 w-4.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
          </button>
        }
      >
        <div className="mx-auto max-w-[540px] space-y-5 px-4 pb-24 pt-4 select-none">
          {/* Offline Banner */}
          {!isOnline && (
            <div className="flex items-center gap-2.5 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm font-medium text-warning">
              <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
              <span>You're offline. Displaying cached orders.</span>
            </div>
          )}

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" aria-hidden />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => {
                // Invalidate in-flight reads the moment the customer types —
                // closing the window between setBucket/setSearch commit and
                // the filtering effect registering its own generation.
                requestGeneration.current += 1;
                setSearchInput(e.target.value);
              }}
              placeholder="Search by Order # or item name…"
              aria-label="Search orders"
              className="min-h-11 w-full rounded-2xl border border-divider bg-surface py-2.5 pl-10 pr-4 text-base font-medium text-text placeholder:text-text-secondary focus:border-primary focus:outline-none"
            />
          </div>

          {/* Segmented Filter Tabs */}
          <div className="flex items-center gap-1.5 rounded-2xl border border-divider bg-bg-secondary p-1.5">
            {BUCKETS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  // Same pre-effect invalidation as the search setter above.
                  requestGeneration.current += 1;
                  setBucket(b.id);
                }}
                aria-pressed={bucket === b.id}
                className={`min-h-11 flex-1 rounded-xl px-3 py-2 text-center text-sm font-semibold transition-colors cursor-pointer ${
                  bucket === b.id
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-text-secondary hover:text-text"
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>

          {/* Orders Stream List */}
          {loading ? (
            <div className="space-y-4 pt-2">
              <Skeleton className="h-44 w-full rounded-3xl" />
              <Skeleton className="h-44 w-full rounded-3xl" />
              <Skeleton className="h-44 w-full rounded-3xl" />
            </div>
          ) : error ? (
            <EmptyState
              title="Failed to load orders"
              description={error}
              actionLabel="Try Again"
              onAction={handleRefresh}
            />
          ) : orders.length === 0 ? (
            <div className="space-y-4 rounded-3xl border border-dashed border-divider bg-surface p-8 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary-text">
                <ShoppingBag className="h-8 w-8" aria-hidden />
              </div>
              <div className="space-y-1">
                <h3 className="type-title-large text-text">No Orders Found</h3>
                <p className="text-sm leading-relaxed text-text-secondary">
                  {bucket === "ongoing"
                    ? "You don't have any active orders cooking right now."
                    : "You haven't placed any past orders matching this filter."}
                </p>
              </div>

              <Link
                to="/menu"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition-colors hover:bg-primary-hover active:scale-95"
              >
                <span>Order your first burger</span>
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          ) : (
            <div className="space-y-4 pt-1">
              {orders.map((order) => (
                <OrderHistoryCard key={order.id} order={order} />
              ))}

              {hasMore && (
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={() => void loadMore()}
                    className="min-h-11 rounded-xl border border-divider bg-surface px-6 py-2 text-sm font-semibold text-text transition-colors hover:bg-bg-secondary disabled:opacity-50 cursor-pointer"
                  >
                    {loadingMore ? "Loading more…" : "Load Older Feasts"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}

export default OrderHistoryPage;
