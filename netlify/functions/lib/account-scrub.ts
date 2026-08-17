export interface UserProfileData {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  photoURL?: string | null;
  avatarUrl?: string | null;
  addresses?: any[];
  [key: string]: any;
}

export interface OrderScrubOptions {
  anonymizedAt?: string | Date;
}

/**
 * Returns the Firestore document update dictionary for scrubbing PII from an order document.
 * Injected with Firestore placeholder objects (e.g. FieldValue.serverTimestamp() and FieldValue.delete()).
 */
export function getOrderScrubUpdatePayload(
  anonymizedAtPlaceholder: any,
  deleteFieldPlaceholder: any,
): Record<string, any> {
  return {
    anonymized: true,
    anonymizedAt: anonymizedAtPlaceholder,
    address: deleteFieldPlaceholder,
    deliveryPartner: deleteFieldPlaceholder,
    notes: deleteFieldPlaceholder,
    fulfillmentInstructions: deleteFieldPlaceholder,
    meta: deleteFieldPlaceholder,
  };
}

/**
 * Pure function to scrub PII from in-memory user profile records.
 */
export function scrubUserProfile(profile: UserProfileData): UserProfileData {
  const scrubbed: UserProfileData = {
    ...profile,
    name: "Deleted User",
    phone: "",
    email: "",
    photoURL: null,
    avatarUrl: null,
    addresses: [],
    anonymized: true,
  };
  return scrubbed;
}

/**
 * Pure function to scrub PII from in-memory order records while preserving financial ledger fields.
 */
export function scrubOrderData<T extends Record<string, any>>(
  order: T,
  options?: OrderScrubOptions,
): T {
  const anonymizedAt =
    options?.anonymizedAt instanceof Date
      ? options.anonymizedAt.toISOString()
      : options?.anonymizedAt || new Date().toISOString();

  const {
    address,
    deliveryPartner,
    notes,
    fulfillmentInstructions,
    meta,
    customerName,
    customerPhone,
    customerEmail,
    ...rest
  } = order;

  return {
    ...rest,
    anonymized: true,
    anonymizedAt,
    customerName: "Deleted User",
    customerPhone: "",
    customerEmail: "",
  } as unknown as T;
}

/**
 * Composite scrubber for user profile and their order history.
 */
export function scrubAccountData(
  userRecord: UserProfileData,
  orders: Array<Record<string, any>> = [],
  options?: OrderScrubOptions,
): { user: UserProfileData; orders: Array<Record<string, any>> } {
  return {
    user: scrubUserProfile(userRecord),
    orders: orders.map((ord) => scrubOrderData(ord, options)),
  };
}
