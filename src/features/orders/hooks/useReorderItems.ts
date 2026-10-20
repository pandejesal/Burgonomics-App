import { useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useCartStore } from "@/features/cart/state/cartStore";
import { menuRepository } from "@/features/menu/repositories/MenuRepository";
import { HapticService } from "@/core/services/haptics";
import type { Product } from "@/features/menu/models";
import { validateReorderItems, type ReorderItemRef } from "../utils/reorderValidation";
import type { Order } from "../models";
import type { CartLine } from "@/features/cart/models";

export interface ReorderResult {
  success: boolean;
  addedCount: number;
  outOfStockItems: string[];
}

/** Snapshot items are frozen cart lines — a reorder line is that shape with a fresh id and target store. */
function orderItemToCartLine(item: Order["items"][number], targetStoreId: string): CartLine {
  return {
    ...(item as object),
    id: `line_reorder_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    storeId: targetStoreId,
  } as CartLine;
}

export function useReorderItems() {
  const navigate = useNavigate();
  const addLine = useCartStore((s) => s.addLine);
  const resetCart = useCartStore((s) => s.reset);
  const [isReordering, setIsReordering] = useState(false);
  const [outOfStockModal, setOutOfStockModal] = useState<{
    isOpen: boolean;
    unavailableItems: string[];
    availableLines: CartLine[];
    /** Live catalog the surfaced lines were validated against (for re-adds). */
    catalog: Product[];
  }>({
    isOpen: false,
    unavailableItems: [],
    availableLines: [],
    catalog: [],
  });

  const reorder = useCallback(
    async (order: Order, options?: { clearExistingCart?: boolean }): Promise<ReorderResult> => {
      setIsReordering(true);
      void HapticService.impact("medium");

      try {
        if (!order.items || order.items.length === 0) {
          return { success: false, addedCount: 0, outOfStockItems: [] };
        }

        const targetStoreId = order.store?.id || (order as any).storeId || "store_default";
        const cartState = useCartStore.getState();
        if (
          cartState.lines.length > 0 &&
          cartState.storeId &&
          cartState.storeId !== targetStoreId
        ) {
          // Reset cart to new store so 1-tap reorder can proceed cleanly
          resetCart(targetStoreId);
        } else if (!cartState.storeId) {
          resetCart(targetStoreId);
        }

        if (options?.clearExistingCart) {
          resetCart(targetStoreId);
        }

        // Reorder lines come from a frozen order snapshot: what was in stock
        // at purchase time says nothing about the outlet's 86-board NOW.
        // Availability is therefore confirmed against the store's LIVE catalog
        // before anything lands in the cart — fail-closed, the same contract
        // the menu itself applies. A failed catalog fetch means we cannot
        // verify anything, so nothing is added.
        const catalogRes = await menuRepository.listProducts(targetStoreId, undefined, 1, 1000);
        if (!catalogRes.success) {
          toast.error(
            "Could not verify what is available right now. Please add items from the menu.",
          );
          return { success: false, addedCount: 0, outOfStockItems: [] };
        }
        const liveCatalog = catalogRes.data.items;

        // Pair each snapshot item with the cart line we WOULD add, so the
        // validator (pure, product-id based) stays free of store types.
        const refsWithLines: { ref: ReorderItemRef; line: CartLine }[] = order.items.map(
          (item) => ({
            ref: {
              productId:
                (item as { productId?: string }).productId ??
                (item as Order["items"][number] & { id: string }).id,
              name: item.name,
            },
            line: orderItemToCartLine(item, targetStoreId),
          }),
        );
        const { unavailableItems, reOrderable } = validateReorderItems(
          refsWithLines.map((pair) => pair.ref),
          liveCatalog,
        );
        const availableLines = refsWithLines
          .filter((pair) => reOrderable.includes(pair.ref))
          .map((pair) => pair.line);

        if (unavailableItems.length > 0) {
          setOutOfStockModal({
            isOpen: true,
            unavailableItems,
            availableLines,
            catalog: liveCatalog,
          });
          return {
            success: false,
            addedCount: 0,
            outOfStockItems: unavailableItems,
          };
        }

        addLinesAndPushToCart(useCartStore.getState(), availableLines, liveCatalog);

        void HapticService.notification("success");
        void navigate({ to: "/cart" });

        return {
          success: availableLines.length > 0,
          addedCount: availableLines.length,
          outOfStockItems: [],
        };
      } finally {
        setIsReordering(false);
      }
    },
    [addLine, resetCart, navigate]
  );

  const confirmReorderRemaining = useCallback(() => {
    const { availableLines, catalog } = outOfStockModal;
    const store = useCartStore.getState();
    addLinesAndPushToCart(
      store,
      availableLines,
      // The modal's catalog is seconds old, but the cart may have changed
      // while the dialog was open — revalidation is what keeps stock and
      // pricing claims honest right after the added lines land.
      catalog,
    );
    void HapticService.notification("success");
    void navigate({ to: "/cart" });
  }, [addLine, outOfStockModal, navigate]);

  const dismissOutOfStockModal = useCallback(() => {
    setOutOfStockModal({ isOpen: false, unavailableItems: [], availableLines: [], catalog: [] });
  }, []);

  return {
    reorder,
    isReordering,
    outOfStockModal,
    confirmReorderRemaining,
    dismissOutOfStockModal,
  };
}

function addLinesAndPushToCart(
  store: ReturnType<typeof useCartStore.getState>,
  lines: CartLine[],
  liveCatalog: Product[],
): void {
  for (const line of lines) {
    store.addLine(line);
  }
  // The freshly added lines are snapshot-priced by definition — validate them
  // against the live catalog we JUST verified availability against, so the
  // re-added lock can't defer the price/stock truth the cart would otherwise
  // catch only minutes later.
  const validation = store.revalidateWithProducts(liveCatalog);
  if (validation.messages.length > 0) {
    toast.info(validation.messages.slice(0, 2).join(" "));
  }
}

export default useReorderItems;
