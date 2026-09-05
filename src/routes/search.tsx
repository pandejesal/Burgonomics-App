import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useEffect, useRef, useState, useMemo } from "react";
import { Search as SearchIcon, X, Clock, Tag, Mic, ScanLine, Flame, Sparkles, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/shared/layouts/AppShell";
import { Text } from "@/shared/components/common/Text";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { FailureState } from "@/shared/components/feedback/FailureState";
import { MenuSkeleton } from "@/features/menu/components/MenuSkeleton";
import { MenuProductCard } from "@/features/menu/components/MenuProductCard";
import { ProductCustomizerModal } from "@/features/menu/components/ProductCustomizerModal";

import { useStoreSelection } from "@/features/stores/state/storeStore";
import { useSearchStore, type SearchKind } from "@/features/menu/state/searchStore";
import { cartRepository, FloatingCartBar } from "@/features/cart";
import { useHydrated } from "@/shared/hooks/useHydrated";
import type { Product } from "@/features/menu/models";
import { HapticService } from "@/core/services/haptics";
import { cn } from "@/lib/utils";

interface SearchParamsSchema {
  q?: string;
  filter?: string;
  kind?: SearchKind;
}

const DIET_FILTER_TAGS = [
  { id: "all", label: "All Items" },
  { id: "jain", label: "Jain Friendly", icon: ShieldCheck },
  { id: "bestseller", label: "Chef Special", icon: Sparkles },
  { id: "spicy", label: "Spicy", icon: Flame },
  { id: "protein", label: "High Protein", icon: Tag },
];

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>): SearchParamsSchema => ({
    q: typeof search.q === "string" && search.q.trim() ? search.q.trim() : undefined,
    filter: typeof search.filter === "string" && search.filter.trim() ? search.filter.trim() : undefined,
    kind: ["all", "product", "combo", "category", "offer"].includes(search.kind as string)
      ? (search.kind as SearchKind)
      : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Search — Burgonomics (100% Pure Vegetarian)" },
      { name: "description", content: "Instant search the 100% Pure Veg Burgonomics menu with diet filters." },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const navigate = useNavigate();
  const searchParams = Route.useSearch();
  const store = useStoreSelection((s) => s.activeStore);

  const hydrated = useHydrated();

  const query = useSearchStore((s) => s.query);
  const status = useSearchStore((s) => s.status);
  const results = useSearchStore((s) => s.results);
  const suggestions = useSearchStore((s) => s.suggestions);
  const recent = useSearchStore((s) => s.recent);
  const trending = useSearchStore((s) => s.trending);
  const kind = useSearchStore((s) => s.kind);
  const error = useSearchStore((s) => s.error);
  const setQuery = useSearchStore((s) => s.setQuery);
  const setKind = useSearchStore((s) => s.setKind);
  const submit = useSearchStore((s) => s.submit);
  const fetchSuggestions = useSearchStore((s) => s.fetchSuggestions);
  const fetchTrending = useSearchStore((s) => s.fetchTrending);
  const removeRecent = useSearchStore((s) => s.removeRecent);
  const clearRecent = useSearchStore((s) => s.clearRecent);

  // Active diet filter
  const [activeFilter, setActiveFilter] = useState<string>(searchParams.filter || "all");
  const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null);

  useEffect(() => {
    useSearchStore.persist.rehydrate();
    void fetchTrending(store?.id);
  }, [store?.id, fetchTrending]);

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Sync initial query from URL search params
  useEffect(() => {
    if (searchParams.q && searchParams.q !== query) {
      setQuery(searchParams.q);
      void submit(store?.id);
    }
    if (searchParams.kind && searchParams.kind !== kind) {
      setKind(searchParams.kind);
    }
    if (searchParams.filter && searchParams.filter !== activeFilter) {
      setActiveFilter(searchParams.filter);
    }
  }, [searchParams.q, searchParams.kind, searchParams.filter, store?.id]);

  // Debounced search (300ms) with search param sync
  useEffect(() => {
    const q = query.trim();
    if (!q) return;

    const timer = setTimeout(() => {
      void fetchSuggestions(store?.id);
      void submit(store?.id);
      void navigate({
        to: "/search",
        search: (prev: SearchParamsSchema) => ({ ...prev, q, filter: activeFilter !== "all" ? activeFilter : undefined }),
        replace: true,
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [query, store?.id, activeFilter, fetchSuggestions, submit, navigate]);

  const [submitting, setSubmitting] = useState(false);
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    void HapticService.impact("light");
    setSubmitting(true);
    await submit(store?.id);
    setSubmitting(false);
  };

  const runRecent = async (q: string) => {
    void HapticService.impact("light");
    setQuery(q);
    await submit(store?.id);
    void navigate({
      to: "/search",
      search: (prev: SearchParamsSchema) => ({ ...prev, q }),
      replace: true,
    });
  };

  const handleFilterSelect = (filterId: string) => {
    void HapticService.selection();
    setActiveFilter(filterId);
    void navigate({
      to: "/search",
      search: (prev: SearchParamsSchema) => ({
        ...prev,
        filter: filterId !== "all" ? filterId : undefined,
      }),
      replace: true,
    });
  };

  // Filter results client-side for diet tags
  const filteredResults = useMemo(() => {
    if (activeFilter === "all") return results;
    return results.filter((item) => {
      if (activeFilter === "jain") {
        return item.name.toLowerCase().includes("jain") || item.description?.toLowerCase().includes("jain");
      }
      if (activeFilter === "bestseller") {
        return item.badges?.some((b) => b.label.toLowerCase().includes("special") || b.label.toLowerCase().includes("bestseller"));
      }
      if (activeFilter === "spicy") {
        return (
          item.name.toLowerCase().includes("spicy") ||
          item.name.toLowerCase().includes("peri") ||
          item.description?.toLowerCase().includes("spicy") ||
          item.description?.toLowerCase().includes("chilli")
        );
      }
      if (activeFilter === "protein") {
        return (
          item.name.toLowerCase().includes("paneer") ||
          item.name.toLowerCase().includes("protein") ||
          item.description?.toLowerCase().includes("protein")
        );
      }
      return true;
    });
  }, [results, activeFilter]);

  const handleAdd = (p: Product) => {
    if (p.customizable) {
      setCustomizingProduct(p);
      return;
    }
    if (!store) return;
    void cartRepository.addItem({
      storeId: store.id,
      productId: p.id,
      name: p.name,
      imageUrl: p.imageUrl,
      fallbackImageUrl: p.fallbackImageUrl,
      veg: p.veg ?? true,
      unitPrice: p.price,
      quantity: 1,
    });
    void HapticService.impact("medium");
    toast.success(`✓ ${p.name} added to cart`);
  };

  return (
    <AppShell title="Search" backTo="/menu" showTabs showTopBar>
      <div className="mx-auto max-w-[720px] pb-32">
        {/* Sticky Search Header & Filter Bar */}
        <form
          onSubmit={handleSubmit}
          className="sticky top-0 z-20 bg-surface/95 px-4 py-3 backdrop-blur-md border-b border-divider shadow-xs"
        >
          {/* Input Box */}
          <label className="flex h-12 items-center gap-2 rounded-2xl border border-divider bg-bg-secondary px-4 focus-within:border-primary focus-within:bg-surface focus-within:ring-2 focus-within:ring-primary/20 transition-all">
            <SearchIcon className="h-5 w-5 text-text-secondary shrink-0" aria-hidden />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search smashed burgers, sides, drinks…"
              aria-label="Search the menu"
              className="flex-1 bg-transparent outline-none type-body-large placeholder:text-text-disabled"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search query"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                  void navigate({
                    to: "/search",
                    search: (prev: SearchParamsSchema) => ({ ...prev, q: undefined }),
                    replace: true,
                  });
                }}
                className="grid h-8 w-8 place-items-center rounded-full text-text-secondary hover:bg-divider cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </label>

          {/* Quick Actions & Category Kind Tabs */}
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => toast("Voice search will be enabled in next release")}
              aria-label="Voice search (coming soon)"
              className="inline-flex items-center gap-1 rounded-xl border border-divider bg-surface px-3 py-1.5 text-xs text-text-secondary hover:text-primary transition-colors cursor-pointer"
            >
              <Mic className="h-3.5 w-3.5" aria-hidden /> Voice
            </button>
            <button
              type="button"
              onClick={() => toast("Barcode scanner will be enabled in next release")}
              aria-label="Scan barcode (coming soon)"
              className="inline-flex items-center gap-1 rounded-xl border border-divider bg-surface px-3 py-1.5 text-xs text-text-secondary hover:text-primary transition-colors cursor-pointer"
            >
              <ScanLine className="h-3.5 w-3.5" aria-hidden /> Scan
            </button>

            <div
              role="tablist"
              aria-label="Filter search by kind"
              className="ml-auto flex gap-1 overflow-x-auto no-scrollbar"
            >
              {(["all", "product", "combo", "category", "offer"] as const).map((k) => {
                const active = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setKind(k);
                      void navigate({
                        to: "/search",
                        search: (prev: SearchParamsSchema) => ({ ...prev, kind: k !== "all" ? k : undefined }),
                        replace: true,
                      });
                    }}
                    className={cn(
                      "whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition-all duration-150 ease-out select-none active:scale-[0.96] cursor-pointer border",
                      active
                        ? "bg-[#0E4825] text-white border-[#0E4825] shadow-xs"
                        : "border-divider bg-surface text-text-secondary hover:text-primary"
                    )}
                  >
                    {k === "all" ? "All" : k.charAt(0).toUpperCase() + k.slice(1) + "s"}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Diet & Specialty Badges Horizontal Scroll */}
          <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
            {DIET_FILTER_TAGS.map((tag) => {
              const active = activeFilter === tag.id;
              const Icon = tag.icon;
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => handleFilterSelect(tag.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all select-none cursor-pointer border",
                    active
                      ? "bg-[#FF6600] text-white border-[#FF6600] shadow-xs"
                      : "bg-surface text-text-secondary border-divider hover:border-primary/40 hover:text-text"
                  )}
                >
                  {Icon && <Icon className="h-3 w-3" />}
                  <span>{tag.label}</span>
                </button>
              );
            })}
          </div>
        </form>

        <div className="px-4 py-4">
          {/* Idle: recents + suggestions + trending */}
          {status === "idle" && (
            <>
              {query.trim().length >= 2 && suggestions.length > 0 && (
                <section className="mb-6" aria-labelledby="sug-heading">
                  <Text id="sug-heading" variant="titleMedium" className="mb-2 font-bold">
                    Suggestions
                  </Text>
                  <ul className="divide-y divide-divider rounded-2xl border border-divider bg-surface overflow-hidden shadow-xs">
                    {suggestions.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => runRecent(s.label)}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg-secondary select-none transition-all duration-150 ease-out active:scale-[0.98] cursor-pointer"
                        >
                          <Tag className="h-4 w-4 text-[#0E4825]" aria-hidden />
                          <span className="type-body-large font-medium">{s.label}</span>
                          <span className="ml-auto text-xs text-text-secondary uppercase font-mono">{s.kind}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {trending.length > 0 && (
                <section className="mb-6" aria-labelledby="trending-heading">
                  <Text
                    id="trending-heading"
                    variant="titleMedium"
                    className="mb-2 inline-flex items-center gap-1.5 font-bold"
                  >
                    <Flame className="h-4 w-4 text-[#FF6600]" aria-hidden /> Trending Searches
                  </Text>
                  <ul className="flex flex-wrap gap-2">
                    {trending.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => runRecent(t.label)}
                          className="inline-flex items-center gap-2 rounded-full border border-divider bg-surface px-3.5 py-2 text-xs font-bold text-text select-none transition-all duration-150 ease-out active:scale-[0.96] hover:border-primary/40 hover:text-primary cursor-pointer shadow-xs"
                        >
                          <Tag className="h-3.5 w-3.5 text-text-secondary" aria-hidden />
                          {t.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {hydrated && recent.length > 0 && (
                <section aria-labelledby="recent-heading">
                  <div className="mb-2 flex items-center justify-between">
                    <Text id="recent-heading" variant="titleMedium" className="font-bold">
                      Recent searches
                    </Text>
                    <button
                      type="button"
                      onClick={clearRecent}
                      className="text-xs font-bold text-[#FF6600] select-none active:opacity-70 transition-opacity cursor-pointer"
                    >
                      Clear all
                    </button>
                  </div>
                  <ul className="flex flex-wrap gap-2">
                    {recent.map((q) => (
                      <li
                        key={q}
                        className="inline-flex items-center gap-1 rounded-full border border-divider bg-surface pl-3 pr-1 select-none transition-all duration-150 ease-out active:scale-[0.96] shadow-xs"
                      >
                        <button
                          type="button"
                          onClick={() => runRecent(q)}
                          className="inline-flex items-center gap-2 py-1.5 text-xs font-bold text-text cursor-pointer"
                        >
                          <Clock className="h-3.5 w-3.5 text-text-secondary" aria-hidden />
                          {q}
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${q}`}
                          onClick={() => removeRecent(q)}
                          className="grid h-6 w-6 place-items-center rounded-full text-text-secondary hover:bg-bg-secondary active:scale-90 transition-transform cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {hydrated && recent.length === 0 && query.trim().length < 2 && (
                <EmptyState
                  title="Search the 100% Pure Veg Menu"
                  description="Find smash burgers, sides, shakes, combos, and specialty items."
                />
              )}
            </>
          )}

          {(status === "loading" || submitting) && <MenuSkeleton rows={4} />}

          {status === "error" && (
            <FailureState title="Search failed" message={error} onRetry={() => handleSubmit()} />
          )}

          {status === "empty" && (
            <EmptyState
              title="No results found"
              description={`We couldn't find anything matching "${query}". Try searching for burger, fries, or shake.`}
              actionLabel="Clear search"
              onAction={() => {
                setQuery("");
                inputRef.current?.focus();
                void navigate({
                  to: "/search",
                  search: (prev: SearchParamsSchema) => ({ ...prev, q: undefined }),
                  replace: true,
                });
              }}
            />
          )}

          {status === "ready" && filteredResults.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Text variant="bodyMedium" tone="secondary" className="font-medium text-xs">
                  {filteredResults.length} result{filteredResults.length === 1 ? "" : "s"} found
                </Text>
                {activeFilter !== "all" && (
                  <span className="text-[11px] font-bold text-[#0E4825] bg-[#0E4825]/10 px-2 py-0.5 rounded-full">
                    Filtered by: {DIET_FILTER_TAGS.find((d) => d.id === activeFilter)?.label}
                  </span>
                )}
              </div>
              {filteredResults.map((p) => (
                <MenuProductCard key={p.id} product={p} onAdd={handleAdd} searchQuery={query} />
              ))}
            </div>
          )}

          {status === "ready" && results.length > 0 && filteredResults.length === 0 && (
            <EmptyState
              title="No matching items for this diet filter"
              description="Try selecting 'All Items' or a different diet filter tag."
              actionLabel="Clear Filter"
              onAction={() => handleFilterSelect("all")}
            />
          )}
        </div>
      </div>

      {/* Customizable Product Modal */}
      {customizingProduct && (
        <ProductCustomizerModal
          product={customizingProduct}
          isOpen={Boolean(customizingProduct)}
          onClose={() => setCustomizingProduct(null)}
        />
      )}

      {/* Floating Mini Cart Bar */}
      <FloatingCartBar />
    </AppShell>
  );
}

export default SearchPage;
