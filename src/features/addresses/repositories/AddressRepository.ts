/**
 * AddressRepository — the single entry point UI components use for
 * address reads/mutations. Delegates persistence to `useAddressStore`
 * and mock validation/latency to `addressService`.
 *
 * Future backend integration points:
 *   - `list()` — replace with GET /v1/addresses (paged).
 *   - mutations — call the corresponding endpoint, then mirror the
 *     server response into the store to keep offline reads snappy.
 *   - `listDeliveryInstructionPresets()` — repository-driven so the
 *     backend can localise / A-B the quick-picks without a mobile
 *     release.
 */
import type { ApiResult } from "@/core/network/http";
import { ok } from "@/core/network/http";
import { addressService } from "@/features/addresses/services/addressService";
import { useAddressStore } from "@/features/addresses/state/addressStore";
import type { Address, AddressInput } from "@/features/addresses/models";

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
    const res = await addressService.create(input);
    if (!res.success) return res;
    useAddressStore.getState().upsert(res.data);
    useAddressStore.getState().select(res.data.id);
    return res;
  }

  async update(id: string, patch: Partial<AddressInput>): Promise<ApiResult<void>> {
    const res = await addressService.update(id, patch);
    if (!res.success) return res;
    useAddressStore.getState().update(id, patch as Partial<Address>);
    return ok(undefined);
  }

  async remove(id: string): Promise<ApiResult<void>> {
    const res = await addressService.remove(id);
    if (!res.success) return res;
    useAddressStore.getState().remove(id);
    return ok(undefined);
  }

  async setDefault(id: string): Promise<ApiResult<void>> {
    const res = await addressService.setDefault(id);
    if (!res.success) return res;
    useAddressStore.getState().setDefault(id);
    return ok(undefined);
  }

  listDeliveryInstructionPresets() {
    return addressService.listDeliveryInstructionPresets();
  }
}

export const addressRepository = new AddressRepository();
