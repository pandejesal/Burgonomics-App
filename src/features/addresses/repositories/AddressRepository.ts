/**
 * AddressRepository â€” the single entry point UI components use for
 * address reads/mutations. Delegates persistence to `addressService` and
 * mirrors the result into `useAddressStore`.
 *
 * Failure contract (repair R02, audit 02 F9/F11 + R19 F-R19-1): a mutation
 * is mirrored into the local store ONLY when `res.success === true` AND the
 * store's scoped uid is unchanged across the remote await. Signed-out calls
 * (`AUTH_REQUIRED`) and failed Firestore writes (`WRITE_FAILED`,
 * `NOT_FOUND`) return before any store write, so the UI never reports â€”
 * and the store never holds â€” a save/delete/default the server did not
 * record. Callers already render `res.error.message` on the failure path.
 *
 * Session guard (R19 F-R19-1): `useAddressStore` re-scopes its in-memory
 * list to the incoming account as soon as auth changes (`addressStore.ts`
 * auth subscriber), while every mutation below awaits the remote write
 * first. Without a re-check, a sign-out / account switch inside that await
 * window would merge account A's returned address (name, phone, home
 * coords) into account B's list and persist it under `burg.addresses::B`.
 * Each mutation therefore captures `currentScopedUid()` â€” the SAME source
 * the store keys its persisted scope by â€” before the await and compares it
 * again before any `upsert`/`update`/`remove`/`setDefault`/`select`. On a
 * mismatch the remote write for the OLD account stands as completed (it is
 * never undone or reported as failed), but its result is returned as
 * `AUTH_CHANGED` and the new account's store is left untouched. A uid
 * source that has not been initialised yet reads null on both sides, so
 * that case never produces a false reject.
 *
 * Seed contract (closes audit 02 F3): `hydrate()` reads the signed-in
 * account's collection through `addressService.list()` and merges it into
 * the local store. The merge is deliberately conservative:
 *   - a failed read returns the typed failure and writes NOTHING, so a
 *     screen never turns "we couldn't load" into "you have no addresses";
 *   - the account uid is captured before the read and checked before the
 *     write, so a snapshot for A is never stored under B after a switch;
 *   - rows whose id was mutated (or whose delete is in flight) after the
 *     read began keep the LIVE local copy, so a stale snapshot cannot
 *     overwrite a newer write;
 *   - ids successfully deleted during the read are tombstoned and never
 *     re-added by that snapshot;
 *   - local rows absent from the server (unsynced/guest handoff) are kept,
 *     never silently dropped;
 *   - "default" follows the server when it records one, unless a local
 *     default was mutated during the same window.
 *
 * Delete-default truth (closes audit 02 F10 for this path): `remove()` of
 * the current default mirrors the promoted address with `setDefault` before
 * presenting it as default. The store's automatic local promotion is cleared
 * while that write is unconfirmed. If the mirror fails, the address is still
 * gone (the delete committed) but NO row keeps the default flag, and the
 * caller gets `DEFAULT_PROMOTION_FAILED` telling the customer to choose. A
 * session change during the mirror returns `AUTH_CHANGED` and leaves the new
 * account untouched.
 *
 * Remaining limit: a brand-new first address is still auto-defaulted by the
 * store without a server mirror (unchanged behaviour, outside this packet).
 *
 * Future backend integration points:
 *   - `hydrate()` - keep in sync with GET /v1/addresses (paged) when the
 *     endpoint lands; call it from any screen that needs server truth.
 *   - mutations â€” call the corresponding endpoint, then mirror the
 *     server response into the store to keep offline reads snappy.
 *   - `listDeliveryInstructionPresets()` â€” repository-driven so the
 *     backend can localise / A-B the quick-picks without a mobile
 *     release.
 */
import { fail, ok, type ApiFailure, type ApiResult } from "@/core/network/http";
import { currentScopedUid } from "@/features/auth/utils/scopedPersistence";
import { addressService } from "@/features/addresses/services/addressService";
import { useAddressStore } from "@/features/addresses/state/addressStore";
import type { Address, AddressInput } from "@/features/addresses/models";

/**
 * Post-await session guard (R19 F-R19-1). `startedUid` is the store's
 * scoped uid captured before the remote await; if it no longer matches,
 * the mutation belongs to a session that has ended.
 *
 * NOT retryable on purpose: the remote write for the OLD account already
 * committed, so pressing save again under the new account would create a
 * duplicate server row. Callers must treat this as terminal (close/reopen
 * after signing in), not as a plain field error.
 */
function sessionChangedAfter(startedUid: string | null): ApiFailure | null {
  if (currentScopedUid() === startedUid) return null;
  return fail(
    "AUTH_CHANGED",
    "Your session changed before we could confirm that. Reopen this address after signing in.",
    false,
  );
}

/**
 * Monotonic sequence for local commits. `hydrate()` captures the value
 * before its server read and treats a row with a newer stamp as live local
 * truth, so a slow snapshot cannot overwrite a write that landed after the
 * read started.
 */
let localRevision = 0;
const mutatedAt = new Map<string, number>();
/** Ids with a remote mutation in flight (delete included) - never seed over. */
const inFlightIds = new Set<string>();
/** Successful local deletes, per account scope, kept until the next seed. */
const deletedByUid = new Map<string | null, Set<string>>();

function markLocalMutation(id: string): void {
  localRevision += 1;
  mutatedAt.set(id, localRevision);
}

function markDeleted(uid: string | null, id: string): void {
  markLocalMutation(id);
  const ids = deletedByUid.get(uid) ?? new Set<string>();
  ids.add(id);
  deletedByUid.set(uid, ids);
}

let hydrateInFlight: {
  uid: string | null;
  promise: Promise<ApiResult<{ seeded: number }>>;
} | null = null;

export class AddressRepository {
  readonly name = "AddressRepository";

  list(): Address[] {
    return useAddressStore.getState().addresses;
  }

  /**
   * Seed the store from the signed-in account's server collection (audit 02
   * F3). Safe to call on every mount: concurrent calls for the same uid share
   * one read, and a call that straddles an identity change returns
   * `AUTH_CHANGED` without writing anywhere. See the header for merge rules.
   */
  hydrate(): Promise<ApiResult<{ seeded: number }>> {
    const uid = currentScopedUid();
    if (hydrateInFlight && hydrateInFlight.uid === uid) return hydrateInFlight.promise;

    const promise = this.runHydrate();
    hydrateInFlight = { uid, promise };
    void promise.then(
      () => {
        if (hydrateInFlight?.promise === promise) hydrateInFlight = null;
      },
      () => {
        if (hydrateInFlight?.promise === promise) hydrateInFlight = null;
      },
    );
    return promise;
  }

  private async runHydrate(): Promise<ApiResult<{ seeded: number }>> {
    const startedUid = currentScopedUid();
    // Guests have no server collection; nothing to read and nothing to write.
    if (!startedUid) return ok({ seeded: 0 });

    const startedRevision = localRevision;
    const res = await addressService.list();
    // A failed read is never an empty result: leave the local list untouched.
    if (!res.success) return res;

    // The snapshot belongs to the session that asked for it. Never merge A's
    // rows into B's store (or B's persisted scope) after a switch.
    const changed = sessionChangedAfter(startedUid);
    if (changed) return changed;

    const tombstoned = deletedByUid.get(startedUid);
    const isDirty = (id: string) =>
      inFlightIds.has(id) || (mutatedAt.get(id) ?? 0) > startedRevision;

    const serverRows = res.data.filter((a) => Boolean(a?.id) && !tombstoned?.has(a.id));
    const serverIds = new Set(serverRows.map((a) => a.id));
    // Snapshot the store AFTER the await: any write that landed meanwhile is
    // already visible here and will win through `isDirty`.
    const local = useAddressStore.getState().addresses;

    const mergedServer = serverRows.map((row) => {
      if (!isDirty(row.id)) return row;
      return local.find((a) => a.id === row.id) ?? row;
    });
    // Preserve rows the server does not know yet (unsynced create / guest
    // handoff) and never resurrect a locally deleted id.
    const localOnly = local.filter((a) => !serverIds.has(a.id) && !tombstoned?.has(a.id));
    const merged = [...mergedServer, ...localOnly];
    const mergedIds = new Set(merged.map((a) => a.id));

    // Default follows the server record; a default mutated during the read
    // (setDefault/delete promotion) is newer and wins. With no server default
    // we do not invent one from an unmirrored local auto-promotion.
    const serverDefaultId = serverRows.find((a) => a.isDefault)?.id ?? null;
    const localDefaultId = local.find((a) => a.isDefault)?.id ?? null;
    let chosenDefaultId =
      serverDefaultId && mergedIds.has(serverDefaultId) ? serverDefaultId : null;
    if (localDefaultId && isDirty(localDefaultId) && mergedIds.has(localDefaultId)) {
      chosenDefaultId = localDefaultId;
    }

    const addresses = merged.map((a) => ({
      ...a,
      isDefault: a.id === chosenDefaultId,
    }));
    const liveSelected = useAddressStore.getState().selectedId;
    const selectedId =
      liveSelected && mergedIds.has(liveSelected)
        ? liveSelected
        : (chosenDefaultId ?? addresses[0]?.id ?? null);

    useAddressStore.setState({ addresses, selectedId });
    return ok({ seeded: serverRows.length });
  }

  getSelectedId(): string | null {
    const s = useAddressStore.getState();
    return s.selectedId ?? s.addresses.find((a) => a.isDefault)?.id ?? null;
  }

  getSelected(): Address | null {
    const s = useAddressStore.getState();
    const id = this.getSelectedId();
    return s.addresses.find((a) => a.id === id) ?? null;
  }

  select(id: string): void {
    useAddressStore.getState().select(id);
  }

  async create(input: AddressInput): Promise<ApiResult<Address>> {
    const startedUid = currentScopedUid();
    const res = await addressService.create(input);
    // A genuine write failure is reported as-is even when the identity also
    // changed during the await (the failure describes what the server did).
    if (!res.success) return res;
    // R19 F-R19-1: the SUCCESS belongs to the session that started it. If
    // identity changed during the await, A's result must never be merged
    // into (or toasted to) B â€” the remote write for A stands as completed,
    // but no store mutation happens here.
    const changed = sessionChangedAfter(startedUid);
    if (changed) return changed;
    useAddressStore.getState().upsert(res.data);
    useAddressStore.getState().select(res.data.id);
    markLocalMutation(res.data.id);
    return res;
  }

  async update(id: string, patch: Partial<AddressInput>): Promise<ApiResult<void>> {
    const startedUid = currentScopedUid();
    inFlightIds.add(id);
    let res: Awaited<ReturnType<typeof addressService.update>>;
    try {
      res = await addressService.update(id, patch);
    } finally {
      inFlightIds.delete(id);
    }
    if (!res.success) return res;
    const changed = sessionChangedAfter(startedUid);
    if (changed) return changed;
    useAddressStore.getState().update(id, patch as Partial<Address>);
    markLocalMutation(id);
    return ok(undefined);
  }

  async remove(id: string): Promise<ApiResult<void>> {
    const startedUid = currentScopedUid();
    inFlightIds.add(id);
    let res: Awaited<ReturnType<typeof addressService.remove>>;
    try {
      res = await addressService.remove(id);
    } finally {
      inFlightIds.delete(id);
    }
    if (!res.success) return res;
    const changed = sessionChangedAfter(startedUid);
    if (changed) return changed;

    // Deleting the default leaves the server with no default. Capture the row
    // the store would promote, delete locally, then mirror that promotion so
    // the UI never claims a server default that was never written (audit 02
    // F10). Tombstone first so a stale seed snapshot cannot re-add the row.
    const before = useAddressStore.getState().addresses;
    const removedWasDefault = before.find((a) => a.id === id)?.isDefault === true;
    const promoted = removedWasDefault ? before.filter((a) => a.id !== id)[0] : undefined;
    markDeleted(startedUid, id);
    useAddressStore.getState().remove(id);
    if (!promoted) return ok(undefined);

    // The store auto-promotes on remove; drop that local claim while the
    // mirror is unconfirmed. It is restored only after the server confirms.
    useAddressStore.setState((s) => ({
      addresses: s.addresses.map((a) => (a.id === promoted.id ? { ...a, isDefault: false } : a)),
    }));

    inFlightIds.add(promoted.id);
    let mirror: Awaited<ReturnType<typeof addressService.setDefault>>;
    try {
      mirror = await addressService.setDefault(promoted.id);
    } finally {
      inFlightIds.delete(promoted.id);
    }
    const changedDuringMirror = sessionChangedAfter(startedUid);
    if (changedDuringMirror) return changedDuringMirror;
    if (!mirror.success) {
      // The delete committed; only the promotion failed. Say exactly that and
      // leave no row flagged default (the customer chooses one explicitly).
      return fail(
        "DEFAULT_PROMOTION_FAILED",
        "Address deleted, but we couldn't set a new default. Choose one with Set default.",
        false,
      );
    }
    useAddressStore.getState().setDefault(promoted.id);
    markLocalMutation(promoted.id);
    return ok(undefined);
  }

  async setDefault(id: string): Promise<ApiResult<void>> {
    const startedUid = currentScopedUid();
    inFlightIds.add(id);
    let res: Awaited<ReturnType<typeof addressService.setDefault>>;
    try {
      res = await addressService.setDefault(id);
    } finally {
      inFlightIds.delete(id);
    }
    if (!res.success) return res;
    const changed = sessionChangedAfter(startedUid);
    if (changed) return changed;
    useAddressStore.getState().setDefault(id);
    markLocalMutation(id);
    return ok(undefined);
  }

  listDeliveryInstructionPresets() {
    return addressService.listDeliveryInstructionPresets();
  }
}

export const addressRepository = new AddressRepository();
