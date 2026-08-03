/**
 * Address domain model — the frontend contract. Repositories will map
 * backend / PETPOOJA DTOs to this shape. UI never touches raw wire data.
 */
export type AddressLabel = "home" | "work" | "other";

export interface Address {
  id: string;
  label: AddressLabel;
  /** Free-text label when `label === "other"` (e.g. "Mom's place"). */
  customLabel?: string;
  contactName?: string;
  contactPhone?: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state?: string;
  pincode: string;
  /** Optional coords — populated by geocoding in future backend. */
  lat?: number;
  lng?: number;
  isDefault: boolean;
  /** Repo-driven metadata for future sync (server id, version…). */
  meta?: Record<string, unknown>;
}

export type AddressInput = Omit<Address, "id" | "isDefault"> & {
  isDefault?: boolean;
};
