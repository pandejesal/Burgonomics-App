import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search, WifiOff } from "lucide-react";

import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { AppShell } from "@/shared/layouts/AppShell";
import { AppButton } from "@/shared/components/common/AppButton";
import { Text } from "@/shared/components/common/Text";
import { Skeleton } from "@/shared/components/feedback/Skeleton";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { useHydrated } from "@/shared/hooks/useHydrated";
import { useAppConfig } from "@/core/state/appConfigStore";
import { cn } from "@/lib/utils";

import {
  orderRepository,
  OrderCard,
  type Order,
  type OrderHistoryBucket,
  type OrderSortKey,
} from "@/features/orders";

export const Route = createFileRoute("/orders/")({
  head: () => ({
    meta: [
      { title: "Orders — Burgonomics" },
      { name: "description", content: "All your past and active orders." },
    ],
  }),
  component: OrderHistoryPage,
});

const BUCKETS: Array<{ id: OrderHistoryBucket; label: string }> = [
  { id: "ongoing", label: "Ongoing" },
  { id: "past", label: "Past" },
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

  return (
    <ProtectedRoute>
      <AppShell title="Orders" backTo="/profile" showTabs showTopBar>
        <div className="mx-auto max-w-[560px] px-4 py-4">
          {/* Bucket tabs */}
          <div
            role="tablist"
            aria-label="Order status"
            className="mb-3 inline-flex rounded-full border border-divider bg-surface p-1"
          >
            {BUCKETS.map((b) => {
              const active = b.id === bucket;
              return (
                <button
                  key={b.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setBucket(b.id)}
                  className={cn(
                    "px-4 py-1.5 rounded-full type-label-large min-h-[36px] transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-text-secondary hover:text-text-primary",
                  )}
                >
                  {b.label}
                </button>
              );
            })}
          </div>

          {/* Search + sort */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="relative flex-1 min-w-[180px]">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
                aria-hidden
              />
              <input
                type="search"
                aria-label="Search orders"
                placeholder="Search order or item…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="h-11 w-full rounded-full border border-divider bg-surface pl-10 pr-4 type-body-medium placeholder:text-text-disabled focus:border-primary focus:outline-none"
              />
            </label>
            <select
              aria-label="Sort orders"
              value={sort}
              onChange={(e) => setSort(e.target.value as OrderSortKey)}
              className="h-11 rounded-full border border-divider bg-surface px-3 type-body-medium focus:border-primary focus:outline-none"
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {!isOnline && (
            <div className="mb-3 flex items-center gap-2 rounded-[var(--radius-medium)] bg-warning/10 p-3 text-warning">
              <WifiOff className="h-4 w-4" aria-hidden />
              <Text variant="caption" tone="secondary">
                You're offline. Showing cached orders.
              </Text>
            </div>
          )}

          {error && (
            <div className="mb-3 rounded-[var(--radius-medium)] bg-error/10 p-3 text-error">
              <Text variant="bodyMedium" tone="error">
                {error}
              </Text>
            </div>
          )}

          {/* List */}
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : orders.length === 0 ? (
            <EmptyState
              title={
                bucket === "ongoing"
                  ? "No ongoing orders"
                  : bucket === "cancelled"
                    ? "No cancelled orders"
                    : "No past orders"
              }
              description={
                bucket === "ongoing"
                  ? "When you place a new order, it will appear here."
                  : "Your order history will show up here."
              }
              actionLabel="Browse menu"
              onAction={() => navigate({ to: "/menu" })}
            />
          ) : (
            <>
              <ul className="space-y-3" aria-label="Order list">
                {orders.map((o) => (
                  <li key={o.id}>
                    <OrderCard order={o} />
                  </li>
                ))}
              </ul>
              {hasMore && (
                <div className="mt-4 flex justify-center">
                  <AppButton
                    variant="outlined"
                    loading={loadingMore}
                    onClick={() => void loadMore()}
                  >
                    Load more
                  </AppButton>
                </div>
              )}
            </>
          )}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
