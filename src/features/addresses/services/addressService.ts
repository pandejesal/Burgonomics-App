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
import { fail, ok, type ApiResult } from "@/core/network/http";
import type { Address, AddressInput } from "@/features/addresses/models";
import { INDIAN_MOBILE_RE } from "@/features/auth/utils/validators";

/**
 * Shared create-path validation. Phone uses the same strict Indian
 * mobile rule as auth (first digit 6–9) so "0000000000", "1234567890"
 * and 5-series numbers fail closed here too.
 */
function validate(input: AddressInput): string | null {
  if (!input.line1?.trim()) return "Address line is required.";
  if (!input.city?.trim()) return "City is required.";
  if (!/^\d{6}$/.test(input.pincode ?? "")) return "Enter a valid 6-digit pincode.";
  if (input.contactPhone && !INDIAN_MOBILE_RE.test(input.contactPhone)) {
    return "Enter a valid 10-digit Indian mobile number.";
  }
  return null;
}

/**
 * Update-path validation — same rules as create, applied only to the
 * fields present in the patch. A present-but-invalid phone fails closed.
 */
function validatePatch(patch: Partial<AddressInput>): string | null {
  if (patch.line1 !== undefined && !patch.line1?.trim()) return "Address line is required.";
  if (patch.city !== undefined && !patch.city?.trim()) return "City is required.";
  if (patch.pincode !== undefined && !/^\d{6}$/.test(patch.pincode ?? "")) {
    return "Enter a valid 6-digit pincode.";
  }
  if (patch.contactPhone !== undefined && !INDIAN_MOBILE_RE.test(patch.contactPhone)) {
    return "Enter a valid 10-digit Indian mobile number.";
  }
  return null;
}

let counter = 0;
const nextId = () => `addr_${Date.now().toString(36)}_${(++counter).toString(36)}`;

export const addressService = {
  async list(): Promise<ApiResult<Address[]>> {
    try {
      const { auth, db } = await import("@/core/config/firebase");
      const { collection, getDocs } = await import("firebase/firestore");
      const user = auth.currentUser;
      if (!user) return ok([]);

      const snap = await getDocs(collection(db, `users/${user.uid}/addresses`));
      const addresses: Address[] = [];
      snap.forEach((doc) => {
        addresses.push(doc.data() as Address);
      });
      return ok(addresses);
    } catch (error: any) {
      console.warn("Firestore address list error:", error);
      return ok([]);
    }
  },

  async create(input: AddressInput): Promise<ApiResult<Address>> {
    const err = validate(input);
    if (err) return fail("INVALID_ADDRESS", err);

    const created: Address = {
      id: nextId(),
      isDefault: input.isDefault ?? false,
      ...input,
    };

    try {
      const { auth, db } = await import("@/core/config/firebase");
      const { doc, setDoc } = await import("firebase/firestore");
      const user = auth.currentUser;
      if (user) {
        await setDoc(doc(db, `users/${user.uid}/addresses`, created.id), created);
      }
    } catch (error: any) {
      console.warn("Firestore address create error:", error);
    }

    return ok(created);
  },

  async update(id: string, patch: Partial<AddressInput>): Promise<ApiResult<Partial<Address>>> {
    const err = validatePatch(patch);
    if (err) return fail("INVALID_ADDRESS", err);

    try {
      const { auth, db } = await import("@/core/config/firebase");
      const { doc, updateDoc } = await import("firebase/firestore");
      const user = auth.currentUser;
      if (user) {
        await updateDoc(doc(db, `users/${user.uid}/addresses`, id), patch);
      }
    } catch (error: any) {
      console.warn("Firestore address update error:", error);
    }

    return ok({ id, ...patch });
  },

  async remove(id: string): Promise<ApiResult<{ id: string }>> {
    try {
      const { auth, db } = await import("@/core/config/firebase");
      const { doc, deleteDoc } = await import("firebase/firestore");
      const user = auth.currentUser;
      if (user) {
        await deleteDoc(doc(db, `users/${user.uid}/addresses`, id));
      }
    } catch (error: any) {
      console.warn("Firestore address delete error:", error);
    }
    return ok({ id });
  },

  async setDefault(id: string): Promise<ApiResult<{ id: string }>> {
    return ok({ id });
  },

  async listDeliveryInstructionPresets(): Promise<ApiResult<string[]>> {
    return ok([
      "Ring the bell",
      "Call on arrival",
      "Leave at the door",
      "Avoid contact",
      "Meet at the gate",
    ]);
  },
};
