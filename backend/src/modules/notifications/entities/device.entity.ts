import type { Device, DevicePlatform } from '@prisma/client';

export type DeviceEntity = Device;

export interface RegisterDeviceInput {
  userId: string;
  token: string;
  platform: DevicePlatform;
  appVersion?: string;
  osVersion?: string;
  deviceModel?: string;
  language?: string;
  timezone?: string;
  pushEnabled?: boolean;
  fcmProjectId?: string;
  metadata?: Record<string, unknown>;
}
