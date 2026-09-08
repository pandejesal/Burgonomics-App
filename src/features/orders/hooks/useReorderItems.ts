import * as React from "react";
import { toast } from "sonner";
import { orderRepository } from "@/features/orders/repositories/OrderRepository";
import { cartRepository } from "@/features/cart/repositories/CartRepository";
import { useCartStore } from "@/features/cart/state/cartStore";
import type { CartLine } from "@/features/cart/models";
import type { Order } from "@/features/orders/models";

interface OutOfStockModal {
  isOpen: boolean;
  unavailableItems: string[];
}

/**
 * useReorderItems — 1-tap reorder. Re-adds the order's lines at current
 * server prices (repriced via the menu repository, clamped 1..99);
 * out-of-stock lines are reported in a modal instead of silently
 * dropped. Never mixes stores: a foreign-store cart blocks with an
 * explicit message.
 */
export function useReorderItems() {
  const [isReordering, setIsReordering] = React.useState(false);
  const [modal, setModal] = React.useState<OutOfStockModal>({ isOpen: false, unavailableItems: [] });
  const pendingRef = React.useRef<CartLine[]>([]);

  const buildLines = async (order: Order): Promise<{ ok: CartLine[]; missing: string[] }> => {
    const res = await orderRepository.reorder(order.id);
    if (!res.success || !res.data) {
      toast.error("Couldn't load this order for reorder.");
      return { ok: [], missing: [] };
    }
    const { menuRepository } = await import("@/features/menu/repositories/MenuRepository");
    const okLines: CartLine[] = [];
    const missing: string[] = [];
    for (const item of res.data.items) {
      const prod = await menuRepository.getProduct(item.productId, res.data.storeId);
      if (!prod.success || !prod.data || prod.data.inStock === false) {
        missing.push(item.name);
        continue;
      }
      okLines.push({
        ...item,
        lineId: `${item.productId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        storeId: res.data.storeId,
        unitPrice: prod.data.price,
        price: prod.data.price,
        quantity: Math.min(99, Math.max(1, item.quantity)),
        availability: "available",
      });
    }
    return { ok: okLines, missing };
  };

  const addLines = async (lines: CartLine[], storeId: string) => {
    const cart = useCartStore.getState();
    if (cart.lines.length > 0 && cart.storeId && cart.storeId !== storeId) {
      toast.error("Clear your cart before reordering from a different store.");
      return false;
    }
    for (const l of lines) {
      await cartRepository.addItem({
        storeId,
        productId: l.productId,
        name: l.name,
        unitPrice: l.unitPrice,
        quantity: l.quantity,
        veg: l.veg,
        imageUrl: l.imageUrl,
        fallbackImageUrl: l.fallbackImageUrl,
        modifiers: l.modifiers,
        notes: l.notes,
      });
    }
    return true;
  };

  const reorder = async (order: Order) => {
    if (isReordering) return;
    setIsReordering(true);
    try {
      const { ok: lines, missing } = await buildLines(order);
      if (lines.length === 0) {
        if (missing.length > 0) setModal({ isOpen: true, unavailableItems: missing });
        pendingRef.current = [];
        return;
      }
      if (missing.length > 0) {
        // Stage the available lines behind the modal: Confirm adds them,
        // Cancel drops everything. Nothing is silently partial.
        pendingRef.current = lines;
        setModal({ isOpen: true, unavailableItems: missing });
        return;
      }
      const storeId = lines[0]?.storeId ?? order.store.id;
      const added = await addLines(lines, storeId);
      if (added) toast.success("Items added back to your cart");
    } finally {
      setIsReordering(false);
    }
  };

  const dismissOutOfStockModal = React.useCallback(() => {
    pendingRef.current = [];
    setModal({ isOpen: false, unavailableItems: [] });
  }, []);

  const confirmReorderRemaining = React.useCallback(async () => {
    const lines = pendingRef.current;
    pendingRef.current = [];
    setModal({ isOpen: false, unavailableItems: [] });
    if (lines.length === 0) return;
    const storeId = lines[0]?.storeId ?? "";
    const added = await addLines(lines, storeId);
    if (added) toast.success(`Added ${lines.length} available items`);
  }, []);

  return { reorder, isReordering, outOfStockModal: modal, confirmReorderRemaining, dismissOutOfStockModal };
}
