import type { NotificationChannelPreference } from '@prisma/client';

export const PREFERENCE_REPOSITORY = Symbol('PREFERENCE_REPOSITORY');

export interface IPreferenceRepository {
  listForUser(userId: string): Promise<NotificationChannelPreference[]>;
  upsertMany(
    userId: string,
    items: Array<{ category: string; channel: string; enabled: boolean }>,
  ): Promise<void>;
  isChannelEnabled(userId: string, category: string, channel: string): Promise<boolean>;
}
