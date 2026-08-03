import { Role } from '@common/enums';

/**
 * Domain representation of a user. Independent from the persistence
 * shape produced by Prisma; mappers translate between the two.
 */
export class UserEntity {
  id!: string;
  phone!: string;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  role!: Role;
  isActive!: boolean;
  lastLoginAt?: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export class UserPreferenceEntity {
  userId!: string;
  language!: string;
  theme!: string;
  notificationsEnabled!: boolean;
  marketingOptIn!: boolean;
  updatedAt!: Date;
}
