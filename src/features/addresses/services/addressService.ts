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

function validate(input: AddressInput): string | null {
  if (!input.line1?.trim()) return "Address line is required.";
  if (!input.city?.trim()) return "City is required.";
  if (!/^\d{6}$/.test(input.pincode ?? "")) return "Enter a valid 6-digit pincode.";
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
    if (patch.contactPhone && !/^\d{10}$/.test(patch.contactPhone)) {
      return fail("INVALID_PHONE", "Enter a valid 10-digit phone.");
    }
    if (patch.pincode && !/^\d{6}$/.test(patch.pincode)) {
      return fail("INVALID_PINCODE", "Enter a valid 6-digit pincode.");
    }

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
