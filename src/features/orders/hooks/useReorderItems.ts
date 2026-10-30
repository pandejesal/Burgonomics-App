/**
 * 1-Tap Reorder — validate the LIVE outlet before touching the basket.
 *
 * Contract (D31–D33 / cart-reorder rewrite):
 *   - the customer's basket is preserved until the target outlet, stock,
 *     options, prices and quantities have all been validated — including a
 *     SECOND fresh read at confirmation time, because the dialog can sit open
 *     for minutes;
 *   - the target is always the CURRENT selected outlet. A past order from a
 *     different outlet is refused with a visible explanation; the app never
 *     switches the customer's outlet or fulfilment mode behind their back;
 *   - validation reads product DETAILS for the handful of products in the
 *     order (never a 1,000-item catalogue scan), scoped to that outlet;
 *   - unknown/retired variations or add-ons, broken group rules and invalid
 *     money are rejected with a visible explanation — never substituted,
 *     never silently dropped, never coerced with `|| 0`;
 *   - price changes are shown BEFORE anything is added and must be confirmed;
 *   - a cancelled confirmation, a failed read, an account change, or a basket
 *     change during the async work leaves the basket exactly as it was;
 *   - a module-level fence makes two hook instances (or a double tap) add
 *     exactly once, and a per-instance cleanup releases ONLY its own token, so
 *     leaving a dialog cannot lock reorder forever;
 *   - an unmounted hook never mutates the basket or calls back into React;
 *   - the old line notes are never copied into the new order.
 */
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { HapticService } from "@/core/services/haptics";
import { generateSecureId } from "@/shared/utils/cryptoUtils";
import { menuRepository } from "@/features/menu/repositories/MenuRepository";
import type { ProductDetails } from "@/features/menu/models";
import { useCartStore } from "@/features/cart/state/cartStore";
import type { CartLine } from "@/features/cart/models";
import { useAuthStore } from "@/features/auth/state/authStore";
import { useStoreSelection, storeSupportsFulfillment } from "@/features/stores/state/storeStore";
import type { Order } from "../models";
import {
  buildReorderPlan,
  isSupportedFulfillment,
  planSignature,
  type ReorderPlan,
  type ReorderPriceChange,
  type ReorderRejection,
  type SupportedFulfillment,
} from "../utils/reorderValidation";

export type ReorderFailureReason =
  | "empty_order"
  | "missing_store"
  | "outlet_mismatch"
  | "unsupported_fulfillment"
  | "lookup_failed"
  | "in_progress"
  | "aborted"
  | "requires_confirmation"
  | "nothing_available";

export interface ReorderResult {
  success: boolean;
  addedCount: number;
  outOfStockItems?: string[];
  reason?: ReorderFailureReason;
}

export interface ReorderConfirmation {
  replacesCart: boolean;
  storeName: string;
  priceChanges: ReorderPriceChange[];
  /** True when the confirmation follows the out-of-stock review dialog. */
  afterUnavailableReview: boolean;
}

export interface ReorderOutOfStockState {
  isOpen: boolean;
  /** Customer-readable rejection messages, one per blocked item. */
  unavailableItems: string[];
}

/** Identity of the basket/account/outlet/mode an attempt was started against. */
interface AttemptScope {
  uid: string | null;
  selectedStoreId: string;
  /** The order type in force when the attempt started (delivery/takeaway/dinein). */
  fulfillment: SupportedFulfillment;
  cartFingerprint: string;
}

interface PendingAdd extends AttemptScope {
  token: symbol;
  /** Outlet the items are actually added from = the CURRENT selection. */
  targetStoreId: string;
  storeName: string;
  /** The snapshot lines that survived validation, in order. */
  sources: CartLine[];
  plan: ReorderPlan;
  replaceExistingCart: boolean;
  /** True when this plan came from the out-of-stock review dialog. */
  afterUnavailableReview: boolean;
}

/**
 * A fence token is tagged with the hook instance that owns it, so:
 *   - unmount releases exactly its own token (never a sibling's), and
 *   - a fence left behind by a dead owner is pruned instead of locking the
 *     feature forever.
 */
interface FenceOwner {
  mounted: boolean;
}

// Shared across every hook instance: a second tap while a reorder (or its
// confirmation) is in flight must not start a second validation or add twice.
let activeToken: symbol | null = null;
let activeOwner: FenceOwner | null = null;
let pendingToken: symbol | null = null;
let pendingOwner: FenceOwner | null = null;

function pruneDeadFences(): void {
  if (activeToken !== null && activeOwner !== null && !activeOwner.mounted) {
    activeToken = null;
    activeOwner = null;
  }
  if (pendingToken !== null && pendingOwner !== null && !pendingOwner.mounted) {
    pendingToken = null;
    pendingOwner = null;
  }
}

const EMPTY_OUT_OF_STOCK: ReorderOutOfStockState = { isOpen: false, unavailableItems: [] };

/** Basket identity — deliberately excludes notes, which do not affect adds. */
export function cartFingerprint(): string {
  const { storeId, lines } = useCartStore.getState();
  return `${storeId ?? ""}|${lines
    .map((line) => `${line.lineId}:${line.quantity}:${line.unitPrice}`)
    .join(",")}`;
}

function productIdOf(line: CartLine): string | undefined {
  const productId = (line as { productId?: unknown }).productId;
  return typeof productId === "string" && productId.length > 0 ? productId : undefined;
}

/**
 * Read live details for the order's products. A rejected request is a
 * controlled `ok: false` — never an unhandled rejection that leaves the fence
 * (and the customer) hanging.
 */
async function loadLiveDetails(
  lines: readonly CartLine[],
  storeId: string,
): Promise<{ ok: true; details: Map<string, ProductDetails | null> } | { ok: false }> {
  const ids = [...new Set(lines.map(productIdOf).filter((id): id is string => !!id))];
  const details = new Map<string, ProductDetails | null>();
  try {
    const results = await Promise.all(ids.map((id) => menuRepository.getProduct(id, storeId)));
    for (let index = 0; index < ids.length; index += 1) {
      const result = results[index];
      if (!result || !result.success) return { ok: false };
      details.set(ids[index], result.data);
    }
  } catch (error) {
    console.error("[reorder] live product read failed:", error);
    return { ok: false };
  }
  return { ok: true, details };
}

function toCartLine(line: ReorderPlan["lines"][number], storeId: string): CartLine {
  return {
    // A fresh identity for this basket — never the snapshot's own id field.
    lineId: `line_reorder_${Date.now()}_${generateSecureId(6)}`,
    productId: line.product.id,
    storeId,
    name: line.product.name,
    imageUrl: line.product.imageUrl,
    fallbackImageUrl: line.product.fallbackImageUrl,
    veg: line.product.veg,
    unitPrice: line.unitPrice,
    quantity: line.quantity,
    modifiers: line.modifiers,
    availability: "available",
    // `notes` is intentionally absent: an old line note must not ride along.
  };
}

function confirmationFor(pending: PendingAdd): ReorderConfirmation {
  return {
    replacesCart: pending.replaceExistingCart,
    storeName: pending.storeName,
    priceChanges: pending.plan.priceChanges,
    afterUnavailableReview: pending.afterUnavailableReview,
  };
}

function rejectionMessages(rejected: readonly ReorderRejection[]): string[] {
  return rejected.map((entry) => entry.message);
}

/** The account / outlet / order type / basket must still be the ones the attempt started on. */
function scopeMatches(scope: AttemptScope): boolean {
  if ((useAuthStore.getState().user?.id ?? null) !== scope.uid) return false;
  const selection = useStoreSelection.getState();
  if ((selection.activeStore?.id ?? null) !== scope.selectedStoreId) return false;
  // The order type is part of the contract: switching delivery → dine-in while
  // the lookup/confirmation is pending would add the basket into a different
  // channel. It must also still be SUPPORTED by the (possibly updated) store.
  if (selection.fulfillment !== scope.fulfillment) return false;
  if (!storeSupportsFulfillment(selection.activeStore, scope.fulfillment)) return false;
  return cartFingerprint() === scope.cartFingerprint;
}

export function useReorderItems() {
  const navigate = useNavigate();
  const [isReordering, setIsReordering] = useState(false);
  const [outOfStockModal, setOutOfStockModal] =
    useState<ReorderOutOfStockState>(EMPTY_OUT_OF_STOCK);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<ReorderConfirmation | null>(null);
  const pendingRef = useRef<PendingAdd | null>(null);

  // Liveness: a hook that unmounts must abort its async work instead of
  // mutating the basket or releasing a fence it no longer owns.
  const ownerRef = useRef<FenceOwner>({ mounted: true });
  const generationRef = useRef(0);
  const ownedActiveRef = useRef<symbol | null>(null);
  const ownedPendingRef = useRef<symbol | null>(null);

  // Layout effect: its cleanup runs synchronously in the unmount commit, so the
  // fence is released before anything else can try to reorder. A passive effect
  // would leave a window where a dead hook's token still looks live.
  useLayoutEffect(() => {
    const owner = ownerRef.current;
    owner.mounted = true;
    const generation = generationRef.current;
    return () => {
      owner.mounted = false;
      if (generationRef.current === generation) generationRef.current += 1;

      // Release ONLY this instance's tokens: another hook may legitimately hold
      // the fence, and clearing it here would let a third tap double-add.
      const active = ownedActiveRef.current;
      if (active !== null && activeToken === active) {
        activeToken = null;
        activeOwner = null;
      }
      ownedActiveRef.current = null;

      const pending = ownedPendingRef.current;
      if (pending !== null && pendingToken === pending) {
        pendingToken = null;
        pendingOwner = null;
      }
      ownedPendingRef.current = null;

      pendingRef.current = null;
    };
  }, []);

  const isMounted = useCallback(() => ownerRef.current.mounted, []);

  const isAttemptLive = useCallback(
    (token: symbol, generation: number) =>
      ownerRef.current.mounted &&
      generationRef.current === generation &&
      (activeToken === token || pendingToken === token),
    [],
  );

  const claim = useCallback((token: symbol) => {
    activeToken = token;
    activeOwner = ownerRef.current;
    ownedActiveRef.current = token;
  }, []);

  /** Hold the dialog fence for this instance (until confirm/cancel/unmount). */
  const holdPending = useCallback((token: symbol) => {
    pendingToken = token;
    pendingOwner = ownerRef.current;
    ownedPendingRef.current = token;
  }, []);

  const releaseActive = useCallback((token: symbol) => {
    if (activeToken === token) {
      activeToken = null;
      activeOwner = null;
    }
    if (ownedActiveRef.current === token) ownedActiveRef.current = null;
  }, []);

  /** Drop a dialog held by THIS instance (never another hook's). */
  const clearPending = useCallback((token: symbol) => {
    if (pendingToken === token) {
      pendingToken = null;
      pendingOwner = null;
    }
    if (ownedPendingRef.current === token) ownedPendingRef.current = null;
    if (pendingRef.current?.token === token) pendingRef.current = null;
  }, []);

  const commit = useCallback(
    (pending: PendingAdd, plan: ReorderPlan): number => {
      // An unmounted hook must never add to the basket.
      if (!ownerRef.current.mounted) return 0;
      const store = useCartStore.getState();
      if (pending.replaceExistingCart) {
        // Only reached after validation AND explicit confirmation.
        store.reset(pending.targetStoreId);
      } else if (!store.storeId) {
        store.reset(pending.targetStoreId);
      }

      const liveProducts = plan.lines.map((line) => line.product);
      for (const planLine of plan.lines) {
        store.addLine(toCartLine(planLine, pending.targetStoreId));
      }
      // Re-price/flag against the catalogue we just verified, so the new lines
      // cannot defer the stock truth the cart would otherwise catch later.
      const validation = useCartStore.getState().revalidateWithProducts(liveProducts);
      if (validation.messages.length > 0) {
        toast.info(validation.messages.slice(0, 2).join(" "));
      }

      void HapticService.notification("success");
      void navigate({ to: "/cart" });
      return plan.lines.length;
    },
    [navigate],
  );

  const reorder = useCallback(
    async (order: Order): Promise<ReorderResult> => {
      if (!isMounted()) {
        return { success: false, addedCount: 0, reason: "aborted" };
      }
      pruneDeadFences();
      if (activeToken !== null || pendingToken !== null) {
        return { success: false, addedCount: 0, reason: "in_progress" };
      }
      if (!order.items || order.items.length === 0) {
        return { success: false, addedCount: 0, reason: "empty_order" };
      }

      const pastStoreId =
        typeof order.store?.id === "string" && order.store.id.length > 0 ? order.store.id : "";
      if (!pastStoreId) {
        // Never invent "store_default": without a real outlet nothing can be
        // verified, so nothing is added.
        toast.error("We couldn't tell which outlet this order came from. Please add items from the menu.");
        return { success: false, addedCount: 0, reason: "missing_store" };
      }

      const selection = useStoreSelection.getState();
      const currentStore = selection.activeStore ?? null;
      const currentStoreId =
        typeof currentStore?.id === "string" && currentStore.id.length > 0
          ? currentStore.id
          : "";

      if (!currentStoreId) {
        toast.error(
          "Choose an outlet before reordering — we can only add items from the outlet you have selected. Nothing was added.",
        );
        return { success: false, addedCount: 0, reason: "outlet_mismatch" };
      }

      // Fail closed on an outlet change: the items belong to the CURRENT
      // outlet, and the app never silently switches what the customer chose.
      if (currentStoreId !== pastStoreId) {
        const pastName = order.store?.name ?? "a different outlet";
        const currentName = currentStore?.name ?? "your current outlet";
        toast.error(
          `This order was placed at ${pastName}, but you're ordering from ${currentName} now. Switch outlet to ${pastName} to reorder it — nothing was added.`,
        );
        return { success: false, addedCount: 0, reason: "outlet_mismatch" };
      }

      // The current outlet must actually offer the current fulfilment mode;
      // forcing the past order's mode would be a silent channel switch.
      const fulfillment = selection.fulfillment;
      if (
        !isSupportedFulfillment(fulfillment) ||
        !storeSupportsFulfillment(currentStore, fulfillment)
      ) {
        toast.error(
          "Choose delivery, takeaway or dine-in for this outlet before reordering. Nothing was added.",
        );
        return { success: false, addedCount: 0, reason: "unsupported_fulfillment" };
      }

      const token = Symbol("reorder");
      const generation = generationRef.current;
      claim(token);
      if (isMounted()) setIsReordering(true);

      const scope: AttemptScope = {
        uid: useAuthStore.getState().user?.id ?? null,
        selectedStoreId: currentStoreId,
        fulfillment,
        cartFingerprint: cartFingerprint(),
      };

      try {
        const live = await loadLiveDetails(order.items, currentStoreId);
        if (!isAttemptLive(token, generation)) {
          return { success: false, addedCount: 0, reason: "aborted" };
        }
        if (!live.ok) {
          toast.error(
            "Could not verify what is available at this outlet right now. Your cart is unchanged.",
          );
          return { success: false, addedCount: 0, reason: "lookup_failed" };
        }
        if (!scopeMatches(scope)) {
          toast.error("Your cart, account or order type changed while we checked availability, so nothing was added.");
          return { success: false, addedCount: 0, reason: "aborted" };
        }

        const plan = buildReorderPlan(order.items, live.details);
        const cart = useCartStore.getState();
        const replaceExistingCart = cart.lines.length > 0 && cart.storeId !== currentStoreId;
        const pending: PendingAdd = {
          ...scope,
          token,
          targetStoreId: currentStoreId,
          storeName: currentStore?.name ?? "this outlet",
          sources: order.items,
          plan,
          replaceExistingCart,
          afterUnavailableReview: false,
        };

        if (plan.lines.length === 0) {
          setOutOfStockModal({ isOpen: true, unavailableItems: rejectionMessages(plan.rejected) });
          return {
            success: false,
            addedCount: 0,
            reason: "nothing_available",
            outOfStockItems: rejectionMessages(plan.rejected),
          };
        }

        if (plan.rejected.length > 0) {
          // Retained flow: show what could not be reordered, let the customer
          // decide whether to add the remainder (freshly revalidated on tap).
          pendingRef.current = pending;
          holdPending(token);
          setOutOfStockModal({
            isOpen: true,
            unavailableItems: rejectionMessages(plan.rejected),
          });
          return {
            success: false,
            addedCount: 0,
            reason: "nothing_available",
            outOfStockItems: rejectionMessages(plan.rejected),
          };
        }

        if (replaceExistingCart || plan.hasPriceChanges) {
          pendingRef.current = pending;
          holdPending(token);
          setPendingConfirmation(confirmationFor(pending));
          return { success: false, addedCount: 0, reason: "requires_confirmation" };
        }

        const addedCount = commit(pending, plan);
        return { success: addedCount > 0, addedCount };
      } finally {
        if (isMounted()) setIsReordering(false);
        releaseActive(token);
      }
    },
    [claim, commit, holdPending, isAttemptLive, releaseActive],
  );

  /** "Reorder the rest" — fresh reads for exactly the surviving lines. */
  const confirmReorderRemaining = useCallback(async () => {
    pruneDeadFences();
    const pending = pendingRef.current;
    if (!pending || pendingToken !== pending.token) return;
    if (activeToken !== null || !isMounted()) return;

    const token = pending.token;
    const generation = generationRef.current;
    claim(token);
    setIsReordering(true);

    try {
      if (!scopeMatches(pending)) {
        clearPending(token);
        setOutOfStockModal(EMPTY_OUT_OF_STOCK);
        toast.error("Your cart or order type changed while we checked availability, so nothing was added.");
        return;
      }

      // Only the lines that survived the first pass are re-read; a line that
      // was rejected for its own quantity/options is never smuggled back in.
      const allowedLineIds = new Set(pending.plan.lines.map((line) => line.source.lineId));
      const sources = pending.sources.filter((line) => allowedLineIds.has(line.lineId));

      const live = await loadLiveDetails(sources, pending.targetStoreId);
      if (!isAttemptLive(token, generation)) return;
      if (!live.ok) {
        clearPending(token);
        setOutOfStockModal(EMPTY_OUT_OF_STOCK);
        toast.error(
          "Could not verify current availability. Your cart is unchanged — please try again.",
        );
        return;
      }
      if (!scopeMatches(pending)) {
        clearPending(token);
        setOutOfStockModal(EMPTY_OUT_OF_STOCK);
        toast.error("Your cart or order type changed while we checked availability, so nothing was added.");
        return;
      }

      const fresh = buildReorderPlan(sources, live.details);
      const next: PendingAdd = { ...pending, sources, plan: fresh, afterUnavailableReview: true };

      if (fresh.lines.length === 0) {
        clearPending(token);
        setOutOfStockModal(EMPTY_OUT_OF_STOCK);
        toast.error("None of those items can be reordered right now.");
        return;
      }

      if (fresh.rejected.length > 0) {
        // Something dropped out between the two reads: keep the review open
        // with the current truth instead of adding a surprise subset.
        pendingRef.current = next;
        holdPending(token);
        setOutOfStockModal({
          isOpen: true,
          unavailableItems: rejectionMessages(fresh.rejected),
        });
        return;
      }

      setOutOfStockModal(EMPTY_OUT_OF_STOCK);

      if (fresh.hasPriceChanges || next.replaceExistingCart) {
        pendingRef.current = next;
        holdPending(token);
        setPendingConfirmation(confirmationFor(next));
        return;
      }

      clearPending(token);
      commit(next, fresh);
    } finally {
      if (isMounted()) setIsReordering(false);
      releaseActive(token);
    }
  }, [claim, clearPending, commit, holdPending, isAttemptLive, releaseActive]);

  /**
   * Confirm the price/replacement dialog. The dialog may have been open for
   * minutes, so the cached plan is NEVER committed directly: details are read
   * again, the plan is rebuilt, and only an unchanged offer is added.
   */
  const confirmPendingReorder = useCallback(async () => {
    pruneDeadFences();
    const pending = pendingRef.current;
    if (!pending || pendingToken !== pending.token) return;
    if (activeToken !== null || !isMounted()) return;

    const token = pending.token;
    const generation = generationRef.current;
    claim(token);
    setIsReordering(true);

    try {
      if (!scopeMatches(pending)) {
        clearPending(token);
        setPendingConfirmation(null);
        toast.error("Your cart or order type changed, so nothing was added. Review the cart and try again.");
        return;
      }

      const live = await loadLiveDetails(pending.sources, pending.targetStoreId);
      if (!isAttemptLive(token, generation)) return;
      if (!live.ok) {
        clearPending(token);
        setPendingConfirmation(null);
        toast.error(
          "We couldn't confirm today's availability and prices, so nothing was added. Your cart is unchanged — please try again.",
        );
        return;
      }
      // A cancel or a newer attempt may have replaced the pending dialog while
      // the read was in flight.
      if (pendingRef.current !== pending || pendingToken !== token) return;
      if (!scopeMatches(pending)) {
        clearPending(token);
        setPendingConfirmation(null);
        toast.error("Your cart or order type changed, so nothing was added. Review the cart and try again.");
        return;
      }

      const fresh = buildReorderPlan(pending.sources, live.details);

      if (fresh.lines.length === 0) {
        clearPending(token);
        setPendingConfirmation(null);
        setOutOfStockModal({
          isOpen: true,
          unavailableItems: rejectionMessages(fresh.rejected),
        });
        toast.error("None of those items can be reordered right now. Nothing was added.");
        return;
      }

      if (fresh.rejected.length > 0) {
        // Stock/options changed while the customer was reading the dialog.
        // Preserve the basket and explain through the review surface.
        const next: PendingAdd = { ...pending, plan: fresh, afterUnavailableReview: true };
        pendingRef.current = next;
        holdPending(token);
        setPendingConfirmation(null);
        setOutOfStockModal({
          isOpen: true,
          unavailableItems: rejectionMessages(fresh.rejected),
        });
        toast.info("Some items became unavailable while you were confirming. Nothing was added.");
        return;
      }

      if (planSignature(fresh) !== planSignature(pending.plan)) {
        // The price (or the selection) moved again: show the NEW numbers and
        // require a fresh confirmation instead of adding a different total.
        const next: PendingAdd = { ...pending, plan: fresh, afterUnavailableReview: true };
        pendingRef.current = next;
        holdPending(token);
        setPendingConfirmation(confirmationFor(next));
        toast.info("Prices changed again while you were confirming — review the updated total.");
        return;
      }

      clearPending(token);
      setPendingConfirmation(null);
      commit(pending, fresh);
    } finally {
      if (isMounted()) setIsReordering(false);
      releaseActive(token);
    }
  }, [claim, clearPending, commit, holdPending, isAttemptLive, releaseActive]);

  const cancelPendingReorder = useCallback(() => {
    const pending = pendingRef.current;
    if (pending && pendingToken === pending.token) {
      clearPending(pending.token);
    } else {
      pendingRef.current = null;
    }
    setPendingConfirmation(null);
  }, [clearPending]);

  const dismissOutOfStockModal = useCallback(() => {
    setOutOfStockModal(EMPTY_OUT_OF_STOCK);
    const pending = pendingRef.current;
    if (pending) clearPending(pending.token);
  }, [clearPending]);

  return {
    reorder,
    isReordering,
    outOfStockModal,
    confirmReorderRemaining,
    dismissOutOfStockModal,
    pendingConfirmation,
    confirmPendingReorder,
    cancelPendingReorder,
  };
}

export default useReorderItems;
