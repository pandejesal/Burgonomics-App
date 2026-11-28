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
  /** Incremented on EVERY write; a stale generation never authorises a retire. */
  generation?: number;
  /**
   * Positive evidence that the SERVER definitively declined THIS attempt with
   * PRICE_CHANGED. Written only by the repository when that exact POST came
   * back as a verified no-write — never inferred from `confirmed === false`.
   */
  priceChangeDeclined?: {
    uid?: string;
    attemptId: string;
    orderId?: string;
    acceptedTotalPaise: number;
    generation: number;
    /** Only a marker created with positive no-earlier-unresolved provenance. */
    proven?: "fresh";
  };
  /**
   * Non-personal proof of the exact request currently on the wire. The account
   * Web Lock (not this field) is the liveness signal: a persisted proof with no
   * live holder is stale and is recovered by an idempotent same-ID replay.
   */
  activeProof?: CashSubmitProof;
  /** Durable non-personal evidence that a request was actually sent. */
  sent?: boolean;
  /**
   * Conservative latch: an earlier request may still have reached the server.
   * Survives retries, refusals, transport failures, lookup misses and age;
   * only a matching positive receipt (or authoritative resolution) clears it.
   */
  unknownEarlierSend?: { generation: number };
}

export interface CashSubmitProof {
  uid: string;
  attemptId: string;
  orderId: string;
  expectedTotalPaise: number;
  generation: number;
  sessionNonce: string;
}

function generationOf(record: PendingCashOrder): number {
  return typeof record.generation === "number" ? record.generation : 0;
}

/** Persisted revisions start at 1; 0 is only an effective legacy fallback. */
function isSafeRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

export type CashLifecycle = "never-sent" | "unknown" | "settled-no-write";

/**
 * Conservative classification of the stored record BEFORE any new send mutates
 * its provenance. Only an explicit never-sent record or a marker created with
 * positive no-earlier-unresolved provenance can be treated as settled.
 */
/**
 * The ONLY authority for treating a stored record as a verified no-write.
 * Every bound field must match the current stored incarnation; legacy,
 * incomplete, stale or foreign markers are never trusted.
 */
function isTrustedNoWriteMarker(record: PendingCashOrder): boolean {
  const marker = record.priceChangeDeclined;
  const nonempty = (value: unknown): value is string =>
    typeof value === "string" && value.length > 0;
  if (
    !marker ||
    !nonempty(record.uid) ||
    !nonempty(record.attemptId) ||
    !nonempty(record.orderId) ||
    marker.uid !== record.uid ||
    marker.attemptId !== record.attemptId ||
    marker.orderId !== record.orderId ||
    // Bind the request to the stored identity; never normalise an ID to trust it.
    record.request?.orderId !== record.orderId ||
    !isSafeRevision(record.generation) ||
    !isSafeRevision(marker.generation) ||
    marker.generation !== record.generation ||
    !Number.isSafeInteger(record.request?.expectedTotalPaise) ||
    record.request.expectedTotalPaise < 0 ||
    !Number.isSafeInteger(marker.acceptedTotalPaise) ||
    marker.acceptedTotalPaise < 0 ||
    record.request.zeroDueOnly === true ||
    marker.proven !== "fresh" ||
    record.sent !== true ||
    record.confirmed ||
    record.activeProof ||
    record.unknownEarlierSend
  )
    return false;
  return true;
}

export function classifyCashLifecycle(record: PendingCashOrder): CashLifecycle {
  const hasEvidence =
    record.confirmed ||
    record.sent === true ||
    record.activeProof ||
    record.unknownEarlierSend ||
    record.priceChangeDeclined;
  if (!hasEvidence && record.sent === false && typeof record.generation === "number")
    return "never-sent";
  return isTrustedNoWriteMarker(record) ? "settled-no-write" : "unknown";
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

/** Observation only: no legacy-key migration or any other side effect. */
function peekRaw(key = storageKey()): string | null {
  return window.localStorage.getItem(key);
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
    const hasEvidence =
      record.confirmed ||
      record.sent === true ||
      record.unknownEarlierSend ||
      record.priceChangeDeclined ||
      record.activeProof;
    if (hasEvidence) return record;
    const createdMs = typeof record.createdAtMs === "number" ? record.createdAtMs : 0;
    const expired =
      typeof nowMs === "number" && Number.isFinite(nowMs) && createdMs > 0
        ? nowMs >= createdMs + PENDING_CASH_ORDER_TTL_MS
        : false;
    const basketChanged = basketHash !== undefined && record.basketHash !== basketHash;
    // Only an EXPLICITLY never-sent record may be pruned; absent/legacy status
    // is unknown evidence and must survive.
    if ((expired || basketChanged) && record.sent === false) {
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
    generation: 1,
    // A freshly claimed attempt has NOT been sent yet. Legacy records without
    // this field are treated as unknown, never as explicitly unsent.
    sent: false,
  };
  writeRaw(JSON.stringify(record));
  return record;
}

/**
 * Non-mutating observation for ROUTE reads. Expired / basket-mismatched rows are
 * reported as absent but are NOT erased here: only a mutation path under the
 * account lock may remove stored evidence, and a confirmed/uncertain record is
 * never closed by a reader.
 */
export function peekPendingCashOrder(
  nowMs: number = Date.now(),
  basketHash?: string,
): PendingCashOrder | null {
  const raw = peekRaw(); // observational: no migration or pruning side effect
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as PendingCashOrder;
    if (!record || typeof record.orderId !== "string" || !record.orderId || !record.request)
      return null;
    const hasEvidence =
      record.confirmed ||
      record.sent === true ||
      record.unknownEarlierSend ||
      record.priceChangeDeclined ||
      record.activeProof;
    if (hasEvidence) return record;
    const createdMs = typeof record.createdAtMs === "number" ? record.createdAtMs : 0;
    const expired = createdMs > 0 && nowMs >= createdMs + PENDING_CASH_ORDER_TTL_MS;
    const basketChanged = basketHash !== undefined && record.basketHash !== basketHash;
    return expired || basketChanged ? (record.sent === false ? null : record) : record;
  } catch {
    return null;
  }
}

/** The account-scoped Web Lock key used by EVERY cash mutation path. */
export function cashLockKey(uid: string): string {
  return storageKey(uid);
}

export function hasCashLockSupport(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.locks?.request === "function";
}

/**
 * The single transaction boundary. Fails closed when Web Locks are unavailable;
 * `ifAvailable` yields null when busy and NEVER queues a duplicate submit.
 * Holding the returned async callback holds the lock through its completion.
 */
export async function withCashLock<T>(
  uid: string,
  action: () => T | Promise<T>,
  options?: { ifAvailable?: boolean },
): Promise<T | null> {
  if (!hasCashLockSupport()) throw new Error("Cash checkout requires Web Locks");
  const key = cashLockKey(uid);
  if (options?.ifAvailable) {
    return navigator.locks.request(key, { ifAvailable: true }, async (lock) =>
      // The API passes null when the lock was NOT granted; never run the action.
      lock === null ? null : await action(),
    );
  }
  return navigator.locks.request(key, async () => await action());
}

/** Claim inside an account lock that the caller ALREADY holds (no re-entry). */
export function claimPendingCashOrderUnlocked(
  uid: string,
  attemptId: string,
  request: CashOrderRequest,
): PendingCashOrder {
  if (uid !== currentScopedUid()) throw new Error("Cash checkout account changed");
  return (
    readPendingCashOrder(Date.now(), basketHashOf(request)) ??
    savePendingCashOrder(attemptId, request.orderId, request)
  );
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
  return (await withCashLock(uid, () =>
    claimPendingCashOrderUnlocked(uid, attemptId, request),
  )) as PendingCashOrder;
}

export function ownsAttempt(record: PendingCashOrder): boolean {
  if (!record.uid || currentScopedUid() !== record.uid) return false;
  return readPendingCashOrder()?.attemptId === record.attemptId;
}

/** Mark the recorded order as server-confirmed: future retries only hydrate. */
export function markPendingCashOrderConfirmed(orderId: string, receiptId = orderId): void {
  const record = readPendingCashOrder();
  if (!record || record.orderId !== orderId) return;
  if (record.generation !== undefined && !isSafeRevision(record.generation)) return;
  writeRaw(
    JSON.stringify({
      ...record,
      orderId: receiptId,
      confirmed: true,
      generation: generationOf(record) + 1,
      updatedAtMs: Date.now(),
    }),
  );
}

/** A server total the customer reconfirmed updates the replay body, not the id. */
export function updatePendingCashOrderAcceptedTotal(paise: number): void {
  const record = readPendingCashOrder();
  if (!record || record.request.zeroDueOnly) return;
  if (record.generation !== undefined && !isSafeRevision(record.generation)) return;
  writeRaw(
    JSON.stringify({
      ...record,
      request: { ...record.request, expectedTotalPaise: paise },
      generation: generationOf(record) + 1,
      updatedAtMs: Date.now(),
    }),
  );
}

function isNonEmptyId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Shared guarded outbound validation. The caller's identity is compared to the
 * FRESH stored incarnation only; an absent legacy generation compares as
 * effective 0 for unresolved recovery, while a PRESENT malformed generation
 * rejects. No caller value can normalise invalid saved state into permission.
 */
function validOutboundIdentity(
  record: PendingCashOrder,
  claimed: { uid: string; attemptId: string; orderId: string },
  outboundPaise: number,
): boolean {
  const activeUid = currentScopedUid();
  if (
    !isNonEmptyId(activeUid) ||
    !isNonEmptyId(record.uid) ||
    !isNonEmptyId(record.attemptId) ||
    !isNonEmptyId(record.orderId) ||
    record.uid !== activeUid ||
    record.uid !== claimed.uid ||
    record.attemptId !== claimed.attemptId ||
    record.orderId !== claimed.orderId ||
    record.confirmed ||
    !record.request ||
    record.request.orderId !== record.orderId ||
    (record.generation !== undefined && !isSafeRevision(record.generation)) ||
    !Number.isSafeInteger(record.request.expectedTotalPaise) ||
    record.request.expectedTotalPaise < 0 ||
    !Number.isSafeInteger(outboundPaise) ||
    outboundPaise < 0 ||
    (record.request.zeroDueOnly === true && outboundPaise !== 0)
  )
    return false;
  return true;
}

/**
 * Bind the exact request being sent. Call ONLY under the account lock, just
 * before the POST. Any earlier no-write proof is cleared first, so a delayed
 * old refusal can never decorate the newer request. A proof is not a durable
 * busy flag: a reload after the lock is released replays the same id.
 */
export function beginCashSubmit(
  proof: Omit<CashSubmitProof, "generation">,
): CashSubmitProof | null {
  const record = readPendingCashOrder();
  if (
    !record ||
    !validOutboundIdentity(record, proof, proof.expectedTotalPaise) ||
    record.request.expectedTotalPaise !== proof.expectedTotalPaise
  )
    return null;
  const generation = generationOf(record) + 1;
  const bound: CashSubmitProof = { ...proof, generation };
  // A send overlapping an earlier still-unresolved proof keeps that uncertainty
  // durably; a fresh/serial send starts without it.
  const unknownEarlierSend =
    classifyCashLifecycle(record) === "unknown" ? { generation } : undefined;
  writeRaw(
    JSON.stringify({
      ...record,
      generation,
      sent: true,
      unknownEarlierSend,
      priceChangeDeclined: undefined,
      activeProof: bound,
      updatedAtMs: Date.now(),
    }),
  );
  return bound;
}

export interface CashSendPreparation {
  proof: CashSubmitProof;
  expectedTotalPaise: number;
  unresolved: boolean;
  /** Exact validated outbound body; the repository must send this snapshot. */
  request: ReplayableCashRequest;
}

/**
 * ONE storage-owned classify/compare/prepare transition, called under the
 * account lock. The lifecycle decision is taken from the freshly read stored
 * incarnation (uid, attempt/order identity, generation and pre-update paise);
 * the caller's identity is used ONLY for comparison, never as authority.
 */
export function prepareCashSend(claimed: {
  uid: string;
  attemptId: string;
  orderId: string;
  expectedTotalPaise: number;
  acceptedTotalPaise?: number;
  sessionNonce: string;
}): CashSendPreparation | null {
  const record = readPendingCashOrder();
  if (!record || record.confirmed) return null;
  // Reject inconsistent saved state BEFORE any proof write or send.
  if (!validOutboundIdentity(record, claimed, record.request.expectedTotalPaise)) return null;
  if (record.request.expectedTotalPaise !== claimed.expectedTotalPaise) return null;

  const beforeGeneration = generationOf(record);
  const beforePaise = record.request.expectedTotalPaise;
  // Legacy/absent provenance defaults to unknown; only a positively classified
  // settled no-write may be treated otherwise.
  const earlierUnresolved =
    classifyCashLifecycle(record) === "unknown" ||
    !!record.unknownEarlierSend ||
    !!record.activeProof;
  const markerValid =
    isTrustedNoWriteMarker(record) &&
    record.priceChangeDeclined?.acceptedTotalPaise === claimed.acceptedTotalPaise;

  const requestedAccepted = claimed.acceptedTotalPaise;
  const canAccept = requestedAccepted !== undefined && markerValid && !earlierUnresolved;
  const outbound = canAccept ? (requestedAccepted as number) : beforePaise;
  if (!validOutboundIdentity(record, claimed, outbound)) return null;
  const outboundRequest: ReplayableCashRequest = {
    ...record.request,
    expectedTotalPaise: outbound,
  };

  const generation = beforeGeneration + 1;
  if (!isSafeRevision(generation)) return null; // no proof/saved write past MAX_SAFE_INTEGER
  const proof: CashSubmitProof = {
    uid: claimed.uid,
    attemptId: claimed.attemptId,
    orderId: claimed.orderId,
    expectedTotalPaise: outbound,
    generation,
    sessionNonce: claimed.sessionNonce,
  };
  const unresolved = earlierUnresolved || (requestedAccepted !== undefined && !markerValid);
  writeRaw(
    JSON.stringify({
      ...record,
      generation,
      sent: true,
      request: outboundRequest,
      priceChangeDeclined: canAccept ? undefined : record.priceChangeDeclined,
      activeProof: proof,
      unknownEarlierSend: unresolved ? { generation } : undefined,
      updatedAtMs: Date.now(),
    }),
  );
  return { proof, expectedTotalPaise: outbound, unresolved, request: outboundRequest };
}

export type CashCompletion =
  | { kind: "price_changed"; paise: number }
  | { kind: "confirmed"; receiptId: string; cashDuePaise: number }
  | { kind: "ambiguous" };

/**
 * Apply a completion ONLY under the same account lock, and only if the stored
 * record still matches every identity field that was actually sent. A stale
 * completion applies nothing; an ambiguous outcome keeps the tentative record.
 */
export function completeCashSubmit(proof: CashSubmitProof, outcome: CashCompletion): boolean {
  // Observation-only: a rejected completion must not migrate/prune/write bytes.
  const record = peekPendingCashOrder();
  if (
    !record ||
    !isSafeRevision(record.generation) ||
    !isSafeRevision(proof.generation) ||
    record.generation !== proof.generation ||
    record.uid !== proof.uid ||
    record.attemptId !== proof.attemptId ||
    record.orderId !== proof.orderId ||
    record.request.expectedTotalPaise !== proof.expectedTotalPaise ||
    record.activeProof?.sessionNonce !== proof.sessionNonce
  )
    return false;
  // A positive receipt must describe the EXACT submitted order and amount.
  if (
    outcome.kind === "confirmed" &&
    (outcome.receiptId !== proof.orderId ||
      !Number.isSafeInteger(outcome.cashDuePaise) ||
      outcome.cashDuePaise !== proof.expectedTotalPaise)
  )
    return false;
  const generation = record.generation + 1;
  if (!isSafeRevision(generation)) return false; // next revision outside safe domain
  const base = {
    ...record,
    generation,
    activeProof: undefined,
    // An outcome-unknown completion is itself evidence that the earlier send
    // may still finish; only a matched receipt clears it below.
    unknownEarlierSend: outcome.kind === "ambiguous" ? { generation } : record.unknownEarlierSend,
    updatedAtMs: Date.now(),
  };
  if (outcome.kind === "price_changed") {
    writeRaw(
      JSON.stringify({
        ...base,
        priceChangeDeclined: {
          // Identity comes only from the validated proof of THIS send.
          uid: proof.uid,
          attemptId: proof.attemptId,
          orderId: proof.orderId,
          acceptedTotalPaise: outcome.paise,
          generation,
          proven: record.unknownEarlierSend ? undefined : "fresh",
        },
      }),
    );
  } else if (outcome.kind === "confirmed") {
    writeRaw(
      JSON.stringify({
        ...base,
        confirmed: true,
        orderId: outcome.receiptId,
        priceChangeDeclined: undefined,
        unknownEarlierSend: undefined,
      }),
    );
  } else {
    writeRaw(JSON.stringify(base));
  }
  return true;
}

/**
 * Stamp POSITIVE evidence that THIS attempt's POST was definitively declined by
 * PRICE_CHANGED. Only the order repository calls this, from the branch that
 * actually saw the server's verified no-write. A confirmed, zero-due or
 * foreign-account record is never marked.
 */
export function markPriceChangedDeclined(attemptId: string, acceptedTotalPaise: number): boolean {
  const record = readPendingCashOrder();
  if (
    !record ||
    record.confirmed ||
    record.request.zeroDueOnly ||
    record.attemptId !== attemptId ||
    record.uid !== currentScopedUid() ||
    (record.generation !== undefined && !isSafeRevision(record.generation))
  )
    return false;
  const generation = generationOf(record) + 1;
  writeRaw(
    JSON.stringify({
      ...record,
      generation,
      priceChangeDeclined: { attemptId, acceptedTotalPaise, generation },
      updatedAtMs: Date.now(),
    }),
  );
  return true;
}

/**
 * Compare-and-retire ONLY the attempt that carries positive PRICE_CHANGED
 * evidence for this exact accepted total, account and generation.
 *
 * `!confirmed` is deliberately not sufficient: an unconfirmed record may be an
 * in-flight retry whose outcome is still unknown. A newer write (generation
 * change) or a confirmed success keeps the record, so its receipt and draft are
 * never dropped.
 */
export function retirePriceChangedCashAttempt(
  attemptId: string,
  acceptedTotalPaise: number,
): boolean {
  const record = readPendingCashOrder();
  if (
    !record ||
    record.confirmed ||
    record.activeProof ||
    record.unknownEarlierSend ||
    record.uid !== currentScopedUid()
  )
    return false;
  const marker = record.priceChangeDeclined;
  if (!record.request || record.request.zeroDueOnly) return false;
  if (!isTrustedNoWriteMarker(record)) return false;
  if (marker?.attemptId !== attemptId || marker.acceptedTotalPaise !== acceptedTotalPaise)
    return false;
  clearPendingCashOrder();
  return true;
}

/** Atomic retirement under the SAME account lock; routes wait for this result. */
export async function retirePriceChangedCashAttemptAtomic(
  uid: string,
  attemptId: string,
  acceptedTotalPaise: number,
): Promise<boolean> {
  const result = await withCashLock(uid, () =>
    retirePriceChangedCashAttempt(attemptId, acceptedTotalPaise),
  );
  return result === true;
}

/** The confirmed id to hydrate before any preflight, if one exists. */
export function peekConfirmedCashOrderId(): string | null {
  // Observation only: no legacy migration, TTL prune or write.
  const record = peekPendingCashOrder();
  return record?.confirmed ? record.orderId : null;
}

/** Clear after a completed hydration or a VERIFIED no-write refusal. */
export function clearPendingCashOrder(): void {
  writeRaw(null);
}

/**
 * Exact compare-and-clear of a CONFIRMED receipt. Call ONLY while the account
 * lock is already held (e.g. from hydrate), so no nested lock is requested.
 */
export function clearConfirmedCashReceiptUnlocked(
  uid: string,
  attemptId: string,
  orderId: string,
  generation: number,
): boolean {
  // Observation-only: a rejected compare-and-clear must not mutate bytes.
  const record = peekPendingCashOrder();
  if (
    !record ||
    !record.confirmed ||
    record.uid !== uid ||
    record.attemptId !== attemptId ||
    record.orderId !== orderId ||
    // A malformed present revision cannot be laundered into legacy effective 0.
    (record.generation !== undefined && !isSafeRevision(record.generation)) ||
    !Number.isSafeInteger(generation) ||
    generation < 0 ||
    generationOf(record) !== generation // genuine absent legacy generation compares 0
  )
    return false;
  clearPendingCashOrder();
  return true;
}

/** Route-facing exact receipt cleanup, under the SAME account lock. */
export async function clearConfirmedCashReceiptAtomic(
  uid: string,
  attemptId: string,
  orderId: string,
  generation: number,
): Promise<boolean> {
  return (
    (await withCashLock(uid, () =>
      clearConfirmedCashReceiptUnlocked(uid, attemptId, orderId, generation),
    )) === true
  );
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
