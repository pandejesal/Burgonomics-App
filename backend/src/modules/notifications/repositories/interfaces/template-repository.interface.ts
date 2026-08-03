import type { NotificationTemplate } from '@prisma/client';

export const TEMPLATE_REPOSITORY = Symbol('TEMPLATE_REPOSITORY');

export interface ITemplateRepository {
  find(code: string, locale?: string, channel?: string): Promise<NotificationTemplate | null>;
  upsertMany(
    templates: Array<
      Pick<NotificationTemplate, 'code' | 'type' | 'channel' | 'locale' | 'title' | 'body'>
    >,
  ): Promise<void>;
  list(): Promise<NotificationTemplate[]>;
}
