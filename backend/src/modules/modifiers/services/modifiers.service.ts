import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '@common/errors';
import { CacheService } from '@infra/cache/cache.service';
import { DomainEventBus } from '@infra/events/domain-event-bus';
import {
  MODIFIER_REPOSITORY,
  type IModifierRepository,
  type ModifierGroupWithOptions,
} from '../repositories/interfaces/modifier-repository.interface';
import type { ModifierGroupUpsertInput } from '../validators/modifier.validators';
import { MODIFIER_EVENTS, type ModifierGroupChangedEvent } from '../events/modifier.events';

const CACHE_TTL = 300;
const cacheKey = (id: string) => `catalog:modifier_group:${id}:v1`;

@Injectable()
export class ModifiersService {
  constructor(
    @Inject(MODIFIER_REPOSITORY) private readonly repo: IModifierRepository,
    private readonly cache: CacheService,
    private readonly bus: DomainEventBus,
  ) {}

  listAll() {
    return this.repo.listAllGroups();
  }

  async get(id: string): Promise<ModifierGroupWithOptions> {
    return this.cache.wrap(cacheKey(id), CACHE_TTL, async () => {
      const g = await this.repo.findGroupById(id);
      if (!g) throw new NotFoundError('Modifier group not found');
      return g;
    });
  }

  listByIds(ids: string[]) {
    return this.repo.listGroupsByIds(ids);
  }

  async upsertFromPetpooja(input: ModifierGroupUpsertInput, correlationId?: string) {
    const g = await this.repo.upsertGroupFromPetpooja(input);
    await this.cache.del(cacheKey(g.id));
    this.bus.publish<ModifierGroupChangedEvent>(MODIFIER_EVENTS.GROUP_UPDATED, {
      groupId: g.id,
      petpoojaId: g.petpoojaId,
      source: 'PETPOOJA_SYNC',
      correlationId,
    });
    return g;
  }
}
