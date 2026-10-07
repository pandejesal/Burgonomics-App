/**
 * AddressService — CRUD implementation. The public shape mirrors the
 * future backend contract:
 *   GET    /v1/addresses           → list
 *   POST   /v1/addresses           → create
 *   PATCH  /v1/addresses/:id       → update
 *   DELETE /v1/addresses/:id       → remove
 *   POST   /v1/addresses/:id/default → setDefault
 *
 * State is held inside the addressStore; this file only encapsulates
 * validation so the swap to HTTP is a body-only change per method.
 */
import { fail, ok, type ApiResult } from "@/core/network/http";
import type { Address, AddressInput } from "@/features/addresses/models";
import { INDIAN_MOBILE_RE, sanitizePhone } from "@/features/auth/utils/validators";

/**
 * Shared create-path validation. Phone uses the same strict Indian
 * mobile rule as auth (first digit 6–9) so "0000000000", "1234567890"
 * and 5-series numbers fail closed here too.
 */
function validate(input: AddressInput): string | null {
  if (!input.line1?.trim()) return "Address line is required.";
  if (!input.city?.trim()) return "City is required.";
  if (!/^\d{6}$/.test(input.pincode ?? "")) return "Enter a valid 6-digit pincode.";
  if (input.contactPhone && !INDIAN_MOBILE_RE.test(sanitizePhone(input.contactPhone))) {
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
  if (patch.contactPhone && !INDIAN_MOBILE_RE.test(sanitizePhone(patch.contactPhone))) {
    return "Enter a valid 10-digit Indian mobile number.";
  }
  return null;
}

let counter = 0;
const nextId = () => `addr_${Date.now().toString(36)}_${(++counter).toString(36)}`;

/**
 * Firestore rejects `undefined` field values (invalid-argument). Optional
 * address keys (customLabel/line2/landmark/lat/lng) are omitted rather than
 * passed as undefined so create/update write instead of throwing.
 */
function clean<T extends object>(o: T): T {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined),
  ) as T;
}

export const addressService = {
  async list(): Promise<ApiResult<Address[]>> {
    try {
      const { auth, db } = await import("@/core/config/firebase");
      const { collection, getDocs } = await import("firebase/firestore");
      const user = auth.currentUser;
      if (!user) return fail("AUTH_REQUIRED", "Please sign in to view your saved addresses.");

      const snap = await getDocs(collection(db, `users/${user.uid}/addresses`));
      const addresses: Address[] = [];
      snap.forEach((doc) => {
        addresses.push(doc.data() as Address);
      });
      return ok(addresses);
    } catch (error: any) {
      console.warn("Firestore address list error:", error);
      return fail("WRITE_FAILED", "We couldn't load your addresses. Please try again.");
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
      if (!user) return fail("AUTH_REQUIRED", "Please sign in to save your address.");
      await setDoc(doc(db, `users/${user.uid}/addresses`, created.id), clean(created));
    } catch (error: any) {
      console.warn("Firestore address create error:", error);
      return fail("WRITE_FAILED", "We couldn't save your address. Please try again.");
    }

    return ok(created);
  },

  async update(id: string, patch: Partial<AddressInput>): Promise<ApiResult<Partial<Address>>> {
    const err = validatePatch(patch);
    if (err) return fail("INVALID_ADDRESS", err);

    try {
      const { auth, db } = await import("@/core/config/firebase");
      const { doc, updateDoc, deleteField } = await import("firebase/firestore");
      const user = auth.currentUser;
      if (!user) return fail("AUTH_REQUIRED", "Please sign in to update your address.");
      // Optional keys cleared in the form arrive as `undefined`; map them to
      // deleteField() so Firestore drops the stale value instead of keeping it.
      const deletion = deleteField();
      const payload: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(patch)) {
        payload[key] = value === undefined ? deletion : value;
      }
      await updateDoc(doc(db, `users/${user.uid}/addresses`, id), payload);
    } catch (error: any) {
      console.warn("Firestore address update error:", error);
      return fail("WRITE_FAILED", "We couldn't update your address. Please try again.");
    }

    return ok({ id, ...patch });
  },

  async remove(id: string): Promise<ApiResult<{ id: string }>> {
    try {
      const { auth, db } = await import("@/core/config/firebase");
      const { doc, deleteDoc } = await import("firebase/firestore");
      const user = auth.currentUser;
      if (!user) return fail("AUTH_REQUIRED", "Please sign in to remove your address.");
      await deleteDoc(doc(db, `users/${user.uid}/addresses`, id));
    } catch (error: any) {
      console.warn("Firestore address delete error:", error);
      return fail("WRITE_FAILED", "We couldn't remove your address. Please try again.");
    }
    return ok({ id });
  },

  async setDefault(id: string): Promise<ApiResult<{ id: string }>> {
    try {
      const { auth, db } = await import("@/core/config/firebase");
      const { collection, doc, getDocs, writeBatch } = await import("firebase/firestore");
      const user = auth.currentUser;
      if (!user) return fail("AUTH_REQUIRED", "Please sign in to manage your addresses.");
      const colRef = collection(db, `users/${user.uid}/addresses`);
      const snap = await getDocs(colRef);
      let found = false;
      const batch = writeBatch(db);
      snap.forEach((d) => {
        if (d.id === id) found = true;
        batch.update(doc(db, `users/${user.uid}/addresses`, d.id), {
          isDefault: d.id === id,
        });
      });
      if (!found) return fail("WRITE_FAILED", "We couldn't find that address. Please try again.");
      await batch.commit();
      return ok({ id });
    } catch (error: any) {
      console.warn("Firestore address setDefault error:", error);
      return fail("WRITE_FAILED", "We couldn't update your default address. Please try again.");
    }
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
