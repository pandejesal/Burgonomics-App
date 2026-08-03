import { Injectable } from '@nestjs/common';
import type {
  NotificationChannel,
  NotificationCategory,
  NotificationChannelPreference,
} from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import type { IPreferenceRepository } from '../interfaces/preference-repository.interface';

@Injectable()
export class PreferencePrismaRepository implements IPreferenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  listForUser(userId: string): Promise<NotificationChannelPreference[]> {
    return this.prisma.notificationChannelPreference.findMany({ where: { userId } });
  }

  async upsertMany(
    userId: string,
    items: Array<{ category: string; channel: string; enabled: boolean }>,
  ): Promise<void> {
    if (!items.length) return;
    await this.prisma.$transaction(
      items.map((i) =>
        this.prisma.notificationChannelPreference.upsert({
          where: {
            userId_category_channel: {
              userId,
              category: i.category as NotificationCategory,
              channel: i.channel as NotificationChannel,
            },
          },
          create: {
            userId,
            category: i.category as NotificationCategory,
            channel: i.channel as NotificationChannel,
            enabled: i.enabled,
          },
          update: { enabled: i.enabled },
        }),
      ),
    );
  }

  async isChannelEnabled(userId: string, category: string, channel: string): Promise<boolean> {
    const pref = await this.prisma.notificationChannelPreference.findUnique({
      where: {
        userId_category_channel: {
          userId,
          category: category as NotificationCategory,
          channel: channel as NotificationChannel,
        },
      },
    });
    return pref?.enabled ?? true;
  }
}
