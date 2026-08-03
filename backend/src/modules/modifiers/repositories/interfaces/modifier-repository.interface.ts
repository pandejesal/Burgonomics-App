import type { ModifierGroupEntity, ModifierOptionEntity } from '../../entities/modifier.entity';
import type { ModifierGroupUpsertInput } from '../../validators/modifier.validators';

export const MODIFIER_REPOSITORY = Symbol('MODIFIER_REPOSITORY');

export interface ModifierGroupWithOptions {
  group: ModifierGroupEntity;
  options: ModifierOptionEntity[];
}

export interface IModifierRepository {
  findGroupById(id: string): Promise<ModifierGroupWithOptions | null>;
  findGroupByPetpoojaId(petpoojaId: string): Promise<ModifierGroupEntity | null>;
  listGroupsByIds(ids: string[]): Promise<ModifierGroupWithOptions[]>;
  listAllGroups(): Promise<ModifierGroupWithOptions[]>;
  upsertGroupFromPetpooja(input: ModifierGroupUpsertInput): Promise<ModifierGroupEntity>;
  deleteGroupsByPetpoojaIdsNotIn(keep: string[]): Promise<number>;
}
