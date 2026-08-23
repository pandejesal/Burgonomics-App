/**
 * CartRepository — the sole entry point UI components use to mutate or
 * read the cart. Wraps the persisted Zustand store today; tomorrow it
 * will additionally sync mutations to PETPOOJA via the backend.
 *
 * Contract mirrors the future REST surface:
 *   POST   /v1/cart/items           → addItem
 *   PATCH  /v1/cart/items/:lineId   → updateQuantity / updateNotes
 *   DELETE /v1/cart/items/:lineId   → removeItem
 *   DELETE /v1/cart                 → clear
 *   POST   /v1/cart/calculate       → calculateTotals
 *   POST   /v1/cart/promo           → applyPromo
 *   POST   /v1/cart/validate        → validateCart
 *   POST   /v1/cart/checkout/prepare→ prepareCheckout
 */
import type { ApiResult } from "@/core/network/http";
import { ok } from "@/core/network/http";
import { generateSecureId } from "@/shared/utils/cryptoUtils";
import { useCartStore } from "@/features/cart/state/cartStore";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import type {
  AppliedPromo,
  CartLine,
  CartTotals,
  CartValidation,
  Fulfillment,
} from "@/features/cart/models";
import {
  calculateTotals,
  prepareCheckoutMock,
  validateCartMock,
} from "@/features/cart/services/cartService";
import { offerRepository } from "@/features/offers/repositories/OfferRepository";

/** Default used when the user hasn't chosen a fulfillment method yet. */
const DEFAULT_FULFILLMENT: Fulfillment = "delivery";

export interface AddItemInput {
  storeId: string;
  productId: string;
  name: string;
  imageUrl?: string;
  fallbackImageUrl?: string;
  veg?: boolean;
  unitPrice: number;
  quantity: number;
  modifiers?: CartLine["modifiers"];
  notes?: string;
  meta?: Record<string, unknown>;
}

export class CartRepository {
  readonly name = "CartRepository";

  // -- Reads -----------------------------------------------------------
  getLines(): CartLine[] {
    return useCartStore.getState().lines;
  }
  getStoreId(): string | null {
    return useCartStore.getState().storeId;
  }
  getFulfillment(): Fulfillment {
    return useStoreSelection.getState().fulfillment ?? DEFAULT_FULFILLMENT;
  }
  getPromo(): AppliedPromo | null {
    return useCartStore.getState().promo;
  }

  // -- Mutations -------------------------------------------------------

  /**
   * Add an item to the cart. Rejects if the cart already contains lines
   * from a different store — the caller must clear or prompt first.
   */
  async addItem(input: AddItemInput): Promise<ApiResult<CartLine>> {
    const s = useCartStore.getState();
    if (s.storeId && s.storeId !== input.storeId) {
      return {
        success: false,
        error: {
          code: "STORE_MISMATCH",
          message: "Clear your cart before adding items from a different store.",
        },
      };
    }
    const line: CartLine = {
      lineId: `${input.productId}-${Date.now()}-${generateSecureId(4)}`,
      productId: input.productId,
      storeId: input.storeId,
      name: input.name,
      imageUrl: input.imageUrl,
      fallbackImageUrl: input.fallbackImageUrl,
      veg: input.veg,
      unitPrice: input.unitPrice,
      quantity: Math.max(1, input.quantity),
      modifiers: input.modifiers ?? [],
      notes: input.notes,
      availability: "available",
      meta: input.meta,
    };
    s.addLine(line);
    return ok(line);
  }

  async updateQuantity(lineId: string, quantity: number): Promise<ApiResult<void>> {
    useCartStore.getState().updateQuantity(lineId, quantity);
    return ok(undefined);
  }

  async updateNotes(lineId: string, notes: string): Promise<ApiResult<void>> {
    useCartStore.getState().updateNotes(lineId, notes);
    return ok(undefined);
  }

  async removeItem(lineId: string): Promise<ApiResult<void>> {
    useCartStore.getState().removeLine(lineId);
    return ok(undefined);
  }

  async clear(): Promise<ApiResult<void>> {
    useCartStore.getState().clear();
    return ok(undefined);
  }

  setFulfillment(f: Fulfillment): void {
    useStoreSelection.getState().setFulfillment(f);
  }

  // -- Calculations ----------------------------------------------------

  async calculateTotals(): Promise<ApiResult<CartTotals>> {
    const s = useCartStore.getState();
    const sel = useStoreSelection.getState();
    const pricingConfig = sel.activeStore?.pricing;

    if (!pricingConfig) {
      return {
        success: false,
        error: {
          code: "PRICING_CONFIG_UNAVAILABLE",
          message:
            "Store pricing configuration is currently unavailable. Please select your store or retry.",
        },
      };
    }

    try {
      const totals = calculateTotals({
        lines: s.lines,
        fulfillment: this.getFulfillment(),
        promo: s.promo,
        pricingConfig,
      });
      return ok(totals);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: {
          code: "PRICING_CALCULATION_ERROR",
          message: msg,
        },
      };
    }
  }

  // -- Promo / offers --------------------------------------------------

  /**
   * Apply an offer to the cart. Delegates to OfferRepository — the
   * frontend never validates or computes discounts locally. Accepts
   * either a coupon `code` or a repository-provided `offerId`.
   */
  async applyPromo(
    codeOrInput: string | { code?: string; offerId?: string },
  ): Promise<ApiResult<AppliedPromo>> {
    const s = useCartStore.getState();
    const sel = useStoreSelection.getState();
    const pricingConfig = sel.activeStore?.pricing;

    if (!pricingConfig) {
      return {
        success: false,
        error: {
          code: "PRICING_CONFIG_UNAVAILABLE",
          message:
            "Store pricing configuration is currently unavailable. Please select your store or retry.",
        },
      };
    }

    try {
      const totals = calculateTotals({
        lines: s.lines,
        fulfillment: this.getFulfillment(),
        promo: null,
        pricingConfig,
      });
      const payload = typeof codeOrInput === "string" ? { code: codeOrInput } : codeOrInput;
      const res = await offerRepository.apply({
        ...payload,
        storeId: s.storeId ?? undefined,
        fulfillment: this.getFulfillment(),
        subtotal: totals.subtotal,
      });
      if (!res.success) return res;
      const applied: AppliedPromo = {
        offerId: res.data.offerId,
        code: res.data.code,
        description: res.data.title,
        discount: res.data.discount,
        savingsLabel: res.data.savingsLabel,
        type: res.data.type,
      };
      s.setPromo(applied);
      return ok(applied);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: {
          code: "PRICING_CALCULATION_ERROR",
          message: msg,
        },
      };
    }
  }

  async removePromo(): Promise<ApiResult<void>> {
    const s = useCartStore.getState();
    const current = s.promo;
    if (current?.offerId) {
      await offerRepository.remove(current.offerId);
    }
    s.setPromo(null);
    return ok(undefined);
  }

  // -- Validation / checkout hand-off ---------------------------------

  async validateCart(): Promise<ApiResult<CartValidation>> {
    const s = useCartStore.getState();
    if (s.isPriceLockExpired()) {
      await this.validateAndRefreshPriceLock();
    }
    return validateCartMock(useCartStore.getState().lines);
  }

  async validateAndRefreshPriceLock(): Promise<
    ApiResult<{ revalidated: boolean; messages: string[] }>
  > {
    const s = useCartStore.getState();
    if (s.lines.length === 0) return ok({ revalidated: false, messages: [] });

    try {
      const { menuRepository } = await import("@/features/menu/repositories/MenuRepository");
      const productsRes = await menuRepository.listProducts(
        s.storeId ?? undefined,
        undefined,
        1,
        100,
      );
      if (productsRes.success) {
        const res = s.revalidateWithProducts(productsRes.data.items);
        return ok({ revalidated: true, messages: res.messages });
      }
    } catch {
      // ignore
    }
    s.renewPriceLock();
    return ok({ revalidated: false, messages: [] });
  }

  async prepareCheckout(): Promise<ApiResult<{ checkoutToken: string }>> {
    return prepareCheckoutMock(useCartStore.getState().lines);
  }
}

export const cartRepository = new CartRepository();
