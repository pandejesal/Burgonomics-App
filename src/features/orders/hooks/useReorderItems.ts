import { useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useCartStore } from "@/features/cart/state/cartStore";
import { HapticService } from "@/core/services/haptics";
import type { Order } from "../models";
import type { CartLine } from "@/features/cart/models";

export interface ReorderResult {
  success: boolean;
  addedCount: number;
  outOfStockItems: string[];
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
  }>({
    isOpen: false,
    unavailableItems: [],
    availableLines: [],
  });

  const reorder = useCallback(
    async (order: Order, options?: { clearExistingCart?: boolean }): Promise<ReorderResult> => {
      setIsReordering(true);
      void HapticService.impact("medium");

      try {
        if (!order.items || order.items.length === 0) {
          return { success: false, addedCount: 0, outOfStockItems: [] };
        }

        // Loop: addLine rejects cross-store lines one by one while the old
        // code still counted them as added and navigated to /cart (fake
        // success, wrong cart). Fail loud before touching anything.
        const cartState = useCartStore.getState();
        if (
          cartState.lines.length > 0 &&
          cartState.storeId &&
          cartState.storeId !== order.store.id
        ) {
          toast.error("Your cart has items from another store — clear it or check out first, then reorder.");
          return { success: false, addedCount: 0, outOfStockItems: [] };
        }

        if (options?.clearExistingCart) {
          resetCart(order.store.id);
        }

        const outOfStock: string[] = [];
        const available: CartLine[] = [];

        for (const item of order.items) {
          // Check if item is marked out-of-stock in order metadata or 86 list
          const isUnavailable = (item as any).inStock === false || (item as any).is86ed === true;
          if (isUnavailable) {
            outOfStock.push(item.name);
          } else {
            // Generate unique line ID and preserve exact customizations
            const lineToAdd: CartLine = {
              ...item,
              id: `line_reorder_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              storeId: order.store.id,
            };
            available.push(lineToAdd);
          }
        }

        if (outOfStock.length > 0 && available.length > 0) {
          // Trigger out of stock confirmation modal
          setOutOfStockModal({
            isOpen: true,
            unavailableItems: outOfStock,
            availableLines: available,
          });
          return {
            success: false,
            addedCount: 0,
            outOfStockItems: outOfStock,
          };
        }

        // Add all available lines to cart
        for (const line of available) {
          addLine(line);
        }

        void HapticService.notification("success");
        void navigate({ to: "/cart" });

        return {
          success: true,
          addedCount: available.length,
          outOfStockItems: [],
        };
      } finally {
        setIsReordering(false);
      }
    },
    [addLine, resetCart, navigate]
  );

  const confirmReorderRemaining = useCallback(() => {
    for (const line of outOfStockModal.availableLines) {
      addLine(line);
    }
    setOutOfStockModal({ isOpen: false, unavailableItems: [], availableLines: [] });
    void HapticService.notification("success");
    void navigate({ to: "/cart" });
  }, [addLine, outOfStockModal, navigate]);

  const dismissOutOfStockModal = useCallback(() => {
    setOutOfStockModal({ isOpen: false, unavailableItems: [], availableLines: [] });
  }, []);

  return {
    reorder,
    isReordering,
    outOfStockModal,
    confirmReorderRemaining,
    dismissOutOfStockModal,
  };
}

export default useReorderItems;
