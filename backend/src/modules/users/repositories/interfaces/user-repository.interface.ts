import type { UserEntity, UserPreferenceEntity } from '../../entities/user.entity';
import type { UpdateUserDto, UpdatePreferencesDto } from '../../dto';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface CreateUserInput {
  phone: string;
  email?: string;
  name?: string;
}

export interface IUserRepository {
  findById(id: string): Promise<UserEntity | null>;
  findByPhone(phone: string): Promise<UserEntity | null>;
  create(input: CreateUserInput): Promise<UserEntity>;
  update(id: string, patch: UpdateUserDto): Promise<UserEntity>;
  markLoginAt(id: string, at: Date): Promise<void>;
  getPreferences(userId: string): Promise<UserPreferenceEntity | null>;
  upsertPreferences(userId: string, patch: UpdatePreferencesDto): Promise<UserPreferenceEntity>;
}
