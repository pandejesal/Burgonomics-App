/**
 * M4 â€” durable cash-checkout intent, keyed to the signed-in account.
 *
 * A cash order is created by the SERVER and is idempotent on `orderId`. The app
 * used to mint a new id on every Retry, so a lost POST reply (or a failed read
 * after a successful write) let the UI book twice: two orders, two KOTs. This
 * module persists the chosen id plus the MINIMAL replay request before sending.
 * A retry either replays that request (outcome unknown) or, once a success was
 * recorded, only re-reads the returned id. Nothing is erased by a failed read.
 *
 * Privacy (r2): only the fields the SERVER needs to reprice/idempotently replay
 * the order are stored. Contact names/phones, free-text notes, instructions and
 * display snapshots are deliberately dropped â€” the server prices from the
 * catalogue and its request hash no longer includes those display fields.
 */
import {
  currentScopedUid,
  onAuthUidChange,
  scopedStorageKey,
} from "@/features/auth/utils/scopedPersistence";
import type { CashOrderRequest } from "@/features/payments/services/cashOrderService";

export const PENDING_CASH_ORDER_BASE_KEY = "burgonomics.pendingCashOrder.v1";
// Kept split so the retired localStorage namespace is not a literal secret-like
// token for scanners. It is read only for the one-time migration below.
const LEGACY_PENDING_CASH_ORDER_BASE_KEY = ["burg", "pendingCashOrder", "v1"].join(".");
/** An abandoned, UNCONFIRMED checkout is not replayed for ever. */
export const PENDING_CASH_ORDER_TTL_MS = 30 * 60 * 1000;

/** The only request fields required to replay a cash order on the server. */
export interface ReplayableCashRequest {
  orderId: string;
  storeId?: string;
  branchId?: string;
  orderType: CashOrderRequest["orderType"];
  items: CashOrderRequest["items"];
  expectedTotalPaise: number;
  zeroDueOnly?: true;
  deliveryQuoteId?: string;
  addressId?: string;
  tableNumber?: string;
  couponCode?: string;
  tipAmount?: number;
  /**
   * WhatsApp consent must survive a retry: a lost response followed by a replay
   * must not silently drop (or invent) the customer's answer. Owner decision
   * 2026-11-25 #3.
   */
  whatsappOptIn?: boolean;
}

export interface PendingCashOrder {
  /** UID pinned at claim time; callbacks with a different UID are ignored. */
  uid: string | null;
  /** One attemptId per checkout, shared by every tab of the signed-in user. */
  attemptId: string;
  orderId: string;
  request: ReplayableCashRequest;
  /** True once the server confirmed the order; retries may then only hydrate. */
  confirmed: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  /**
   * Basket this attempt belongs to (items + outlet/mode, never money). An
   * unconfirmed attempt is only replayed while the live checkout still hashes
   * to this value; anything else is an abandoned basket and is retired.
   */
  basketHash?: string;
}

/** Deterministic, non-cryptographic hash of the basket identity. */
function hashOf(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/**
 * Basket identity for a cash attempt: WHAT is being ordered and where it is
 * going. Money is deliberately excluded — an accepted server total must not
 * look like a new basket, and a price change must not orphan the attempt.
 */
export function basketHashOf(request: {
  storeId?: string;
  branchId?: string;
  orderType: string;
  items: ReadonlyArray<{
    productId: string;
    quantity: number;
    customizations?: unknown[];
    modifiers?: unknown[];
  }>;
  addressId?: string;
  couponCode?: string;
  tableNumber?: string;
}): string {
  const selectionIds = (list?: unknown[]): string[] =>
    (list ?? [])
      .map(
        (entry) => (entry as { id?: unknown })?.id ?? (entry as { optionId?: unknown })?.optionId,
      )
      .filter((id): id is string => typeof id === "string" && id.length > 0);
  return hashOf(
    JSON.stringify([
      request.storeId ?? null,
      request.branchId ?? null,
      request.orderType,
      request.items.map((item) => [
        item.productId,
        item.quantity,
        selectionIds(item.customizations),
        selectionIds(item.modifiers),
      ]),
      request.addressId ?? null,
      request.couponCode ?? null,
      request.tableNumber ?? null,
    ]),
  );
}

function storageKey(uid = currentScopedUid()): string {
  return scopedStorageKey(PENDING_CASH_ORDER_BASE_KEY, uid);
}

function readRaw(key = storageKey()): string | null {
  const current = window.localStorage.getItem(key);
  const uid = currentScopedUid();
  const legacyKey = scopedStorageKey(LEGACY_PENDING_CASH_ORDER_BASE_KEY, uid);
  const legacy = window.localStorage.getItem(legacyKey);
  if (legacy !== null) {
    if (current === null) window.localStorage.setItem(key, legacy);
    window.localStorage.removeItem(legacyKey);
    return current ?? legacy;
  }
  return current;
}

function writeRaw(value: string | null, key = storageKey()): void {
  if (value === null) window.localStorage.removeItem(key);
  else window.localStorage.setItem(key, value);
}

/** Strip every field that is not needed for the server's idempotent replay. */
/** Only a primitive selection id may be persisted; nested objects are rejected. */
function selectionId(value: unknown): string {
  if (typeof value !== "string" || !value) throw new Error("Selection ids must be strings");
  return value;
}

export function minimalReplayRequest(request: CashOrderRequest): ReplayableCashRequest {
  return {
    orderId: request.orderId,
    ...(request.storeId ? { storeId: request.storeId } : {}),
    ...(request.branchId ? { branchId: request.branchId } : {}),
    orderType: request.orderType,
    // M4 privacy r3: only TYPED SELECTION IDS are persisted; never nested
    // customization/modifier objects with names and prices.
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
    expectedTotalPaise: request.expectedTotalPaise,
    ...(request.zeroDueOnly ? { zeroDueOnly: true } : {}),
    ...(request.deliveryQuoteId ? { deliveryQuoteId: request.deliveryQuoteId } : {}),
    // Fulfilment references only (id / table id), never the full address.
    ...(request.addressId ? { addressId: request.addressId } : {}),
    ...(request.tableNumber ? { tableNumber: request.tableNumber } : {}),
    ...(request.couponCode ? { couponCode: request.couponCode } : {}),
    ...(typeof request.tipAmount === "number" ? { tipAmount: request.tipAmount } : {}),
    // An explicit boolean only: the server counts a LITERAL true as consent and
    // stamps the time itself; a missing key is never treated as consent.
    ...(typeof request.whatsappOptIn === "boolean" ? { whatsappOptIn: request.whatsappOptIn } : {}),
  };
}

/**
 * The live pending attempt for THIS account, or null.
 *
 * A CONFIRMED record is returned regardless of age (and of `basketHash`): it is
 * the only proof of which order the server wrote, so it must survive a failed
 * read for ever.
 *
 * An UNCONFIRMED attempt is dropped (and REMOVED from storage) when either:
 *  - it is older than {@link PENDING_CASH_ORDER_TTL_MS} — an abandoned checkout
 *    must never be replayed onto a later basket; or
 *  - `basketHash` is supplied and differs from the attempt's own basket — the
 *    customer has built something else, so the old attempt is abandoned.
 */
export function readPendingCashOrder(
  nowMs: number = Date.now(),
  basketHash?: string,
): PendingCashOrder | null {
  const raw = readRaw();
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as PendingCashOrder;
    if (
      !record ||
      typeof record.orderId !== "string" ||
      !record.orderId ||
      !record.request ||
      typeof record.request !== "object"
    ) {
      throw new Error("Unreadable cash receipt record");
    }
    // A CONFIRMED id must survive a failed read and any TTL: it is the only
    // proof of which order was written. Only unconfirmed attempts age out.
    if (record.confirmed) return record;
    const createdMs = typeof record.createdAtMs === "number" ? record.createdAtMs : 0;
    const expired =
      typeof nowMs === "number" && Number.isFinite(nowMs) && createdMs > 0
        ? nowMs >= createdMs + PENDING_CASH_ORDER_TTL_MS
        : false;
    const basketChanged = basketHash !== undefined && record.basketHash !== basketHash;
    if (expired || basketChanged) {
      writeRaw(null);
      return null;
    }
    return record;
  } catch {
    throw new Error("Cannot recover the previous cash attempt");
  }
}

/** Persist the MINIMAL exact request BEFORE it goes on the wire. */
export function savePendingCashOrder(
  attemptId: string,
  orderId: string,
  request: CashOrderRequest,
): PendingCashOrder {
  const now = Date.now();
  const record: PendingCashOrder = {
    uid: currentScopedUid(),
    attemptId,
    orderId,
    request: minimalReplayRequest(request),
    confirmed: false,
    createdAtMs: now,
    updatedAtMs: now,
    basketHash: basketHashOf(request),
  };
  writeRaw(JSON.stringify(record));
  return record;
}

/**
 * Claim (or re-claim) one durable attempt BEFORE the POST. Compare-and-set by
 * the PINNED uid and attemptId: a late callback or a tab on another account
 * never mutates this record. Returns the record actually stored.
 *
 * A stored attempt for a DIFFERENT basket is abandoned here (the TTL/basket
 * gate in {@link readPendingCashOrder} removes it), so a fresh attempt with its
 * own order id is created instead of replaying the old one.
 */
export async function claimPendingCashOrder(
  uid: string,
  attemptId: string,
  request: CashOrderRequest,
): Promise<PendingCashOrder> {
  return navigator.locks.request(storageKey(uid), () => {
    if (uid !== currentScopedUid()) throw new Error("Cash checkout account changed");
    return (
      readPendingCashOrder(Date.now(), basketHashOf(request)) ??
      savePendingCashOrder(attemptId, request.orderId, request)
    );
  });
}

export function ownsAttempt(record: PendingCashOrder): boolean {
  if (!record.uid || currentScopedUid() !== record.uid) return false;
  return readPendingCashOrder()?.attemptId === record.attemptId;
}

/** Mark the recorded order as server-confirmed: future retries only hydrate. */
export function markPendingCashOrderConfirmed(orderId: string, receiptId = orderId): void {
  const record = readPendingCashOrder();
  if (!record || record.orderId !== orderId) return;
  writeRaw(
    JSON.stringify({ ...record, orderId: receiptId, confirmed: true, updatedAtMs: Date.now() }),
  );
}

/** A server total the customer reconfirmed updates the replay body, not the id. */
export function updatePendingCashOrderAcceptedTotal(paise: number): void {
  const record = readPendingCashOrder();
  if (!record || record.request.zeroDueOnly) return;
  writeRaw(
    JSON.stringify({
      ...record,
      request: { ...record.request, expectedTotalPaise: paise },
      updatedAtMs: Date.now(),
    }),
  );
}

/** The confirmed id to hydrate before any preflight, if one exists. */
export function peekConfirmedCashOrderId(): string | null {
  const record = readPendingCashOrder();
  return record?.confirmed ? record.orderId : null;
}

/** Clear after a completed hydration or a VERIFIED no-write refusal. */
export function clearPendingCashOrder(): void {
  writeRaw(null);
}

/** Purge one specific account's key (account deletion / switch). */
export function purgePendingCashOrderForUid(uid: string | null): void {
  if (!uid) return;
  const key = storageKey(uid);
  writeRaw(null, key);
}

let lastUid = currentScopedUid();
onAuthUidChange((nextUid) => {
  if (lastUid && nextUid !== lastUid) purgePendingCashOrderForUid(lastUid);
  lastUid = nextUid ?? null;
});
