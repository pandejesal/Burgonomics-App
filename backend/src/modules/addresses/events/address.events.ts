export const ADDRESS_EVENTS = {
  CREATED: 'address.created',
  UPDATED: 'address.updated',
  DELETED: 'address.deleted',
  DEFAULT_CHANGED: 'address.default_changed',
} as const;

export interface AddressChangedEvent {
  userId: string;
  addressId: string;
}
