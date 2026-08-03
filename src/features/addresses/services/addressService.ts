/**
 * AddressService — mock CRUD implementation. The public shape mirrors
 * the future backend contract:
 *   GET    /v1/addresses           → list
 *   POST   /v1/addresses           → create
 *   PATCH  /v1/addresses/:id       → update
 *   DELETE /v1/addresses/:id       → remove
 *   POST   /v1/addresses/:id/default → setDefault
 *
 * State is held inside the addressStore; this file only encapsulates
 * validation + latency simulation so the swap to HTTP is a body-only
 * change per method.
 */
import { delay, fail, ok, type ApiResult } from "@/core/network/http";
import type { Address, AddressInput } from "@/features/addresses/models";

function validate(input: AddressInput): string | null {
  if (!input.line1?.trim()) return "Address line is required.";
  if (!input.city?.trim()) return "City is required.";
  if (!/^\d{6}$/.test(input.pincode ?? "")) return "Enter a valid 6-digit pincode.";
  return null;
}

let counter = 0;
const nextId = () => `addr_${Date.now().toString(36)}_${(++counter).toString(36)}`;

export const addressService = {
  async create(input: AddressInput): Promise<ApiResult<Address>> {
    await delay(150);
    const err = validate(input);
    if (err) return fail("INVALID_ADDRESS", err);
    const created: Address = {
      id: nextId(),
      isDefault: input.isDefault ?? false,
      ...input,
    };
    return ok(created);
  },

  async update(id: string, patch: Partial<AddressInput>): Promise<ApiResult<Partial<Address>>> {
    await delay(150);
    if (patch.contactPhone && !/^\d{10}$/.test(patch.contactPhone)) {
      return fail("INVALID_PHONE", "Enter a valid 10-digit phone.");
    }
    if (patch.pincode && !/^\d{6}$/.test(patch.pincode)) {
      return fail("INVALID_PINCODE", "Enter a valid 6-digit pincode.");
    }
    return ok({ id, ...patch });
  },

  async remove(id: string): Promise<ApiResult<{ id: string }>> {
    await delay(120);
    return ok({ id });
  },

  async setDefault(id: string): Promise<ApiResult<{ id: string }>> {
    await delay(100);
    return ok({ id });
  },

  /** Repo-driven prompts for the "Delivery instructions" quick-picks. */
  async listDeliveryInstructionPresets(): Promise<ApiResult<string[]>> {
    await delay(50);
    return ok([
      "Ring the bell",
      "Call on arrival",
      "Leave at the door",
      "Avoid contact",
      "Meet at the gate",
    ]);
  },
};
