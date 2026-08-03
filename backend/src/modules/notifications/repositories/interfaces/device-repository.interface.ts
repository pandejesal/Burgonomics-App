import type { Device } from '@prisma/client';
import type { RegisterDeviceInput } from '../../entities/device.entity';

export const DEVICE_REPOSITORY = Symbol('DEVICE_REPOSITORY');

export interface IDeviceRepository {
  upsert(input: RegisterDeviceInput): Promise<Device>;
  findById(id: string): Promise<Device | null>;
  findByToken(token: string): Promise<Device | null>;
  listActiveForUser(userId: string): Promise<Device[]>;
  listActiveForUsers(userIds: string[]): Promise<Device[]>;
  touch(
    id: string,
    patch: { appVersion?: string; language?: string; timezone?: string },
  ): Promise<Device>;
  revoke(id: string, userId: string): Promise<void>;
  revokeByToken(token: string): Promise<void>;
  disableTokens(tokens: string[]): Promise<number>;
}
