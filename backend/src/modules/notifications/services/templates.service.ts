import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { NotificationChannel } from '@prisma/client';
import {
  TEMPLATE_REPOSITORY,
  type ITemplateRepository,
} from '../repositories/interfaces/template-repository.interface';
import { DEFAULT_TEMPLATES, renderTemplate } from '../templates/default-templates';

export interface RenderedTemplate {
  code: string;
  version: number;
  title: string;
  body: string;
}

@Injectable()
export class TemplatesService implements OnModuleInit {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(@Inject(TEMPLATE_REPOSITORY) private readonly repo: ITemplateRepository) {}

  async onModuleInit(): Promise<void> {
    await this.repo
      .upsertMany(
        DEFAULT_TEMPLATES.map((t) => ({
          code: t.code,
          type: t.type,
          channel: t.channel as NotificationChannel,
          locale: t.locale,
          title: t.title,
          body: t.body,
        })),
      )
      .catch((err) => this.logger.warn(`Template seed skipped: ${(err as Error).message}`));
  }

  async render(
    code: string,
    params: Record<string, unknown>,
    opts: { locale?: string; channel?: string } = {},
  ): Promise<RenderedTemplate | null> {
    const tpl = await this.repo.find(code, opts.locale ?? 'en', opts.channel ?? 'PUSH');
    if (!tpl) {
      const fallback = DEFAULT_TEMPLATES.find((t) => t.code === code);
      if (!fallback) return null;
      return {
        code,
        version: 1,
        title: renderTemplate(fallback.title, params),
        body: renderTemplate(fallback.body, params),
      };
    }
    return {
      code,
      version: tpl.version,
      title: renderTemplate(tpl.title, params),
      body: renderTemplate(tpl.body, params),
    };
  }
}
