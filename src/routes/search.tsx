import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { Search as SearchIcon, X, Clock, Tag, Mic, ScanLine, Flame } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/shared/layouts/AppShell";
import { Text } from "@/shared/components/common/Text";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { FailureState } from "@/shared/components/feedback/FailureState";
import { MenuSkeleton } from "@/features/menu/components/MenuSkeleton";
import { MenuProductCard } from "@/features/menu/components/MenuProductCard";

import { useStoreSelection } from "@/features/stores/state/storeStore";
import { useSearchStore } from "@/features/menu/state/searchStore";
import { cartRepository } from "@/features/cart/repositories/CartRepository";
import { useHydrated } from "@/shared/hooks/useHydrated";
import type { Product } from "@/features/menu/models";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "Search — Burgonomics" },
      { name: "description", content: "Search the Burgonomics menu at your selected store." },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const navigate = useNavigate();
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

  useEffect(() => {
    useSearchStore.persist.rehydrate();
    void fetchTrending(store?.id);
  }, [store?.id, fetchTrending]);

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced suggestions.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const t = setTimeout(() => {
      void fetchSuggestions(store?.id);
    }, 200);
    return () => clearTimeout(t);
  }, [query, store?.id, fetchSuggestions]);

  const [submitting, setSubmitting] = useState(false);
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setSubmitting(true);
    await submit(store?.id);
    setSubmitting(false);
  };

  const runRecent = async (q: string) => {
    setQuery(q);
    await submit(store?.id);
  };

  const handleAdd = (p: Product) => {
    if (p.customizable) {
      void navigate({ to: "/menu/product/$productId", params: { productId: p.id } });
      return;
    }
    if (!store) return;
    void cartRepository.addItem({
      storeId: store.id,
      productId: p.id,
      name: p.name,
      imageUrl: p.imageUrl,
      fallbackImageUrl: p.fallbackImageUrl,
      veg: p.veg,
      unitPrice: p.price,
      quantity: 1,
    });
  };

  return (
    <AppShell title="Search" backTo="/menu" showTabs showTopBar>
      <div className="mx-auto max-w-[720px]">
        <form
          onSubmit={handleSubmit}
          className="sticky top-0 z-20 bg-surface/95 px-4 py-3 backdrop-blur border-b border-divider"
        >
          <label className="flex h-12 items-center gap-2 rounded-full border border-divider bg-surface px-4 focus-within:border-primary">
            <SearchIcon className="h-5 w-5 text-text-secondary" aria-hidden />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products, categories…"
              aria-label="Search the menu"
              className="flex-1 bg-transparent outline-none type-body-large placeholder:text-text-disabled"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                className="grid h-8 w-8 place-items-center rounded-full text-text-secondary hover:bg-bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => toast("Voice search is coming soon")}
              aria-label="Voice search (coming soon)"
              className="inline-flex items-center gap-1 rounded-full border border-divider bg-surface px-3 py-1.5 type-caption text-text-secondary hover:text-primary"
            >
              <Mic className="h-3.5 w-3.5" aria-hidden /> Voice
            </button>
            <button
              type="button"
              onClick={() => toast("Barcode scanner is coming soon")}
              aria-label="Scan barcode (coming soon)"
              className="inline-flex items-center gap-1 rounded-full border border-divider bg-surface px-3 py-1.5 type-caption text-text-secondary hover:text-primary"
            >
              <ScanLine className="h-3.5 w-3.5" aria-hidden /> Scan
            </button>
            <div
              role="tablist"
              aria-label="Filter search by kind"
              className="ml-auto flex gap-1 overflow-x-auto"
            >
              {(["all", "product", "combo", "category", "offer"] as const).map((k) => {
                const active = kind === k;
                return (
                  <button
                    key={k}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setKind(k)}
                    className={`whitespace-nowrap rounded-full px-3 py-1.5 type-caption transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "border border-divider bg-surface text-text-secondary hover:text-primary"
                    }`}
                  >
                    {k === "all" ? "All" : k.charAt(0).toUpperCase() + k.slice(1) + "s"}
                  </button>
                );
              })}
            </div>
          </div>
        </form>

        <div className="px-4 py-4">
          {/* Idle: recents + suggestions */}
          {status === "idle" && (
            <>
              {query.trim().length >= 2 && suggestions.length > 0 && (
                <section className="mb-6" aria-labelledby="sug-heading">
                  <Text id="sug-heading" variant="titleMedium" className="mb-2">
                    Suggestions
                  </Text>
                  <ul className="divide-y divide-divider rounded-[var(--radius-medium)] border border-divider bg-surface">
                    {suggestions.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => runRecent(s.label)}
                          className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-bg-secondary"
                        >
                          <Tag className="h-4 w-4 text-text-secondary" aria-hidden />
                          <span className="type-body-large">{s.label}</span>
                          <span className="ml-auto type-caption text-text-secondary">{s.kind}</span>
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
                    className="mb-2 inline-flex items-center gap-1"
                  >
                    <Flame className="h-4 w-4 text-primary" aria-hidden /> Trending
                  </Text>
                  <ul className="flex flex-wrap gap-2">
                    {trending.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => runRecent(t.label)}
                          className="inline-flex items-center gap-2 rounded-full border border-divider bg-surface px-3 py-2 type-label-large hover:border-primary/40"
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
                    <Text id="recent-heading" variant="titleMedium">
                      Recent searches
                    </Text>
                    <button
                      type="button"
                      onClick={clearRecent}
                      className="type-label-large text-primary hover:underline"
                    >
                      Clear all
                    </button>
                  </div>
                  <ul className="flex flex-wrap gap-2">
                    {recent.map((q) => (
                      <li
                        key={q}
                        className="inline-flex items-center gap-1 rounded-full border border-divider bg-surface pl-3 pr-1"
                      >
                        <button
                          type="button"
                          onClick={() => runRecent(q)}
                          className="inline-flex items-center gap-2 py-2 type-label-large"
                        >
                          <Clock className="h-4 w-4 text-text-secondary" aria-hidden />
                          {q}
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${q}`}
                          onClick={() => removeRecent(q)}
                          className="grid h-7 w-7 place-items-center rounded-full text-text-secondary hover:bg-bg-secondary"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {hydrated && recent.length === 0 && query.trim().length < 2 && (
                <EmptyState
                  title="Search the menu"
                  description="Find products by name, description, or category."
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
              title="No results"
              description={`We couldn't find anything for "${query}". Try a different word.`}
            />
          )}

          {status === "ready" && results.length > 0 && (
            <div className="space-y-3">
              <Text variant="bodyMedium" tone="secondary">
                {results.length} result{results.length === 1 ? "" : "s"}
              </Text>
              {results.map((p) => (
                <MenuProductCard key={p.id} product={p} onAdd={handleAdd} searchQuery={query} />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
