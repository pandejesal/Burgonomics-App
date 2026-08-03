import { Inject, Injectable } from '@nestjs/common';
import {
  PREFERENCE_REPOSITORY,
  type IPreferenceRepository,
} from '../repositories/interfaces/preference-repository.interface';
import type { ChannelPreferenceItemDto, PreferencesResponseDto } from '../dto';

@Injectable()
export class PreferencesService {
  constructor(@Inject(PREFERENCE_REPOSITORY) private readonly repo: IPreferenceRepository) {}

  async getForUser(userId: string, pushEnabled: boolean): Promise<PreferencesResponseDto> {
    const raw = await this.repo.listForUser(userId);
    return {
      pushEnabled,
      channels: raw.map((p) => ({
        category: p.category as ChannelPreferenceItemDto['category'],
        channel: p.channel as ChannelPreferenceItemDto['channel'],
        enabled: p.enabled,
      })),
    };
  }

  update(userId: string, channels: ChannelPreferenceItemDto[]): Promise<void> {
    return this.repo.upsertMany(
      userId,
      channels.map((c) => ({ category: c.category, channel: c.channel, enabled: c.enabled })),
    );
  }

  isChannelEnabled(userId: string, category: string, channel: string): Promise<boolean> {
    return this.repo.isChannelEnabled(userId, category, channel);
  }
}
