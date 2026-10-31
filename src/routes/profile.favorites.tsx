import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Heart, Trash2, Plus, ShoppingBag } from "lucide-react";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { AppShell } from "@/shared/layouts/AppShell";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { AppCard } from "@/shared/components/common/AppCard";
import { Text } from "@/shared/components/common/Text";
import { SafeImage } from "@/shared/components/common/SafeImage";
import { cn } from "@/lib/utils";
import { useFavoritesStore } from "@/features/favorites/state/favoritesStore";
import { favoritesRepository } from "@/features/favorites/repositories/FavoritesRepository";
import { cartRepository } from "@/features/cart/repositories/CartRepository";
import { menuRepository } from "@/features/menu/repositories/MenuRepository";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { HapticService } from "@/core/services/haptics";
import { toUserMessage } from "@/core/errors/userMessages";
import type { FavoriteKind, Favorite } from "@/features/favorites/models";
import { toast } from "sonner";

export const Route = createFileRoute("/profile/favorites")({
  head: () => ({
    meta: [
      { title: "Your Favourites — Burgonomics" },
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
  const store = useStoreSelection((s) => s.activeStore);
  const [tab, setTab] = React.useState<FavoriteKind>("product");
  const [query, setQuery] = React.useState("");
  const all = useFavoritesStore((s) => s.items).filter((f) => f.kind === tab);
  const items = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((f) => f.name.toLowerCase().includes(q));
  }, [all, query]);

  const handleQuickAdd = async (fav: Favorite) => {
    if (!store) {
      toast.error("Please select a store first");
      return;
    }
    void HapticService.impact("light");

    // Purchasing eligibility and price truth come ONLY from the store-scoped
    // live catalog (the products list is restId-filtered to this store). The
    // stored `priceLabel` is display metadata from the day the favourite was
    // saved — it never decides eligibility or the charged price, and no
    // single-product lookup is used here because that getter is not
    // store-scoped (a cross-outlet favourite would otherwise resolve another
    // branch's document and read as "verified").
    const catalogRes = await menuRepository.listProducts(store.id, undefined, 1, 1000);
    const product = catalogRes.success
      ? catalogRes.data.items.find((p) => p.id === fav.refId)
      : null;
    if (!product || product.inStock !== true || !(product.price > 0)) {
      toast.error(`${fav.name} is not available right now — please add it from the menu.`);
      return;
    }

    const veg = product.veg ?? fav.kind === "product";
    const imageUrl = product.imageUrl ?? fav.imageUrl;
    const fallbackImageUrl = product.fallbackImageUrl ?? fav.fallbackImageUrl;

    const res = await cartRepository.addItem({
      storeId: store.id,
      productId: fav.refId,
      name: fav.name,
      unitPrice: product.price,
      quantity: 1,
      veg,
      imageUrl,
      fallbackImageUrl,
    });
    if (!res.success) {
      toast.error("Couldn't add to cart", {
        description: toUserMessage(res),
      });
      return;
    }
    toast.success(`Added ${fav.name} to basket`);
  };

  return (
    <AppShell title="Favourites" backTo="/profile" showTabs showTopBar>
      <div className="mx-auto max-w-[520px] space-y-4 px-4 py-4">
        {/* Category Filter Tabs */}
        <div
          role="tablist"
          aria-label="Favourite categories"
          className="flex gap-2 rounded-full border border-divider bg-surface p-1 shadow-xs"
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => {
                  void HapticService.selection();
                  setTab(t.id);
                }}
                className={cn(
                  "min-h-11 flex-1 rounded-full py-2 text-sm font-semibold transition-colors cursor-pointer",
                  active
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-text-secondary hover:text-text",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {all.length > 0 && (
          <label className="flex h-11 items-center gap-2 rounded-full border border-divider bg-surface px-4 focus-within:border-primary shadow-xs">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search favourite ${TABS.find((t) => t.id === tab)?.label.toLowerCase()}…`}
              aria-label="Search favourites"
              className="flex-1 bg-transparent text-base font-medium text-text outline-none placeholder:text-text-disabled"
            />
          </label>
        )}

        {items.length === 0 ? (
          <EmptyState
            title={`No favourite ${TABS.find((t) => t.id === tab)?.label.toLowerCase()} yet`}
            description="Tap the heart on any burger or combo to save it here for instant 1-tap reordering."
            actionLabel="Browse menu"
            onAction={() => navigate({ to: "/menu" })}
          />
        ) : (
          <ul className="space-y-2.5">
            {items.map((fav) => (
              <li key={fav.id}>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-divider bg-surface p-4 shadow-xs select-none">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div
                      aria-hidden
                      className="grid h-14 w-14 flex-none place-items-center overflow-hidden rounded-xl bg-primary/10 text-primary-text"
                    >
                      {fav.imageUrl ? (
                        <SafeImage
                          src={fav.imageUrl}
                          fallbackSrc={fav.fallbackImageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Heart className="h-5 w-5 fill-primary/20" aria-hidden />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <div
                          className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[2px] border border-veg bg-veg/10"
                          aria-label="100% Pure Veg"
                        >
                          <div className="h-1.5 w-1.5 rounded-full bg-veg" />
                        </div>
                        <h4 className="text-base font-semibold leading-snug text-text">
                          {fav.name}
                        </h4>
                      </div>
                      {fav.priceLabel && (
                        <span className="block text-sm font-semibold tabular-nums text-text">
                          {fav.priceLabel}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {fav.kind === "product" && (
                      <button
                        type="button"
                        data-testid={`quick-add-${fav.id}`}
                        onClick={() => void handleQuickAdd(fav)}
                        className="flex min-h-11 items-center gap-1 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary-hover active:scale-95 cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5 stroke-[2.5px]" aria-hidden />
                        <span>Add</span>
                      </button>
                    )}

                    <button
                      type="button"
                      aria-label={`Remove ${fav.name} from favourites`}
                      onClick={async () => {
                        const res = await favoritesRepository.remove(fav.id);
                        if (res.success) toast.success("Removed from favourites");
                      }}
                      className="grid h-11 w-11 min-h-11 min-w-11 flex-none place-items-center rounded-full text-text-secondary transition-colors hover:bg-error/10 hover:text-error cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

export default Page;
