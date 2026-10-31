import * as React from "react";
import { useState, useMemo, useEffect, useRef } from "react";
import { X, Plus, Minus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { HapticService } from "@/core/services/haptics";
import { toUserMessage } from "@/core/errors/userMessages";
import { cartRepository } from "@/features/cart/repositories/CartRepository";
import { useCartStore } from "@/features/cart/state/cartStore";
import type { CartModifier } from "@/features/cart/models";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { formatINR } from "@/core/utils/format";
import type { Product, ProductDetails, CustomizationGroup } from "../models";
import { ModifierGroupSelector, type ModifierSelections } from "./ModifierGroupSelector";
import { NutritionAllergenPanel } from "./NutritionAllergenPanel";
import { VegIndicator } from "@/shared/components/common/VegIndicator";
import {
  defaultSelections,
  isOptionSelectable,
  isSelectionValid,
  isValidQuantity,
  sanitizeSelections,
  unitPriceFor,
} from "../utils/customizerSelection";
import { useDialogA11y } from "../utils/dialogA11y";

interface ProductCustomizerModalProps {
  product: ProductDetails | Product;
  /** Outlet whose verified details opened this sheet. */
  storeId?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * ProductCustomizerModal — bottom sheet on mobile (<768px) / centered modal on
 * desktop (>768px).
 *
 * The sheet is a real modal dialog: `role="dialog"` + `aria-modal`, labelled
 * heading, focus entry/trap/restore, Escape to close, and a body scroll lock.
 * Mandatory options default only to choices that can actually be ordered, and
 * the add action never claims success unless the cart repository accepted the
 * line.
 */
export function ProductCustomizerModal({
  product,
  storeId,
  isOpen,
  onClose,
  onSuccess,
}: ProductCustomizerModalProps) {
  const store = useStoreSelection((s) => s.activeStore);
  const cartLines = useCartStore((s) => s.lines);
  const [qty, setQty] = useState(1);
  const [selections, setSelections] = useState<ModifierSelections>({});
  const [busy, setBusy] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const titleId = React.useId();
  const descriptionId = React.useId();

  useDialogA11y({ open: isOpen, onClose, containerRef });

  const groups: CustomizationGroup[] = useMemo(
    () => (product as ProductDetails).customizations || [],
    [product],
  );

  // 86ed products can still be opened from search / deep links — the sheet must
  // refuse to add them, not just the menu row.
  const isOutOfStock = product.inStock === false;

  // Selections are always interpreted through the sanitizer: a stale cart line,
  // a retired option or an 86ed modifier can never become a valid choice.
  const effectiveSelections = useMemo(
    () => sanitizeSelections(groups, selections),
    [groups, selections],
  );

  const existingCustomizedLines = useMemo(() => {
    return cartLines.filter(
      (l) => l.productId === product.id && l.modifiers && l.modifiers.length > 0,
    );
  }, [cartLines, product.id]);

  // Defaults: in-stock only (flagged default first). An all-86ed mandatory
  // group stays unselected so the CTA blocks instead of auto-picking sold out.
  useEffect(() => {
    setSelections(defaultSelections(groups));
    setQty(1);
  }, [product.id, groups]);

  const handleToggleOption = (groupId: string, optionId: string) => {
    const group = groups.find((candidate) => candidate.id === groupId);
    if (!group) return;
    const option = group.options.find((candidate) => candidate.id === optionId);
    if (!isOptionSelectable(option)) return;

    setSelections((previous) => {
      const current = sanitizeSelections(groups, previous);
      if (group.selection === "single") {
        return sanitizeSelections(groups, { ...current, [groupId]: [optionId] });
      }
      const chosen = current[groupId] ?? [];
      const next = chosen.includes(optionId)
        ? chosen.filter((id) => id !== optionId)
        : [...chosen, optionId];
      return sanitizeSelections(groups, { ...current, [groupId]: next });
    });
  };

  // Repeat previous customization, but only for options that still exist and
  // can be ordered today.
  const handleRepeatLastCustomization = () => {
    if (!existingCustomizedLines.length) return;
    const lastLine = existingCustomizedLines[existingCustomizedLines.length - 1];
    if (!lastLine.modifiers) return;

    void HapticService.impact("medium");
    const restored: ModifierSelections = {};
    for (const modifier of lastLine.modifiers) {
      // Legacy "meal_combo" upgrade modifiers no longer map to a group.
      if (modifier.groupId === "meal_combo") continue;
      (restored[modifier.groupId] ??= []).push(modifier.optionId);
    }
    const clean = sanitizeSelections(groups, restored);
    const applied = Object.values(clean).some((ids) => ids.length > 0);
    setSelections(clean);
    if (applied) {
      toast.success("Applied your previous customization!");
    } else {
      toast.error("Those options are no longer available. Please choose again.");
    }
  };

  const unitPrice = useMemo(
    () => unitPriceFor(product.price, groups, effectiveSelections),
    [product.price, groups, effectiveSelections],
  );
  const priceAvailable = unitPrice !== null;
  const totalPrice = (unitPrice ?? 0) * qty;

  const selectionValid = useMemo(
    () => isSelectionValid(groups, effectiveSelections),
    [groups, effectiveSelections],
  );
  const quantityValid = isValidQuantity(qty);
  const canAdd = !isOutOfStock && priceAvailable && selectionValid && quantityValid && !busy;

  const handleAddToCart = async () => {
    if (busy) return;
    if (!store) {
      toast.error("Please select a store first");
      return;
    }

    if (storeId && store.id !== storeId) {
      toast.error("Your outlet changed. Please open this item again.");
      onClose();
      return;
    }

    if (isOutOfStock) {
      toast.error(`${product.name} is out of stock right now.`);
      return;
    }

    if (!quantityValid) {
      toast.error("Choose a valid quantity.");
      return;
    }

    if (!priceAvailable) {
      toast.error("This item's price can't be verified right now.");
      return;
    }

    if (!selectionValid) {
      toast.error("Please select all required options");
      return;
    }

    const modifiersList: CartModifier[] = [];
    for (const group of groups) {
      for (const optionId of effectiveSelections[group.id] ?? []) {
        const option = group.options.find((candidate) => candidate.id === optionId);
        if (!isOptionSelectable(option)) continue;
        modifiersList.push({
          groupId: group.id,
          groupName: group.name,
          optionId: option!.id,
          name: option!.name,
          priceDelta: option!.priceDelta,
        });
      }
    }

    setBusy(true);
    try {
      const result = await cartRepository.addItem({
        storeId: store.id,
        productId: product.id,
        name: product.name,
        unitPrice: unitPrice as number,
        quantity: qty,
        veg: product.veg,
        imageUrl: product.imageUrl,
        fallbackImageUrl: product.fallbackImageUrl,
        modifiers: modifiersList,
      });

      if (!result?.success) {
        // A missing envelope is a failure, not a success: never claim the line
        // was added when the repository did not confirm it.
        toast.error("Couldn't add to cart", {
          description: result ? toUserMessage(result) : "Please try again.",
        });
        return;
      }

      void HapticService.impact("medium");
      toast.success(`Added ${qty}x ${product.name} to cart!`);
      onSuccess?.();
      onClose();
    } catch (error) {
      // A rejected/throwing repository is a controlled failure: no success
      // claim, sheet stays open, busy released below.
      toast.error("Couldn't add to cart", { description: toUserMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  const ctaLabel = isOutOfStock
    ? "Out of Stock"
    : busy
      ? "Adding…"
      : !priceAvailable
        ? "Price unavailable"
        : !selectionValid
          ? "Choose Required Options"
          : "Add to Cart";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="relative w-full max-w-[560px] max-h-[92vh] bg-surface rounded-t-3xl sm:rounded-3xl border border-divider shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 duration-300 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-divider flex items-center justify-between gap-3 bg-surface sticky top-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            {typeof product.veg === "boolean" && (
              <VegIndicator veg={product.veg} className="w-5 h-5 shrink-0" />
            )}
            <div className="min-w-0">
              <h2 id={titleId} className="text-base sm:text-lg font-black text-text truncate">
                Customize {product.name}
              </h2>
              <span className="text-sm text-text-secondary font-mono">
                Base price: {formatINR(product.price)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close customizer"
            className="w-11 h-11 rounded-full bg-bg-secondary hover:bg-divider flex items-center justify-center text-text-secondary hover:text-text transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>

        {/* Scrollable Modifier Content */}
        <div className="p-4 sm:p-6 space-y-6 overflow-y-auto max-h-[calc(92vh-140px)] no-scrollbar">
          {/* Always-present dialog description (visible copy when the product
              has one, otherwise an sr-only instruction). */}
          <p
            id={descriptionId}
            className={cn(
              "text-base text-text-secondary leading-relaxed",
              !product.description && "sr-only",
            )}
          >
            {product.description ?? `Choose options for ${product.name}.`}
          </p>

          {/* Repeat Last Customization Banner (if item already customized in cart) */}
          {existingCustomizedLines.length > 0 && (
            <div className="flex items-center justify-between p-3 rounded-2xl bg-primary/10 border border-primary/30 text-sm">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-primary-text" />
                <span className="font-bold text-primary-text">Already in cart</span>
              </div>
              <button
                type="button"
                onClick={handleRepeatLastCustomization}
                className="min-h-[44px] px-2 font-bold text-accent hover:underline cursor-pointer"
              >
                Repeat Last Customization
              </button>
            </div>
          )}

          {/* Nutritional & Allergen Transparency Box — real product data only */}
          <NutritionAllergenPanel
            veg={product.veg}
            nutrition={(product as ProductDetails).nutrition}
            className="p-3.5 space-y-2"
          />

          {/* Modifier Groups */}
          {groups.map((group) => (
            <ModifierGroupSelector
              key={group.id}
              group={group}
              selectedOptionIds={effectiveSelections[group.id] || []}
              onToggleOption={handleToggleOption}
            />
          ))}
        </div>

        {/* Sticky Bottom Action Bar */}
        <div className="p-4 sm:p-5 border-t border-divider bg-surface/95 backdrop-blur-md flex items-center justify-between gap-3 sticky bottom-0 z-10">
          {/* Quantity Stepper */}
          <div className="flex items-center bg-bg-secondary rounded-xl border border-divider p-1">
            <button
              type="button"
              onClick={() => {
                void HapticService.impact("light");
                setQty((prev) => Math.max(1, prev - 1));
              }}
              disabled={busy || qty <= 1}
              aria-label="Decrease quantity"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-surface disabled:opacity-40 transition-colors cursor-pointer"
            >
              <Minus className="w-4 h-4" aria-hidden />
            </button>
            <span className="w-8 text-center text-sm font-black font-mono">{qty}</span>
            <button
              type="button"
              onClick={() => {
                void HapticService.impact("light");
                setQty((prev) => Math.min(99, prev + 1));
              }}
              disabled={busy || qty >= 99}
              aria-label="Increase quantity"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-surface disabled:opacity-40 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden />
            </button>
          </div>

          {/* Add to Cart CTA — primary action in the brand's green, the accent
              orange is reserved for highlights (offers, repeat, badges). */}
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={!canAdd}
            aria-busy={busy || undefined}
            data-testid="customizer-add-to-cart"
            className={cn(
              "flex-1 min-h-[52px] py-3.5 px-5 rounded-xl font-bold text-base flex items-center justify-between shadow-lg transition-all active:scale-[0.98] cursor-pointer",
              canAdd
                ? "bg-primary text-primary-foreground hover:bg-primary-hover"
                : "bg-divider text-text-secondary cursor-not-allowed",
            )}
          >
            <span>{ctaLabel}</span>
            <span className="font-mono font-black">
              {priceAvailable ? formatINR(totalPrice) : "—"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProductCustomizerModal;
