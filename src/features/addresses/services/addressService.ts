/**
 * AddressService — CRUD implementation. The public shape mirrors the
 * future backend contract:
 *   GET    /v1/addresses           → list
 *   POST   /v1/addresses           → create
 *   PATCH  /v1/addresses/:id       → update
 *   DELETE /v1/addresses/:id       → remove
 *   POST   /v1/addresses/:id/default → setDefault
 *
 * Persistence contract (repair R02, audit 02 F9/F11):
 *  - Every mutation returns an explicit typed failure instead of a false
 *    success: `AUTH_REQUIRED` when there is no signed-in user (the old code
 *    silently skipped the remote half and still returned `ok`), and
 *    `WRITE_FAILED` / `NOT_FOUND` when Firestore rejects the write (the old
 *    code caught, warned, and returned `ok`). `AddressRepository` mirrors a
 *    result into the local store only when `success === true`, so a failed
 *    or skipped remote save can no longer commit local state.
 *  - `setDefault` on an id that does not exist server-side fails with
 *    `NOT_FOUND` BEFORE the batch commits, so existing server defaults are
 *    never cleared by a no-op request (F11).
 *  - Raw exception text is logged for telemetry only; customers see the
 *    curated message (P1-8 `core/errors/userMessages`).
 *  - Reads: `list()` is the remote read path and is not wired to the UI yet.
 *    `AddressRepository.list()` still serves the locally hydrated store —
 *    see the repository header for that documented hydration gap (F3).
 *
 * State is held inside the addressStore; this file only encapsulates
 * validation so the swap to HTTP is a body-only change per method.
 */
import { fail, ok, type ApiFailure, type ApiResult } from "@/core/network/http";
import type { Address, AddressInput } from "@/features/addresses/models";
import { INDIAN_MOBILE_RE, sanitizePhone } from "@/features/auth/utils/validators";

/** Failure codes this service emits (`ApiFailure.error.code`). */
export type AddressServiceErrorCode =
  "AUTH_REQUIRED" | "INVALID_ADDRESS" | "NOT_FOUND" | "WRITE_FAILED";

/** Signed-out mutation copy — mutations are account-scoped writes. */
const SIGN_IN_MSG = "Please sign in to manage your saved addresses.";
/** Target id absent from the server collection (F11). */
const NOT_FOUND_MSG = "That address is no longer in your saved addresses.";

/** Typed wrapper so no call site can emit an unlisted code. */
function failWith(code: AddressServiceErrorCode, message: string, retryable = false): ApiFailure {
  return fail(code, message, retryable);
}

/**
 * Map a caught Firestore error to a typed failure.
 * `not-found` means the document does not exist server-side (a retry cannot
 * help) → `NOT_FOUND`; anything else (offline, rules rejection, quota) is a
 * write failure → `WRITE_FAILED`, retryable. The raw error never leaves
 * this function.
 */
function writeFailure(error: unknown, op: string, message: string): ApiFailure {
  console.warn(`Firestore address ${op} error:`, error);
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "not-found" || code === "NOT_FOUND") {
    return failWith("NOT_FOUND", NOT_FOUND_MSG);
  }
  return failWith("WRITE_FAILED", message, true);
}

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
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

export const addressService = {
  async list(): Promise<ApiResult<Address[]>> {
    try {
      const { auth, db } = await import("@/core/config/firebase");
      const { collection, getDocs } = await import("firebase/firestore");
      const user = auth.currentUser;
      if (!user) return failWith("AUTH_REQUIRED", "Please sign in to view your saved addresses.");

      const snap = await getDocs(collection(db, `users/${user.uid}/addresses`));
      const addresses: Address[] = [];
      snap.forEach((doc) => {
        addresses.push(doc.data() as Address);
      });
      return ok(addresses);
    } catch (error) {
      return writeFailure(error, "list", "We couldn't load your addresses. Please try again.");
    }
  },

  async create(input: AddressInput): Promise<ApiResult<Address>> {
    const err = validate(input);
    if (err) return failWith("INVALID_ADDRESS", err);

    try {
      const { auth, db } = await import("@/core/config/firebase");
      const { doc, setDoc } = await import("firebase/firestore");
      const user = auth.currentUser;
      // Fail closed when signed out: a skipped remote write that still
      // reports success makes the repository commit a local-only row the
      // server never sees (and that is dropped at sign-in anyway).
      if (!user) return failWith("AUTH_REQUIRED", SIGN_IN_MSG);

      const created: Address = {
        id: nextId(),
        isDefault: input.isDefault ?? false,
        ...input,
      };
      await setDoc(doc(db, `users/${user.uid}/addresses`, created.id), clean(created));
      return ok(created);
    } catch (error) {
      return writeFailure(error, "create", "We couldn't save your address. Please try again.");
    }
  },

  async update(id: string, patch: Partial<AddressInput>): Promise<ApiResult<Partial<Address>>> {
    const err = validatePatch(patch);
    if (err) return failWith("INVALID_ADDRESS", err);

    try {
      const { auth, db } = await import("@/core/config/firebase");
      const { doc, updateDoc, deleteField } = await import("firebase/firestore");
      const user = auth.currentUser;
      if (!user) return failWith("AUTH_REQUIRED", SIGN_IN_MSG);

      const deletion = deleteField();
      const payload: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(patch)) {
        payload[key] = value === undefined ? deletion : value;
      }
      await updateDoc(doc(db, `users/${user.uid}/addresses`, id), payload);
      return ok({ id, ...patch });
    } catch (error) {
      return writeFailure(error, "update", "We couldn't update your address. Please try again.");
    }
  },

  async remove(id: string): Promise<ApiResult<{ id: string }>> {
    try {
      const { auth, db } = await import("@/core/config/firebase");
      const { doc, deleteDoc } = await import("firebase/firestore");
      const user = auth.currentUser;
      if (!user) return failWith("AUTH_REQUIRED", SIGN_IN_MSG);

      await deleteDoc(doc(db, `users/${user.uid}/addresses`, id));
      return ok({ id });
    } catch (error) {
      return writeFailure(error, "delete", "We couldn't delete your address. Please try again.");
    }
  },

  async setDefault(id: string): Promise<ApiResult<{ id: string }>> {
    try {
      const { auth, db } = await import("@/core/config/firebase");
      const { collection, doc, getDocs, writeBatch } = await import("firebase/firestore");
      const user = auth.currentUser;
      if (!user) return failWith("AUTH_REQUIRED", SIGN_IN_MSG);

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
      // F11: the requested id is missing server-side (created while signed
      // out, or already deleted). Committing the batch anyway would clear
      // every existing default while the new one is never written, so fail
      // here and leave the server defaults untouched.
      if (!found) return failWith("NOT_FOUND", NOT_FOUND_MSG);

      await batch.commit();
      return ok({ id });
    } catch (error) {
      return writeFailure(
        error,
        "setDefault",
        "We couldn't update your default address. Please try again.",
      );
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
