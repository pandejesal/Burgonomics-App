import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Heart, Trash2 } from "lucide-react";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { AppShell } from "@/shared/layouts/AppShell";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { AppCard } from "@/shared/components/common/AppCard";
import { Text } from "@/shared/components/common/Text";
import { SafeImage } from "@/shared/components/common/SafeImage";
import { cn } from "@/lib/utils";
import { useFavoritesStore } from "@/features/favorites/state/favoritesStore";
import { favoritesRepository } from "@/features/favorites/repositories/FavoritesRepository";
import type { FavoriteKind } from "@/features/favorites/models";
import { toast } from "sonner";

export const Route = createFileRoute("/profile/favorites")({
  head: () => ({
    meta: [
      { title: "Your favourites — Burgonomics" },
      { name: "description", content: "Your saved products, combos and categories." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <ProtectedRoute>
      <Body />
    </ProtectedRoute>
  );
}

const TABS: Array<{ id: FavoriteKind; label: string }> = [
  { id: "product", label: "Products" },
  { id: "combo", label: "Combos" },
  { id: "category", label: "Categories" },
];

function Body() {
  const navigate = useNavigate();
  const [tab, setTab] = React.useState<FavoriteKind>("product");
  const [query, setQuery] = React.useState("");
  const all = useFavoritesStore((s) => s.items).filter((f) => f.kind === tab);
  const items = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((f) => f.name.toLowerCase().includes(q));
  }, [all, query]);

  return (
    <AppShell title="Favourites" backTo="/profile" showTabs showTopBar>
      <div className="mx-auto max-w-[520px] space-y-4 px-4 py-4">
        <div
          role="tablist"
          aria-label="Favourite categories"
          className="flex gap-2 rounded-full border border-divider bg-surface p-1"
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex-1 rounded-full py-2 type-label-large transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-text-secondary hover:text-primary",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {all.length > 0 && (
          <label className="flex h-11 items-center gap-2 rounded-full border border-divider bg-surface px-4 focus-within:border-primary">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search favourite ${TABS.find((t) => t.id === tab)?.label.toLowerCase()}`}
              aria-label="Search favourites"
              className="flex-1 bg-transparent outline-none type-body-large placeholder:text-text-disabled"
            />
          </label>
        )}

        {items.length === 0 ? (
          <EmptyState
            title={`No favourite ${TABS.find((t) => t.id === tab)?.label.toLowerCase()} yet`}
            description="Tap the heart on any item to save it here for quick access."
            actionLabel="Browse menu"
            onAction={() => navigate({ to: "/menu" })}
          />
        ) : (
          <ul className="space-y-2">
            {items.map((fav) => (
              <li key={fav.id}>
                <AppCard elevation="low" padded={false}>
                  <div className="flex items-center gap-3 p-3">
                    <div
                      aria-hidden
                      className="grid h-14 w-14 flex-none place-items-center overflow-hidden rounded-[var(--radius-medium)] bg-primary/10 text-primary"
                    >
                      {fav.imageUrl ? (
                        <SafeImage
                          src={fav.imageUrl}
                          fallbackSrc={fav.fallbackImageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Heart className="h-5 w-5" aria-hidden />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Text variant="titleMedium" className="truncate">
                        {fav.name}
                      </Text>
                      {fav.priceLabel && (
                        <Text variant="caption" tone="secondary">
                          {fav.priceLabel}
                        </Text>
                      )}
                    </div>
                    {fav.kind === "product" ? (
                      <Link
                        to="/menu/product/$productId"
                        params={{ productId: fav.refId }}
                        className="type-label-large text-primary hover:underline"
                      >
                        View
                      </Link>
                    ) : (
                      <Link to="/menu" className="type-label-large text-primary hover:underline">
                        Open
                      </Link>
                    )}
                    <button
                      type="button"
                      aria-label={`Remove ${fav.name} from favourites`}
                      onClick={async () => {
                        const res = await favoritesRepository.remove(fav.id);
                        if (res.success) toast.success("Removed from favourites");
                      }}
                      className="grid h-9 w-9 flex-none place-items-center rounded-full text-text-secondary transition-colors hover:bg-error/10 hover:text-error"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </AppCard>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
