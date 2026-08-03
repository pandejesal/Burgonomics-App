import { checkoutService } from "@/features/checkout/services/checkoutService";

/**
 * CheckoutRepository — thin façade over checkout-specific services.
 * The presets endpoints back the note quick-picks on the Checkout screen.
 * Payment orchestration lives in `@/features/payments` and is intentionally
 * kept out of this façade to preserve the module boundary.
 *
 * Future integration point:
 *   - Replace `checkoutService.list*Presets` with GET
 *     /v1/checkout/presets?type=… once the backend ships.
 */
export class CheckoutRepository {
  constructor(private readonly service = checkoutService) {}

  orderNotePresets() {
    return this.service.listOrderNotePresets();
  }
  pickupInstructionPresets() {
    return this.service.listPickupInstructionPresets();
  }
  diningNotePresets() {
    return this.service.listDiningNotePresets();
  }
}

export const checkoutRepository = new CheckoutRepository();
