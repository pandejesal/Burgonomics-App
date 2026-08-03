import type { User, UserPreference } from '@prisma/client';
import { Role } from '@common/enums';
import { UserEntity, UserPreferenceEntity } from '../entities/user.entity';
import { UserResponseDto, PreferencesResponseDto } from '../dto';

export class UserMapper {
  static toEntity(row: User): UserEntity {
    const entity = new UserEntity();
    Object.assign(entity, {
      id: row.id,
      phone: row.phone,
      email: row.email,
      name: row.name,
      avatarUrl: row.avatarUrl,
      role: row.role as unknown as Role,
      isActive: row.isActive,
      lastLoginAt: row.lastLoginAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
    return entity;
  }

  static toResponse(entity: UserEntity): UserResponseDto {
    return {
      id: entity.id,
      phone: entity.phone,
      email: entity.email ?? null,
      name: entity.name ?? null,
      avatarUrl: entity.avatarUrl ?? null,
      role: entity.role,
      isActive: entity.isActive,
      lastLoginAt: entity.lastLoginAt?.toISOString() ?? null,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  static preferencesToEntity(row: UserPreference): UserPreferenceEntity {
    const e = new UserPreferenceEntity();
    Object.assign(e, row);
    return e;
  }

  static preferencesToResponse(row: UserPreference | null): PreferencesResponseDto {
    return {
      language: row?.language ?? 'en',
      theme: row?.theme ?? 'system',
      notificationsEnabled: row?.notificationsEnabled ?? true,
      marketingOptIn: row?.marketingOptIn ?? false,
    };
  }
}
