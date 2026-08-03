import { Injectable } from '@nestjs/common';
import type { NotificationChannel, NotificationTemplate } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import type { ITemplateRepository } from '../interfaces/template-repository.interface';

@Injectable()
export class TemplatePrismaRepository implements ITemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  find(
    code: string,
    locale = 'en',
    channel: string = 'PUSH',
  ): Promise<NotificationTemplate | null> {
    return this.prisma.notificationTemplate.findUnique({
      where: {
        code_locale_channel: { code, locale, channel: channel as NotificationChannel },
      },
    });
  }

  async upsertMany(
    templates: Array<
      Pick<NotificationTemplate, 'code' | 'type' | 'channel' | 'locale' | 'title' | 'body'>
    >,
  ): Promise<void> {
    if (!templates.length) return;
    await this.prisma.$transaction(
      templates.map((t) =>
        this.prisma.notificationTemplate.upsert({
          where: { code_locale_channel: { code: t.code, locale: t.locale, channel: t.channel } },
          create: {
            code: t.code,
            type: t.type,
            channel: t.channel,
            locale: t.locale,
            title: t.title,
            body: t.body,
          },
          update: { title: t.title, body: t.body, type: t.type },
        }),
      ),
    );
  }

  list(): Promise<NotificationTemplate[]> {
    return this.prisma.notificationTemplate.findMany({ orderBy: { code: 'asc' } });
  }
}
