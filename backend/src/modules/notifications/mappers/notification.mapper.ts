import type { Notification, Device } from '@prisma/client';
import type { DeviceResponseDto, NotificationResponseDto } from '../dto';

export class NotificationMapper {
  static toResponse(n: Notification): NotificationResponseDto {
    return {
      id: n.id,
      type: n.type,
      category: n.category as NotificationResponseDto['category'],
      title: n.title,
      body: n.body,
      deeplink: n.deeplink ?? undefined,
      imageUrl: n.imageUrl ?? undefined,
      data: (n.data as Record<string, unknown> | null) ?? undefined,
      status: n.status as NotificationResponseDto['status'],
      read: n.readAt !== null,
      createdAt: n.createdAt.toISOString(),
      readAt: n.readAt?.toISOString(),
      archivedAt: n.archivedAt?.toISOString(),
    };
  }
}

export class DeviceMapper {
  static toResponse(d: Device): DeviceResponseDto {
    return {
      id: d.id,
      platform: d.platform as DeviceResponseDto['platform'],
      appVersion: d.appVersion ?? undefined,
      osVersion: d.osVersion ?? undefined,
      language: d.language,
      timezone: d.timezone ?? undefined,
      pushEnabled: d.pushEnabled,
      isActive: d.isActive,
      lastSeenAt: d.lastSeenAt.toISOString(),
      registeredAt: d.registeredAt.toISOString(),
    };
  }
}
