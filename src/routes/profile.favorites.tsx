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
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { HapticService } from "@/core/services/haptics";
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
    await cartRepository.addItem({
      storeId: store.id,
      productId: fav.refId,
      name: fav.name,
      unitPrice: fav.priceLabel ? parseInt(fav.priceLabel.replace(/\D/g, ""), 10) || 199 : 199,
      quantity: 1,
      veg: true,
      imageUrl: fav.imageUrl,
      fallbackImageUrl: fav.fallbackImageUrl,
    });
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
                  "flex-1 rounded-full py-2 text-xs font-bold transition-all cursor-pointer",
                  active
                    ? "bg-[#0E4825] text-white shadow-xs"
                    : "text-text-secondary hover:text-text"
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
              className="flex-1 bg-transparent outline-none text-xs font-medium text-text placeholder:text-text-disabled"
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
                <div className="rounded-2xl border border-divider bg-surface p-3 flex items-center justify-between gap-3 shadow-xs select-none">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      aria-hidden
                      className="grid h-14 w-14 flex-none place-items-center overflow-hidden rounded-xl bg-[#0E4825]/10 text-[#0E4825]"
                    >
                      {fav.imageUrl ? (
                        <SafeImage
                          src={fav.imageUrl}
                          fallbackSrc={fav.fallbackImageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Heart className="h-5 w-5 fill-[#0E4825]/20" aria-hidden />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div
                          className="w-3.5 h-3.5 rounded-[2px] border border-emerald-600 bg-emerald-950/20 flex items-center justify-center shrink-0"
                          aria-label="100% Pure Veg"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                        </div>
                        <h4 className="text-xs sm:text-sm font-bold text-text truncate">
                          {fav.name}
                        </h4>
                      </div>
                      {fav.priceLabel && (
                        <span className="block text-xs font-mono font-bold text-text">
                          {fav.priceLabel}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {fav.kind === "product" && (
                      <button
                        type="button"
                        onClick={() => void handleQuickAdd(fav)}
                        className="px-3.5 py-1.5 min-h-[38px] rounded-xl bg-[#FF6600] text-white text-xs font-bold hover:bg-[#e05a00] active:scale-95 transition-all shadow-xs cursor-pointer flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[2.5px]" />
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
                      className="grid h-10 w-10 min-h-[40px] min-w-[40px] flex-none place-items-center rounded-full text-text-secondary transition-colors hover:bg-red-500/10 hover:text-red-500 cursor-pointer"
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
