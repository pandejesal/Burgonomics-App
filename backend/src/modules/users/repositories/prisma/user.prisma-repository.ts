import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import { NotFoundError } from '@common/errors';
import { UserMapper } from '../../mappers/user.mapper';
import type { UserEntity, UserPreferenceEntity } from '../../entities/user.entity';
import type { UpdateUserDto, UpdatePreferencesDto } from '../../dto';
import type { CreateUserInput, IUserRepository } from '../interfaces/user-repository.interface';

@Injectable()
export class UserPrismaRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<UserEntity | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? UserMapper.toEntity(row) : null;
  }

  async findByPhone(phone: string): Promise<UserEntity | null> {
    const row = await this.prisma.user.findUnique({ where: { phone } });
    return row ? UserMapper.toEntity(row) : null;
  }

  async create(input: CreateUserInput): Promise<UserEntity> {
    const row = await this.prisma.user.create({
      data: {
        phone: input.phone,
        email: input.email,
        name: input.name,
        preferences: { create: {} },
      },
    });
    return UserMapper.toEntity(row);
  }

  async update(id: string, patch: UpdateUserDto): Promise<UserEntity> {
    try {
      const row = await this.prisma.user.update({ where: { id }, data: patch });
      return UserMapper.toEntity(row);
    } catch {
      throw new NotFoundError('User not found');
    }
  }

  async markLoginAt(id: string, at: Date): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { lastLoginAt: at } });
  }

  async getPreferences(userId: string): Promise<UserPreferenceEntity | null> {
    const row = await this.prisma.userPreference.findUnique({ where: { userId } });
    return row ? UserMapper.preferencesToEntity(row) : null;
  }

  async upsertPreferences(
    userId: string,
    patch: UpdatePreferencesDto,
  ): Promise<UserPreferenceEntity> {
    const row = await this.prisma.userPreference.upsert({
      where: { userId },
      create: { userId, ...patch },
      update: patch,
    });
    return UserMapper.preferencesToEntity(row);
  }
}
