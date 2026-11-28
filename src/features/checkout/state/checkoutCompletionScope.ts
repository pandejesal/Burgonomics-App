import * as authStoreModule from "@/features/auth/state/authStore";
import { useAuthStore } from "@/features/auth/state/authStore";
import { useCartStore } from "@/features/cart/state/cartStore";
import { useCheckoutStore } from "@/features/checkout/state/checkoutStore";
import { useStoreSelection } from "@/features/stores/state/storeStore";

/**
 * In-memory identity of the checkout that was submitted. Only hashes of
 * existing state are kept: no free text, token or personal data is stored or
 * logged. The auth epoch fences a session that ends (logout / re-login as the
 * same uid) while a request is in flight. The accessor is always present in
 * production; a hermetic harness that stubs the auth store without it omits
 * the fence on BOTH sides, so an epoch-less scope can never outlive a live
 * session change.
 */
export interface CompletionScope {
  uid: string | null;
  identityEpoch?: number;
  cart: string;
  draft: string;
  selection: string;
}

function hash(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function readIdentityEpoch(): number | undefined {
  // Absent only in harnesses that replace the auth store wholesale; Vitest's
  // mock namespace throws on an undefined export, so probe defensively.
  // Capture and validation read the same source, so this cannot mask a change.
  try {
    const accessor = (authStoreModule as unknown as { currentIdentityEpoch?: () => number })
      .currentIdentityEpoch;
    return typeof accessor === "function" ? accessor() : undefined;
  } catch {
    return undefined;
  }
}

/** Stable customization ids only; display text never leaves this hash input. */
function customizationFingerprint(value: unknown, index: number): string {
  if (!value || typeof value !== "object") return String(index);
  const record = value as Record<string, unknown>;
  const ids = [
    "customizationId",
    "customization_id",
    "id",
    "groupId",
    "group_id",
    "optionId",
    "option_id",
  ]
    .map((key) => {
      const raw = record[key];
      return typeof raw === "string" || typeof raw === "number" ? String(raw) : "";
    })
    .filter(Boolean);
  return ids.length ? ids.join(":") : `${index}:${hash(JSON.stringify(record))}`;
}

export function captureCompletionScope(): CompletionScope {
  const cart = useCartStore.getState();
  const checkout = useCheckoutStore.getState();
  const selection = useStoreSelection.getState();
  return {
    uid: useAuthStore.getState().user?.id ?? null,
    identityEpoch: readIdentityEpoch(),
    cart: hash(
      JSON.stringify([
        cart.storeId,
        cart.lines.map((line) => [
          // lineId and the chosen customizations are sent to the server; a
          // swap or edit of either must invalidate the older completion.
          line.lineId,
          line.productId,
          line.quantity,
          line.notes ?? "",
          (line.customizations ?? []).map(customizationFingerprint),
          (line.modifiers ?? []).map((modifier) => `${modifier.groupId}:${modifier.optionId}`),
        ]),
        cart.promo?.code ?? null,
      ]),
    ),
    draft: hash(
      JSON.stringify([
        checkout.notesRevision,
        checkout.orderNotes,
        checkout.deliveryInstructions,
        checkout.pickupInstructions,
        checkout.diningNotes,
        checkout.tableNumber,
        checkout.tipAmount,
        checkout.whatsappOptIn,
      ]),
    ),
    selection: hash(
      JSON.stringify([selection.activeStore?.id ?? null, selection.fulfillment ?? null]),
    ),
  };
}

export function isCompletionScopeValid(scope: CompletionScope): boolean {
  // Fail closed: where the identity fence exists, an epoch-less fallback can
  // never authorise cleanup or navigation after a session change.
  if (readIdentityEpoch() !== undefined && typeof scope.identityEpoch !== "number") {
    return false;
  }
  const live = captureCompletionScope();
  return (
    live.uid === scope.uid &&
    live.identityEpoch === scope.identityEpoch &&
    live.cart === scope.cart &&
    live.draft === scope.draft &&
    live.selection === scope.selection
  );
}

/** Actual submission scope, held only in memory and set by the repository. */
let submittedScope: CompletionScope | null = null;
/** Called ONLY after the account lock has been granted. */
export function setCashSubmissionScope(scope: CompletionScope | null): void {
  submittedScope = scope;
}
export function cashSubmissionScope(): CompletionScope | null {
  return submittedScope;
}
