import { Inject, Injectable, Logger } from '@nestjs/common';
import { DomainEventBus } from '@infra/events/domain-event-bus';
import { NotFoundError } from '@common/errors';
import {
  DEVICE_REPOSITORY,
  type IDeviceRepository,
} from '../repositories/interfaces/device-repository.interface';
import type { RegisterDeviceInput } from '../entities/device.entity';
import type { DeviceEntity } from '../entities/device.entity';
import { NOTIFICATION_EVENTS, type DeviceLifecycleEvent } from '../events/notification.events';

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    @Inject(DEVICE_REPOSITORY) private readonly repo: IDeviceRepository,
    private readonly bus: DomainEventBus,
  ) {}

  async register(input: RegisterDeviceInput, correlationId?: string): Promise<DeviceEntity> {
    const device = await this.repo.upsert(input);
    this.bus.publish<DeviceLifecycleEvent>(NOTIFICATION_EVENTS.DEVICE_REGISTERED, {
      deviceId: device.id,
      userId: device.userId,
      platform: device.platform,
      correlationId,
    });
    return device;
  }

  async heartbeat(
    id: string,
    userId: string,
    patch: { appVersion?: string; language?: string; timezone?: string },
  ): Promise<DeviceEntity> {
    const d = await this.repo.findById(id);
    if (!d || d.userId !== userId) throw new NotFoundError('Device not found');
    const updated = await this.repo.touch(id, patch);
    this.bus.publish(NOTIFICATION_EVENTS.DEVICE_REFRESHED, { deviceId: id, userId });
    return updated;
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.repo.revoke(id, userId);
    this.bus.publish<DeviceLifecycleEvent>(NOTIFICATION_EVENTS.DEVICE_REMOVED, {
      deviceId: id,
      userId,
      platform: 'unknown',
    });
  }

  listMine(userId: string) {
    return this.repo.listActiveForUser(userId);
  }

  async disableInvalidTokens(tokens: string[]): Promise<number> {
    if (!tokens.length) return 0;
    const n = await this.repo.disableTokens(tokens);
    if (n) this.logger.warn(`Disabled ${n} invalid FCM tokens`);
    return n;
  }

  activeTokensForUsers(userIds: string[]) {
    return this.repo.listActiveForUsers(userIds);
  }
}
