/** Durable, account-scoped online draft intent. Free text is never persisted. */
import {
  currentScopedUid,
  onAuthUidChange,
  scopedStorageKey,
} from "@/features/auth/utils/scopedPersistence";
import type { OnlineDraftRequest } from "./onlineDraftService";

export const PENDING_ONLINE_DRAFT_BASE_KEY = "burg.pendingOnlineDraft.v1";

export interface ReplayableOnlineDraftRequest {
  orderId: string;
  attemptId: string;
  storeId: string;
  branchId?: string;
  orderType: OnlineDraftRequest["orderType"];
  items: OnlineDraftRequest["items"];
  deliveryQuoteId?: string;
  addressId?: string;
  couponCode?: string;
  tipAmount?: number;
  tableNumber?: string;
  whatsappOptIn?: boolean;
}
export interface PendingOnlineDraft {
  uid: string | null;
  attemptId: string;
  orderId: string;
  request: ReplayableOnlineDraftRequest;
  createdAtMs: number;
  updatedAtMs: number;
}

function storageKey(uid = currentScopedUid()) {
  return scopedStorageKey(PENDING_ONLINE_DRAFT_BASE_KEY, uid);
}
function readRaw(key = storageKey()) {
  return window.localStorage.getItem(key);
}
function writeRaw(value: string | null, key = storageKey()) {
  if (value === null) window.localStorage.removeItem(key);
  else window.localStorage.setItem(key, value);
}
function selectionId(value: unknown): string {
  if (typeof value !== "string" || !value) throw new Error("Selection ids must be strings");
  return value;
}
export function minimalOnlineDraftRequest(
  request: OnlineDraftRequest,
): ReplayableOnlineDraftRequest {
  return {
    orderId: request.orderId,
    attemptId: request.attemptId,
    storeId: request.storeId,
    ...(request.branchId ? { branchId: request.branchId } : {}),
    orderType: request.orderType,
    items: request.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      ...(item.customizations?.length
        ? {
            customizations: item.customizations.map((c: any) => ({
              id: selectionId(c.id ?? c.optionId),
            })),
          }
        : {}),
      ...(item.modifiers?.length
        ? { modifiers: item.modifiers.map((m: any) => ({ id: selectionId(m.id ?? m.optionId) })) }
        : {}),
    })),
    ...(request.deliveryQuoteId ? { deliveryQuoteId: request.deliveryQuoteId } : {}),
    ...(request.addressId ? { addressId: request.addressId } : {}),
    ...(request.couponCode ? { couponCode: request.couponCode } : {}),
    ...(typeof request.tipAmount === "number" ? { tipAmount: request.tipAmount } : {}),
    ...(request.tableNumber ? { tableNumber: request.tableNumber } : {}),
    ...(typeof request.whatsappOptIn === "boolean" ? { whatsappOptIn: request.whatsappOptIn } : {}),
  };
}
export function sameOnlineDraftContext(
  a: ReplayableOnlineDraftRequest,
  b: ReplayableOnlineDraftRequest,
): boolean {
  const { orderId: _aId, attemptId: _aAttempt, ...aContext } = a;
  const { orderId: _bId, attemptId: _bAttempt, ...bContext } = b;
  return JSON.stringify(aContext) === JSON.stringify(bContext);
}

export function readPendingOnlineDraft(): PendingOnlineDraft | null {
  const raw = readRaw();
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as PendingOnlineDraft;
    if (
      !record ||
      typeof record.orderId !== "string" ||
      !record.orderId ||
      typeof record.attemptId !== "string" ||
      !record.attemptId ||
      !record.request ||
      typeof record.request !== "object"
    ) {
      throw new Error("Unreadable online draft record");
    }
    return record;
  } catch {
    throw new Error("Cannot recover the previous online checkout");
  }
}
export async function claimPendingOnlineDraft(
  uid: string,
  attemptId: string,
  request: OnlineDraftRequest,
): Promise<PendingOnlineDraft> {
  return navigator.locks.request(storageKey(uid), () => {
    if (uid !== currentScopedUid()) throw new Error("Online checkout account changed");
    const prior = readPendingOnlineDraft();
    if (prior) return prior;
    const now = Date.now();
    const record: PendingOnlineDraft = {
      uid,
      attemptId,
      orderId: request.orderId,
      request: minimalOnlineDraftRequest(request),
      createdAtMs: now,
      updatedAtMs: now,
    };
    writeRaw(JSON.stringify(record));
    return record;
  });
}
export function ownsOnlineDraftAttempt(record: PendingOnlineDraft): boolean {
  return (
    !!record.uid &&
    currentScopedUid() === record.uid &&
    readPendingOnlineDraft()?.attemptId === record.attemptId
  );
}
export function clearPendingOnlineDraft(): void {
  writeRaw(null);
}
export function pendingOnlineDraftId(): string | null {
  return readPendingOnlineDraft()?.orderId ?? null;
}
let lastUid = currentScopedUid();
onAuthUidChange((nextUid) => {
  if (lastUid && nextUid !== lastUid) writeRaw(null, storageKey(lastUid));
  lastUid = nextUid ?? null;
});
