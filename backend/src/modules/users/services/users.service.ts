import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundError } from '@common/errors';
import type { UpdateUserDto, UpdatePreferencesDto } from '../dto';
import { CompletionStatusDto } from '../dto';
import type { UserEntity, UserPreferenceEntity } from '../entities/user.entity';
import { USER_EVENTS } from '../events/user.events';
import {
  USER_REPOSITORY,
  type IUserRepository,
} from '../repositories/interfaces/user-repository.interface';

@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    private readonly events: EventEmitter2,
  ) {}

  async getById(id: string): Promise<UserEntity> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundError('User not found');
    return user;
  }

  async findByPhone(phone: string): Promise<UserEntity | null> {
    return this.users.findByPhone(phone);
  }

  async create(phone: string): Promise<UserEntity> {
    const user = await this.users.create({ phone });
    this.events.emit(USER_EVENTS.CREATED, { userId: user.id, phone, createdAt: new Date() });
    return user;
  }

  async updateProfile(id: string, patch: UpdateUserDto): Promise<UserEntity> {
    const updated = await this.users.update(id, patch);
    this.events.emit(USER_EVENTS.UPDATED, { userId: id, changed: Object.keys(patch) });
    return updated;
  }

  async getPreferences(userId: string): Promise<UserPreferenceEntity | null> {
    return this.users.getPreferences(userId);
  }

  async updatePreferences(
    userId: string,
    patch: UpdatePreferencesDto,
  ): Promise<UserPreferenceEntity> {
    const updated = await this.users.upsertPreferences(userId, patch);
    this.events.emit(USER_EVENTS.PREFERENCES_UPDATED, { userId, changed: Object.keys(patch) });
    return updated;
  }

  async getCompletionStatus(userId: string): Promise<CompletionStatusDto> {
    const user = await this.getById(userId);
    const hasName = !!user.name;
    const hasEmail = !!user.email;
    const hasAvatar = !!user.avatarUrl;
    const hasAddress = false; // wired to AddressesService in a later phase
    const checks = [hasName, hasEmail, hasAvatar, hasAddress];
    const percentComplete = Math.round((checks.filter(Boolean).length / checks.length) * 100);
    return { hasName, hasEmail, hasAvatar, hasAddress, percentComplete };
  }
}
