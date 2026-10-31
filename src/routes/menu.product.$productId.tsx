import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ShoppingBag, ArrowLeft, Clock, ShieldCheck, Plus, Minus, Check } from "lucide-react";
import { toast } from "sonner";
import { HapticService } from "@/core/services/haptics";
import { toUserMessage } from "@/core/errors/userMessages";

import { AppShell } from "@/shared/layouts/AppShell";
import { SafeImage } from "@/shared/components/common/SafeImage";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { FailureState } from "@/shared/components/feedback/FailureState";
import { Skeleton } from "@/shared/components/feedback/Skeleton";

import { useStoreSelection } from "@/features/stores/state/storeStore";
import { cartRepository } from "@/features/cart/repositories/CartRepository";
import { menuRepository } from "@/features/menu/repositories/MenuRepository";
import { useMenuStore } from "@/features/menu/state/menuStore";
import type { Product, ProductDetails, CustomizationGroup } from "@/features/menu/models";
import type { CartModifier } from "@/features/cart/models";
import { formatINR } from "@/core/utils/format";
import { cn } from "@/lib/utils";
import { ModifierGroupSelector, type ModifierSelections } from "@/features/menu/components/ModifierGroupSelector";
import { NutritionAllergenPanel } from "@/features/menu/components/NutritionAllergenPanel";

export const Route = createFileRoute("/menu/product/$productId")({
  head: () => ({
    meta: [
      { title: "Product Details — Burgonomics (100% Pure Vegetarian)" },
      { name: "description", content: "100% Pure Vegetarian handcrafted smash burger with customizable modifiers." },
    ],
  }),
  component: ProductPage,
});

interface State {
  status: "loading" | "ready" | "error" | "notfound";
  /** The `$productId` this state belongs to — guards against stale render. */
  loadedFor?: string;
  error?: string;
  product?: ProductDetails;
  related: Product[];
}

function ProductPage() {
  const { productId } = Route.useParams();
  const navigate = useNavigate();
  const store = useStoreSelection((s) => s.activeStore);

  const pushRecentlyViewed = useMenuStore((s) => s.pushRecentlyViewed);

  const [state, setState] = useState<State>({
    status: "loading",
    related: [],
  });
  const [qty, setQty] = useState(1);
  const [activeImage, setActiveImage] = useState(0);

  // Customization selections
  const [selections, setSelections] = useState<ModifierSelections>({});

  // Monotonic token so a slow response for a previous `$productId` can never
  // overwrite the current one (that left the page stuck on a skeleton).
  const loadSeq = useRef(0);

  const load = async () => {
    const seq = ++loadSeq.current;
    setState((s) => ({ ...s, status: "loading", error: undefined }));
    const [pr, rr] = await Promise.all([
      menuRepository.getProduct(productId, store?.id),
      menuRepository.listRelatedProducts(productId, store?.id),
    ]);
    if (seq !== loadSeq.current) return;
    if (!pr.success) {
      setState({ status: "error", loadedFor: productId, error: pr.error.message, related: [] });
      return;
    }
    if (!pr.data) {
      setState({ status: "notfound", loadedFor: productId, related: [] });
      return;
    }
    pushRecentlyViewed(pr.data);
    setState({
      status: "ready",
      loadedFor: productId,
      product: pr.data,
      related: rr.success ? rr.data : [],
    });

    // Initialize required single-choice modifier defaults
    const groups: CustomizationGroup[] = pr.data.customizations || [];
    if (groups.length) {
      const initial: ModifierSelections = {};
      groups.forEach((g) => {
        if (g.selection === "single" && g.required && g.options.length > 0) {
          const firstAvailable = g.options.find((o) => !o.outOfStock) || g.options[0];
          initial[g.id] = [firstAvailable.id];
        }
      });
      setSelections(initial);
    }
  };

  useEffect(() => {
    // Same route, new `$productId`: reset per-product UI state so the
    // previous product's quantity, image index and modifier selections never
    // leak into the next one.
    setQty(1);
    setActiveImage(0);
    setSelections({});
    void load();
  }, [productId, store?.id]);

  // Rendering gate: `state` lags the route param by one commit, so without
  // this the previous product paints for a frame (and stayed visible whenever
  // the navigation was animated) — reported as "tap opens the wrong product".
  const status = state.loadedFor === productId ? state.status : "loading";

  const p = state.product;
  const groups: CustomizationGroup[] = p?.customizations || [];

  const handleToggleOption = (groupId: string, optionId: string) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;

    setSelections((prev) => {
      const current = prev[groupId] || [];
      if (group.selection === "single") {
        return { ...prev, [groupId]: [optionId] };
      }

      let next: string[];
      if (current.includes(optionId)) {
        next = current.filter((id) => id !== optionId);
      } else {
        next = [...current, optionId];
        if (group.maxSelect && next.length > group.maxSelect) {
          next = next.slice(-group.maxSelect);
        }
      }
      return { ...prev, [groupId]: next };
    });
  };

  // Dynamic unit price calculation
  const unitPrice = useMemo(() => {
    if (!p) return 0;
    let price = p.price;

    groups.forEach((g) => {
      const selected = selections[g.id] || [];
      selected.forEach((optId) => {
        const opt = g.options.find((o) => o.id === optId);
        if (opt) {
          price += opt.priceDelta || 0;
        }
      });
    });

    return Math.max(0, price);
  }, [p, groups, selections]);

  const totalPrice = unitPrice * qty;

  // Validation passed check
  const isValidationPassed = useMemo(() => {
    if (!groups.length) return true;
    for (const g of groups) {
      if (g.required) {
        const selected = selections[g.id] || [];
        if (selected.length === 0) return false;
      }
    }
    return true;
  }, [groups, selections]);

  if (status === "loading") {
    return (
      <AppShell title="Product" backTo="/menu" showTabs={false} showTopBar={false}>
        <div className="p-4 space-y-4 max-w-[560px] mx-auto">
          <Skeleton className="aspect-video w-full rounded-3xl" />
          <Skeleton className="h-8 w-3/4 rounded-xl" />
          <Skeleton className="h-4 w-1/2 rounded-lg" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  if (status === "error") {
    return (
      <AppShell title="Product" backTo="/menu" showTabs={false}>
        <FailureState title="We couldn't load this product" message={state.error} onRetry={load} />
      </AppShell>
    );
  }

  if (status === "notfound" || !p) {
    return (
      <AppShell title="Product" backTo="/menu" showTabs={false}>
        <EmptyState
          title="Product not available"
          description="This product is not currently available at your selected store."
          actionLabel="Back to menu"
          onAction={() => navigate({ to: "/menu" })}
        />
      </AppShell>
    );
  }

  const images = p.imageUrls && p.imageUrls.length ? p.imageUrls : p.imageUrl ? [p.imageUrl] : [];
  const disabled = p.inStock === false;

  const handleAddToCart = async () => {
    if (!store) {
      toast.error("Please select a store first");
      return;
    }

    // Belt-and-braces behind the disabled CTA: an 86ed product must never
    // reach the cart, even if the button state raced a menu refresh.
    if (p.inStock === false) {
      toast.error(`${p.name} is out of stock right now.`);
      return;
    }

    if (!isValidationPassed) {
      toast.error("Please select all required options");
      return;
    }

    void HapticService.impact("medium");

    const modifiersList: CartModifier[] = [];
    groups.forEach((g) => {
      const selected = selections[g.id] || [];
      selected.forEach((optId) => {
        const opt = g.options.find((o) => o.id === optId);
        if (opt) {
          modifiersList.push({
            groupId: g.id,
            groupName: g.name,
            optionId: opt.id,
            name: opt.name,
            priceDelta: opt.priceDelta || 0,
          });
        }
      });
    });

    const res = await cartRepository.addItem({
      storeId: store.id,
      productId: p.id,
      name: p.name,
      unitPrice,
      quantity: qty,
      veg: p.veg ?? true,
      imageUrl: p.imageUrl ?? (p.imageUrls && p.imageUrls[0]),
      fallbackImageUrl: p.fallbackImageUrl,
      modifiers: modifiersList.length ? modifiersList : undefined,
    });
    if (!res.success) {
      toast.error("Couldn't add to cart", {
        description: toUserMessage(res),
      });
      return;
    }

    toast.success(`Added ${qty}x ${p.name} to cart!`, {
      action: {
        label: "View Cart",
        onClick: () => void navigate({ to: "/cart" }),
      },
    });
    void navigate({ to: "/menu" });
  };

  return (
    <AppShell
      title={p.name}
      backTo="/menu"
      showTabs={false}
      showTopBar={false}
      bottomSlot={
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-divider bg-surface/95 backdrop-blur-md p-4 shadow-2xl">
          <div className="mx-auto flex max-w-[560px] items-center justify-between gap-3">
            {/* Quantity Stepper (mirrors QuantityStepper: grouped, live, 44px) */}
            <div role="group" aria-label={`Quantity for ${p.name}`} className="flex h-11 shrink-0 items-center rounded-xl bg-bg-secondary border border-divider p-1">
              <button
                type="button"
                onClick={() => {
                  void HapticService.impact("light");
                  setQty((q) => Math.max(1, q - 1));
                }}
                disabled={qty <= 1}
                aria-label="Decrease quantity"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-text hover:bg-surface active:scale-90 transition disabled:opacity-30 cursor-pointer"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span aria-live="polite" className="w-8 min-w-8 shrink-0 text-center text-xs font-black font-mono tabular-nums text-text">{qty}</span>
              <button
                type="button"
                onClick={() => {
                  void HapticService.impact("light");
                  setQty((q) => Math.min(99, q + 1));
                }}
                disabled={qty >= 99}
                aria-label="Increase quantity"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-text hover:bg-surface active:scale-90 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {/* Add to Cart CTA */}
            <button
              type="button"
              disabled={disabled || !isValidationPassed}
              onClick={handleAddToCart}
              className={cn(
                "flex flex-1 items-center justify-between rounded-xl px-5 py-3.5 text-white shadow-lg transition-all active:scale-[0.98] cursor-pointer",
                disabled || !isValidationPassed
                  ? "bg-zinc-700 opacity-60 cursor-not-allowed"
                  : "bg-[#FF6600] hover:bg-[#e05a00]"
              )}
            >
              <span className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide">
                <ShoppingBag className="h-4 w-4" />
                <span>{disabled ? "Sold Out" : isValidationPassed ? "Add To Cart" : "Choose Required Options"}</span>
              </span>
              <span className="font-mono text-sm font-black">{formatINR(totalPrice)}</span>
            </button>
          </div>
        </div>
      }
    >
      <div className="mx-auto max-w-[560px] pb-32">
        {/* Top Floating Nav Bar */}
        <div className="sticky top-0 z-30 flex items-center justify-between p-4 bg-gradient-to-b from-black/40 to-transparent pointer-events-none">
          <button
            type="button"
            onClick={() => void navigate({ to: "/menu" })}
            aria-label="Back to menu"
            className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-surface/90 text-text shadow-md backdrop-blur-sm active:scale-95 transition cursor-pointer border border-divider"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        </div>

        {/* Hero Photo */}
        <div className="-mt-16 relative aspect-[4/3] w-full overflow-hidden bg-bg-secondary rounded-b-3xl">
          {images.length ? (
            <SafeImage
              src={images[activeImage]}
              fallbackSrc={p.fallbackImageUrl}
              alt={p.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="skeleton h-full w-full" />
          )}

          {/* 100% Pure Veg badge */}
          <div className="absolute bottom-4 left-4 z-10 flex items-center gap-1.5 rounded-full bg-surface/95 px-3 py-1 shadow-md backdrop-blur-sm border border-divider">
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border border-emerald-600 p-[1.5px]">
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
            </span>
            <span className="text-xs font-bold text-emerald-800 dark:text-emerald-400 tracking-wider">100% PURE VEG</span>
          </div>

          {disabled && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center">
              <span className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm font-black uppercase tracking-wider shadow-lg">
                Sold Out
              </span>
            </div>
          )}
        </div>

        {/* Product Details & Modifiers */}
        <div className="p-4 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black text-text leading-tight">
                {p.name}
              </h1>
              <p className="mt-1 text-xs text-text-secondary leading-relaxed">
                {p.description || "Freshly grilled smash patty layered with crisp greens and gourmet house sauce."}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <span className="font-mono text-xl font-black text-[#0E4825] dark:text-[#4ADE80]">
                {formatINR(p.price)}
              </span>
              <p className="text-[10px] text-text-secondary">Base price</p>
            </div>
          </div>

          {/* Key Attributes Pills — only claims backed by the product doc */}
          <div className="flex flex-wrap gap-2">
            {typeof p.prepTimeMinutes === "number" && p.prepTimeMinutes > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-bg-secondary border border-divider px-3 py-1 text-xs font-medium text-text">
                <Clock className="h-3.5 w-3.5 text-[#0E4825]" />
                <span>Prep: {p.prepTimeMinutes} mins</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full bg-bg-secondary border border-divider px-3 py-1 text-xs font-medium text-text">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span>100% Vegetarian Kitchen</span>
            </span>
          </div>

          {/* Nutrition & Allergen Transparency — real product data only */}
          <NutritionAllergenPanel veg={p.veg} nutrition={p.nutrition} />

          {/* Interactive Modifier Groups */}
          {groups.map((group) => (
            <ModifierGroupSelector
              key={group.id}
              group={group}
              selectedOptionIds={selections[group.id] || []}
              onToggleOption={handleToggleOption}
            />
          ))}
        </div>
      </div>
    </AppShell>
  );
}

export default ProductPage;
