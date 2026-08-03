import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Clock, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { HapticService } from "@/core/services/haptics";

import { AppShell } from "@/shared/layouts/AppShell";
import { Text } from "@/shared/components/common/Text";
import { AppButton } from "@/shared/components/common/AppButton";
import { AppBadge } from "@/shared/components/common/AppBadge";
import { VegIndicator } from "@/shared/components/common/VegIndicator";
import { SafeImage } from "@/shared/components/common/SafeImage";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { FailureState } from "@/shared/components/feedback/FailureState";
import { Skeleton } from "@/shared/components/feedback/Skeleton";

import { useStoreSelection } from "@/features/stores/state/storeStore";
import { cartRepository } from "@/features/cart/repositories/CartRepository";
import { menuRepository } from "@/features/menu/repositories/MenuRepository";
import { useMenuStore } from "@/features/menu/state/menuStore";
import { MenuProductCard } from "@/features/menu/components/MenuProductCard";
import {
  CustomizationPicker,
  type Selections,
} from "@/features/menu/components/CustomizationPicker";
import { QuantityStepper } from "@/features/menu/components/QuantityStepper";
import type { CustomizationGroup, Product, ProductDetails } from "@/features/menu/models";
import { formatINR } from "@/core/utils/format";
import { isNative } from "@/shared/platform/platform";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/menu/product/$productId")({
  head: () => ({
    meta: [
      { title: "Product — Burgonomics" },
      { name: "description", content: "Customize modifiers, sizes, and add-ons." },
    ],
  }),
  component: ProductPage,
});

interface State {
  status: "loading" | "ready" | "error" | "notfound";
  error?: string;
  product?: ProductDetails;
  customizations: CustomizationGroup[];
  related: Product[];
}

function ProductPage() {
  const { productId } = Route.useParams();
  const navigate = useNavigate();
  const store = useStoreSelection((s) => s.activeStore);

  const pushRecentlyViewed = useMenuStore((s) => s.pushRecentlyViewed);

  const [state, setState] = useState<State>({
    status: "loading",
    customizations: [],
    related: [],
  });
  const [qty, setQty] = useState(1);
  const [selections, setSelections] = useState<Selections>({});
  const [notes, setNotes] = useState("");
  const [activeImage, setActiveImage] = useState(0);

  const load = async () => {
    setState((s) => ({ ...s, status: "loading", error: undefined }));
    const [pr, cr, rr] = await Promise.all([
      menuRepository.getProduct(productId, store?.id),
      menuRepository.listCustomizations(productId),
      menuRepository.listRelatedProducts(productId, store?.id),
    ]);
    if (!pr.success) {
      setState({ status: "error", error: pr.error.message, customizations: [], related: [] });
      return;
    }
    if (!pr.data) {
      setState({ status: "notfound", customizations: [], related: [] });
      return;
    }
    const customizations = cr.success ? cr.data : (pr.data.customizations ?? []);
    // Seed default selections.
    const initial: Selections = {};
    for (const g of customizations) {
      const defaults = g.options.filter((o) => o.isDefault).map((o) => o.id);
      if (defaults.length)
        initial[g.id] = g.selection === "single" ? defaults.slice(0, 1) : defaults;
    }
    setSelections(initial);
    pushRecentlyViewed(pr.data);
    setState({
      status: "ready",
      product: pr.data,
      customizations,
      related: rr.success ? rr.data : [],
    });
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, store?.id]);

  const priceTotal = useMemo(() => {
    if (!state.product) return 0;
    const modifiersTotal = state.customizations.reduce((sum, g) => {
      const chosen = selections[g.id] ?? [];
      return (
        sum +
        chosen.reduce((s2, oid) => {
          const opt = g.options.find((o) => o.id === oid);
          return s2 + (opt?.priceDelta ?? 0);
        }, 0)
      );
    }, 0);
    return (state.product.price + modifiersTotal) * qty;
  }, [state, selections, qty]);

  const requiredMissing = state.customizations.some(
    (g) => g.required && (selections[g.id]?.length ?? 0) === 0,
  );

  if (state.status === "loading") return <ProductSkeleton />;
  if (state.status === "error") {
    return (
      <AppShell title="Product" backTo="/menu" showTabs>
        <FailureState title="We couldn't load this product" message={state.error} onRetry={load} />
      </AppShell>
    );
  }
  if (state.status === "notfound" || !state.product) {
    return (
      <AppShell title="Product" backTo="/menu" showTabs>
        <EmptyState
          title="Product not available"
          description="This product is not currently available at your selected store."
          actionLabel="Back to menu"
          onAction={() => navigate({ to: "/menu" })}
        />
      </AppShell>
    );
  }

  const p = state.product;
  const images = p.imageUrls && p.imageUrls.length ? p.imageUrls : p.imageUrl ? [p.imageUrl] : [];
  const disabled = !p.inStock || requiredMissing;

  const handleAdd = async () => {
    if (!store) return;
    const modifiers = state.customizations.flatMap((g) =>
      (selections[g.id] ?? []).map((oid) => {
        const opt = g.options.find((o) => o.id === oid)!;
        return {
          groupId: g.id,
          groupName: g.name,
          optionId: opt.id,
          name: opt.name,
          priceDelta: opt.priceDelta,
        };
      }),
    );
    const res = await cartRepository.addItem({
      storeId: store.id,
      productId: p.id,
      name: p.name,
      imageUrl: p.imageUrl ?? (p.imageUrls && p.imageUrls[0]),
      fallbackImageUrl: p.fallbackImageUrl,
      veg: p.veg,
      unitPrice: p.price,
      quantity: qty,
      modifiers,
      notes: notes.trim() || undefined,
    });
    if (!res.success) return;

    void HapticService.impact("medium");

    toast(`✓ ${p.name} added`, {
      action: {
        label: "View Cart",
        onClick: () => {
          void navigate({ to: "/cart" });
        },
      },
      duration: 3500,
    });

    void navigate({ to: "/menu" });
  };

  return (
    <AppShell
      title={p.name}
      backTo="/menu"
      showTabs
      showTopBar
      contentClassName="pb-[calc(180px+env(safe-area-inset-bottom,0px))]"
      bottomSlot={
        <div className="fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom,0px))] z-30 border-t border-divider bg-surface backdrop-blur shadow-md">
          <div className="mx-auto flex max-w-[480px] md:max-w-[480px] max-md:max-w-full items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="type-caption text-text-secondary">Total</p>
              <p className="type-title-large">{formatINR(priceTotal)}</p>
            </div>
            <AppButton
              variant="primary"
              size="md"
              disabled={disabled}
              onClick={() => void handleAdd()}
              iconLeft={<ShoppingCart className="h-5 w-5" />}
            >
              {p.inStock
                ? requiredMissing
                  ? "Select required options"
                  : "Add to cart"
                : "Unavailable"}
            </AppButton>
          </div>
        </div>
      }
    >
      <div className="mx-auto max-w-[720px]">
        {/* Gallery */}
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-bg-secondary">
          {images.length ? (
            <SafeImage
              src={images[activeImage]}
              fallbackSrc={p.fallbackImageUrl}
              alt={p.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="skeleton h-full w-full" aria-hidden />
          )}
          {!p.inStock && (
            <div className="absolute inset-0 grid place-items-center bg-black/55">
              <AppBadge tone="neutral">{p.unavailableReason ?? "Unavailable"}</AppBadge>
            </div>
          )}
        </div>
        {images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-4 py-3">
            {images.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => setActiveImage(i)}
                aria-label={`View image ${i + 1}`}
                className={cn(
                  "h-16 w-16 flex-none overflow-hidden rounded-[var(--radius-medium)] border",
                  i === activeImage ? "border-primary" : "border-divider",
                )}
              >
                <SafeImage
                  src={src}
                  fallbackSrc={i === 0 ? p.fallbackImageUrl : undefined}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}

        <div className="space-y-6 px-4 py-4">
          {/* Header */}
          <div>
            <div className="flex items-center gap-2">
              <VegIndicator veg={p.veg} />
              <Text variant="headlineMedium">{p.name}</Text>
            </div>
            {p.description && (
              <Text variant="bodyMedium" tone="secondary" className="mt-1">
                {p.description}
              </Text>
            )}
            <div className="mt-3 flex flex-wrap items-baseline gap-3">
              <Text variant="headlineMedium">{formatINR(p.price)}</Text>
              {p.compareAtPrice && p.compareAtPrice > p.price && (
                <span className="type-body-medium text-text-secondary line-through">
                  {formatINR(p.compareAtPrice)}
                </span>
              )}
              {typeof p.prepTimeMinutes === "number" && (
                <span className="inline-flex items-center gap-1 type-caption text-text-secondary">
                  <Clock className="h-3.5 w-3.5" aria-hidden /> {p.prepTimeMinutes} min
                </span>
              )}
            </div>
            {p.badges && p.badges.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {p.badges.map((b) => (
                  <AppBadge key={b.id} tone={b.tone ?? "neutral"}>
                    {b.label}
                  </AppBadge>
                ))}
              </div>
            )}
          </div>

          {/* Customizations */}
          {state.customizations.length > 0 && (
            <section aria-labelledby="cust-heading">
              <Text id="cust-heading" variant="titleLarge" className="mb-3">
                Customize
              </Text>
              <CustomizationPicker
                groups={state.customizations}
                value={selections}
                onChange={setSelections}
              />
            </section>
          )}

          {/* Ingredients */}
          {p.ingredients && p.ingredients.length > 0 && (
            <section>
              <Text variant="titleLarge" className="mb-2">
                Ingredients
              </Text>
              <Text variant="bodyMedium" tone="secondary">
                {p.ingredients.join(", ")}
              </Text>
            </section>
          )}

          {/* Nutrition */}
          {p.nutrition && p.nutrition.length > 0 && (
            <section>
              <Text variant="titleLarge" className="mb-2">
                Nutritional information
              </Text>
              <dl className="grid grid-cols-2 gap-2">
                {p.nutrition.map((n) => (
                  <div
                    key={n.key}
                    className="rounded-[var(--radius-medium)] border border-divider bg-surface p-3"
                  >
                    <dt className="type-caption text-text-secondary">{n.label}</dt>
                    <dd className="type-title-medium">{n.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {/* Special instructions */}
          {p.allowSpecialInstructions !== false && (
            <section>
              <Text variant="titleLarge" className="mb-2">
                Special instructions
              </Text>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 200))}
                placeholder="Any cooking notes for the kitchen?"
                aria-label="Special instructions for the kitchen"
                className="w-full rounded-[var(--radius-medium)] border border-divider bg-surface p-3 type-body-large focus:border-primary outline-none"
                rows={3}
              />
              <p className="mt-1 text-right type-caption text-text-secondary">{notes.length}/200</p>
            </section>
          )}

          {/* Quantity */}
          <section className="flex items-center justify-between">
            <Text variant="titleLarge">Quantity</Text>
            <QuantityStepper value={qty} onChange={setQty} />
          </section>

          {/* Related */}
          {state.related.length > 0 && (
            <section aria-labelledby="related-heading">
              <Text id="related-heading" variant="titleLarge" className="mb-3">
                You may also like
              </Text>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {state.related.map((r) => (
                  <MenuProductCard
                    key={r.id}
                    product={r}
                    layout="grid"
                    className="w-[200px] flex-none"
                  />
                ))}
              </div>
            </section>
          )}
        </div>
        <div className="h-24" aria-hidden="true" />
      </div>
    </AppShell>
  );
}

function ProductSkeleton() {
  return (
    <AppShell title="Product" backTo="/menu" showTabs>
      <div className="mx-auto max-w-[720px]">
        <Skeleton className="aspect-[4/3] w-full" />
        <div className="space-y-3 p-4">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-8 w-32" />
        </div>
      </div>
    </AppShell>
  );
}
