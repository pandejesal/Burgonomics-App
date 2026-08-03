import { Injectable } from '@nestjs/common';
import type { Device, Prisma } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import type { IDeviceRepository } from '../interfaces/device-repository.interface';
import type { RegisterDeviceInput } from '../../entities/device.entity';

@Injectable()
export class DevicePrismaRepository implements IDeviceRepository {
  constructor(private readonly prisma: PrismaService) {}

  upsert(input: RegisterDeviceInput): Promise<Device> {
    const data = {
      userId: input.userId,
      platform: input.platform,
      appVersion: input.appVersion,
      osVersion: input.osVersion,
      deviceModel: input.deviceModel,
      language: input.language ?? 'en',
      timezone: input.timezone,
      fcmProjectId: input.fcmProjectId,
      pushEnabled: input.pushEnabled ?? true,
      isActive: true,
      lastSeenAt: new Date(),
      revokedAt: null,
      metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined,
    } satisfies Prisma.DeviceUpdateInput;
    return this.prisma.device.upsert({
      where: { token: input.token },
      create: { ...(data as Prisma.DeviceCreateInput), token: input.token, userId: input.userId },
      update: data,
    });
  }

  findById(id: string) {
    return this.prisma.device.findUnique({ where: { id } });
  }

  findByToken(token: string) {
    return this.prisma.device.findUnique({ where: { token } });
  }

  listActiveForUser(userId: string) {
    return this.prisma.device.findMany({
      where: { userId, isActive: true, pushEnabled: true },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  listActiveForUsers(userIds: string[]) {
    if (!userIds.length) return Promise.resolve([]);
    return this.prisma.device.findMany({
      where: { userId: { in: userIds }, isActive: true, pushEnabled: true },
    });
  }

  touch(id: string, patch: { appVersion?: string; language?: string; timezone?: string }) {
    return this.prisma.device.update({
      where: { id },
      data: { ...patch, lastSeenAt: new Date() },
    });
  }

  async revoke(id: string, userId: string): Promise<void> {
    await this.prisma.device.updateMany({
      where: { id, userId },
      data: { isActive: false, revokedAt: new Date() },
    });
  }

  async revokeByToken(token: string): Promise<void> {
    await this.prisma.device.updateMany({
      where: { token },
      data: { isActive: false, revokedAt: new Date() },
    });
  }

  async disableTokens(tokens: string[]): Promise<number> {
    if (!tokens.length) return 0;
    const res = await this.prisma.device.updateMany({
      where: { token: { in: tokens } },
      data: { isActive: false, revokedAt: new Date() },
    });
    return res.count;
  }
}
