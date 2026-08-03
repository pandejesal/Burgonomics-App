export const USER_EVENTS = {
  CREATED: 'user.created',
  UPDATED: 'user.updated',
  DELETED: 'user.deleted',
  PREFERENCES_UPDATED: 'user.preferences.updated',
} as const;

export interface UserCreatedEvent {
  userId: string;
  phone: string;
  createdAt: Date;
}

export interface UserUpdatedEvent {
  userId: string;
  changed: string[];
}

export interface UserPreferencesUpdatedEvent {
  userId: string;
  changed: string[];
}
