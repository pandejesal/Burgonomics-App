/**
 * CheckoutService — repository-backed presets and validation helpers.
 * All values are placeholders until the offers / notes backend ships;
 * every method's return shape matches the future REST response so
 * swapping in the HTTP call is a body-only change.
 */
import { delay, ok, type ApiResult } from "@/core/network/http";

export const checkoutService = {
  async listOrderNotePresets(): Promise<ApiResult<string[]>> {
    await delay(50);
    return ok([
      "Please don't include cutlery",
      "Extra napkins please",
      "No plastic packaging",
      "Kitchen — please make it less spicy",
    ]);
  },

  async listPickupInstructionPresets(): Promise<ApiResult<string[]>> {
    await delay(50);
    return ok(["I'll pick up at the counter", "Curbside pickup", "Call on arrival"]);
  },

  async listDiningNotePresets(): Promise<ApiResult<string[]>> {
    await delay(50);
    return ok(["High chair needed", "Window seat preferred", "Celebrating a birthday"]);
  },
};
