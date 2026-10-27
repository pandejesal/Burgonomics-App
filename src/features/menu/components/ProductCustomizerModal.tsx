import * as React from "react";
import { useState, useMemo, useEffect } from "react";
import { X, Plus, Minus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { HapticService } from "@/core/services/haptics";
import { cartRepository } from "@/features/cart/repositories/CartRepository";
import { useCartStore } from "@/features/cart/state/cartStore";
import type { CartModifier } from "@/features/cart/models";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { formatINR } from "@/core/utils/format";
import type { Product, ProductDetails, CustomizationGroup } from "../models";
import { ModifierGroupSelector, type ModifierSelections } from "./ModifierGroupSelector";
import { NutritionAllergenPanel } from "./NutritionAllergenPanel";
import { VegIndicator } from "@/shared/components/common/VegIndicator";

interface ProductCustomizerModalProps {
  product: ProductDetails | Product;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * ProductCustomizerModal — Bottom sheet on mobile (<768px) / centered modal on desktop (>768px).
 * Provides mandatory modifier validation, optional multi-select toppings,
 * nutritional transparency, repeat last customization prompt, and real-time dynamic price calculation.
 */
export function ProductCustomizerModal({
  product,
  isOpen,
  onClose,
  onSuccess,
}: ProductCustomizerModalProps) {
  const store = useStoreSelection((s) => s.activeStore);
  const cartLines = useCartStore((s) => s.lines);
  const [qty, setQty] = useState(1);
  const [selections, setSelections] = useState<ModifierSelections>({});

  const groups: CustomizationGroup[] = (product as ProductDetails).customizations || [];
  // 86ed products can still be opened from search / deep links — the sheet must
  // refuse to add them, not just the menu row.
  const isOutOfStock = product.inStock === false;

  // Check if product already exists in cart with previous customizations
  const existingCustomizedLines = useMemo(() => {
    return cartLines.filter(
      (l) => l.productId === product.id && l.modifiers && l.modifiers.length > 0
    );
  }, [cartLines, product.id]);

  // Initialize mandatory single-choice defaults if not set
  useEffect(() => {
    if (!groups.length) return;
    const initial: ModifierSelections = {};
    groups.forEach((g) => {
      if (g.selection === "single" && g.required && g.options.length > 0) {
        // default to first in-stock option
        const firstAvailable = g.options.find((o) => !o.outOfStock) || g.options[0];
        initial[g.id] = [firstAvailable.id];
      }
    });
    setSelections(initial);
  }, [product.id, groups]);

  const handleToggleOption = (groupId: string, optionId: string) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;

    setSelections((prev) => {
      const current = prev[groupId] || [];
      if (group.selection === "single") {
        return { ...prev, [groupId]: [optionId] };
      }

      // Multi-select toggle
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

  // Repeat previous customization if available
  const handleRepeatLastCustomization = () => {
    if (!existingCustomizedLines.length) return;
    const lastLine = existingCustomizedLines[existingCustomizedLines.length - 1];
    if (!lastLine.modifiers) return;

    void HapticService.impact("medium");
    const restored: ModifierSelections = {};

    lastLine.modifiers.forEach((m) => {
      // Legacy "meal_combo" upgrade modifiers no longer map to a group — skip them.
      if (m.groupId === "meal_combo") return;
      if (!restored[m.groupId]) restored[m.groupId] = [];
      restored[m.groupId].push(m.optionId);
    });

    setSelections(restored);
    toast.success("Applied your previous customization!");
  };

  // Calculate dynamic unit price
  const unitPrice = useMemo(() => {
    let price = product.price;

    // Add modifier price deltas
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
  }, [product.price, groups, selections]);

  const totalPrice = unitPrice * qty;

  // Validation: Check all mandatory groups have selection
  const isValidationPassed = useMemo(() => {
    for (const g of groups) {
      if (g.required) {
        const selected = selections[g.id] || [];
        if (selected.length === 0) return false;
      }
    }
    return true;
  }, [groups, selections]);

  const handleAddToCart = async () => {
    if (!store) {
      toast.error("Please select a store first");
      return;
    }

    if (isOutOfStock) {
      toast.error(`${product.name} is out of stock right now.`);
      return;
    }

    if (!isValidationPassed) {
      toast.error("Please select all required options");
      return;
    }

    void HapticService.impact("medium");

    // Flatten selected modifiers for cart line
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

    await cartRepository.addItem({
      storeId: store.id,
      productId: product.id,
      name: product.name,
      unitPrice,
      quantity: qty,
      veg: product.veg,
      imageUrl: product.imageUrl,
      fallbackImageUrl: product.fallbackImageUrl,
      modifiers: modifiersList,
    });

    toast.success(`Added ${qty}x ${product.name} to cart!`);
    onSuccess?.();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[560px] max-h-[92vh] bg-surface rounded-t-3xl sm:rounded-3xl border border-divider shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-divider flex items-center justify-between gap-3 bg-surface sticky top-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            {typeof product.veg === "boolean" && (
              <VegIndicator veg={product.veg} className="w-5 h-5 shrink-0" />
            )}
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black text-text truncate">
                Customize {product.name}
              </h2>
              <span className="text-xs text-text-secondary font-mono">
                Base price: {formatINR(product.price)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close customizer"
            className="w-9 h-9 rounded-full bg-bg-secondary hover:bg-divider flex items-center justify-center text-text-secondary hover:text-text transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Modifier Content */}
        <div className="p-4 sm:p-6 space-y-6 overflow-y-auto max-h-[calc(92vh-140px)] no-scrollbar">
          {/* Repeat Last Customization Banner (if item already customized in cart) */}
          {existingCustomizedLines.length > 0 && (
            <div className="flex items-center justify-between p-3 rounded-2xl bg-[#0E4825]/10 border border-[#0E4825]/30 text-xs">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-[#0E4825]" />
                <span className="font-bold text-[#0E4825]">Already in cart</span>
              </div>
              <button
                type="button"
                onClick={handleRepeatLastCustomization}
                className="font-bold text-accent dark:text-accent-foreground hover:underline cursor-pointer"
              >
                Repeat Last Customization
              </button>
            </div>
          )}

          {/* Product Description */}
          {product.description && (
            <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
              {product.description}
            </p>
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
              selectedOptionIds={selections[group.id] || []}
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
              disabled={qty <= 1}
              aria-label="Decrease quantity"
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface disabled:opacity-40 transition-colors cursor-pointer"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="w-8 text-center text-xs font-black font-mono">
              {qty}
            </span>
            <button
              type="button"
              onClick={() => {
                void HapticService.impact("light");
                setQty((prev) => prev + 1);
              }}
              aria-label="Increase quantity"
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Add to Cart CTA */}
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={isOutOfStock || !isValidationPassed}
            className={cn(
              "flex-1 py-3.5 px-5 rounded-xl text-accent-foreground font-bold text-xs sm:text-sm flex items-center justify-between shadow-lg transition-all active:scale-[0.98] cursor-pointer",
              !isOutOfStock && isValidationPassed
                ? "bg-accent dark:bg-[var(--accent-hover)] hover:bg-[var(--accent-hover)] dark:hover:brightness-110"
                : "bg-zinc-700 opacity-60 cursor-not-allowed"
            )}
          >
            <span>
              {isOutOfStock
                ? "Out of Stock"
                : isValidationPassed
                  ? "Add to Cart"
                  : "Choose Required Options"}
            </span>
            <span className="font-mono font-black">{formatINR(totalPrice)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProductCustomizerModal;
