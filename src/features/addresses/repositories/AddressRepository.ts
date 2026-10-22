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
 * Hydration gap (audit 02 F3 â€” documented here, NOT redesigned): `list()`
 * reads the locally persisted store only, and `addressService.list()` (the
 * Firestore read) has no call site yet. Server-side addresses are
 * therefore never seeded back into the store on login, so saved addresses
 * stay device-local until a seed/merge path is added in the store layer.
 *
 * Known limit (audit 02 F10 class, unchanged): a mutation patch or delete
 * is applied verbatim to the store â€” only `upsert`/`setDefault` enforce
 * the single-default invariant locally, and `remove` promoting a new local
 * default is not mirrored to the server.
 *
 * Future backend integration points:
 *   - `list()` â€” replace with GET /v1/addresses (paged) once the store is
 *     seeded from the server (closes the hydration gap above).
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

export class AddressRepository {
  readonly name = "AddressRepository";

  list(): Address[] {
    return useAddressStore.getState().addresses;
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
    return res;
  }

  async update(id: string, patch: Partial<AddressInput>): Promise<ApiResult<void>> {
    const startedUid = currentScopedUid();
    const res = await addressService.update(id, patch);
    if (!res.success) return res;
    const changed = sessionChangedAfter(startedUid);
    if (changed) return changed;
    useAddressStore.getState().update(id, patch as Partial<Address>);
    return ok(undefined);
  }

  async remove(id: string): Promise<ApiResult<void>> {
    const startedUid = currentScopedUid();
    const res = await addressService.remove(id);
    if (!res.success) return res;
    const changed = sessionChangedAfter(startedUid);
    if (changed) return changed;
    useAddressStore.getState().remove(id);
    return ok(undefined);
  }

  async setDefault(id: string): Promise<ApiResult<void>> {
    const startedUid = currentScopedUid();
    const res = await addressService.setDefault(id);
    if (!res.success) return res;
    const changed = sessionChangedAfter(startedUid);
    if (changed) return changed;
    useAddressStore.getState().setDefault(id);
    return ok(undefined);
  }

  listDeliveryInstructionPresets() {
    return addressService.listDeliveryInstructionPresets();
  }
}

export const addressRepository = new AddressRepository();
