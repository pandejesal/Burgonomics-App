import * as React from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Search, WifiOff, RefreshCw, ShoppingBag, ArrowRight, UtensilsCrossed } from "lucide-react";

import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { AppShell } from "@/shared/layouts/AppShell";
import { Skeleton } from "@/shared/components/feedback/Skeleton";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { useHydrated } from "@/shared/hooks/useHydrated";
import { useAppConfig } from "@/core/state/appConfigStore";

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

const SORTS: Array<{ id: OrderSortKey; label: string }> = [
  { id: "recent", label: "Newest" },
  { id: "oldest", label: "Oldest" },
  { id: "amount_high", label: "Amount ↑" },
  { id: "amount_low", label: "Amount ↓" },
];

const PAGE_SIZE = 10;

function OrderHistoryPage() {
  const navigate = useNavigate();
  const hydrated = useHydrated();
  const isOnline = useAppConfig((s) => s.isOnline);

  const [bucket, setBucket] = React.useState<OrderHistoryBucket>("ongoing");
  const [sort, setSort] = React.useState<OrderSortKey>("recent");
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

  // Load whenever any filter changes
  React.useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void orderRepository
      .listOrders({ bucket, sort, search, page: 1, pageSize: PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          setOrders(res.data.items);
          setHasMore(res.data.hasMore);
          setPage(1);
        } else {
          setError(res.error.message);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, bucket, sort, search]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const next = page + 1;
    const res = await orderRepository.listOrders({
      bucket,
      sort,
      search,
      page: next,
      pageSize: PAGE_SIZE,
    });
    if (res.success) {
      setOrders((prev) => [...prev, ...res.data.items]);
      setHasMore(res.data.hasMore);
      setPage(next);
    }
    setLoadingMore(false);
  };

  const handleRefresh = () => {
    setLoading(true);
    void orderRepository
      .listOrders({ bucket, sort, search, page: 1, pageSize: PAGE_SIZE })
      .then((res) => {
        if (res.success) {
          setOrders(res.data.items);
          setHasMore(res.data.hasMore);
          setPage(1);
        }
        setLoading(false);
      });
  };

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
            className="flex h-10 w-10 items-center justify-center rounded-full text-text-primary hover:bg-neutral-800 cursor-pointer"
          >
            <RefreshCw className={`h-4.5 w-4.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        }
      >
        <div className="mx-auto max-w-[540px] space-y-4 px-4 py-3 pb-24 select-none">
          {/* Offline Banner */}
          {!isOnline && (
            <div className="flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-950/40 p-3 text-xs text-amber-300">
              <WifiOff className="h-4 w-4 shrink-0" />
              <span>You're offline. Displaying cached orders.</span>
            </div>
          )}

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by Order # or item name..."
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-[#0D0D0D] border border-neutral-800 text-white placeholder-neutral-500 text-xs font-medium focus:outline-none focus:border-[#FF6600]"
            />
          </div>

          {/* Segmented Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#0D0D0D] border border-neutral-800">
            {BUCKETS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBucket(b.id)}
                className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer text-center ${
                  bucket === b.id
                    ? "bg-[#0E4825] border border-emerald-500/40 text-emerald-300 shadow-xs"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>

          {/* Orders Stream List */}
          {loading ? (
            <div className="space-y-3 pt-2">
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
            <div className="text-center py-16 bg-[#0D0D0D]/60 rounded-3xl border border-dashed border-neutral-800 p-8 space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-[#0E4825]/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <div>
                <h3 className="font-black text-white text-base">No Orders Found</h3>
                <p className="text-xs text-neutral-400 mt-1">
                  {bucket === "ongoing"
                    ? "You don't have any active orders cooking right now."
                    : "You haven't placed any past orders matching this filter."}
                </p>
              </div>

              <Link
                to="/menu"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#FF6600] hover:bg-[#e05a00] text-white font-black text-xs uppercase tracking-wider shadow-md transition-all active:scale-95"
              >
                <span>Order Your First Burger</span>
                <ArrowRight className="w-4 h-4" />
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
                    className="px-6 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {loadingMore ? "Loading more..." : "Load Older Feasts"}
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
