import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import { ModifierMapper } from '../../mappers/modifier.mapper';
import type { ModifierGroupUpsertInput } from '../../validators/modifier.validators';
import type {
  IModifierRepository,
  ModifierGroupWithOptions,
} from '../interfaces/modifier-repository.interface';
import type { ModifierGroupEntity } from '../../entities/modifier.entity';

const INCLUDE = {
  modifiers: { orderBy: { displayOrder: 'asc' as const } },
} satisfies Prisma.ModifierGroupInclude;

@Injectable()
export class ModifierPrismaRepository implements IModifierRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findGroupById(id: string): Promise<ModifierGroupWithOptions | null> {
    const row = await this.prisma.modifierGroup.findUnique({ where: { id }, include: INCLUDE });
    if (!row) return null;
    return {
      group: ModifierMapper.groupToEntity(row),
      options: row.modifiers.map(ModifierMapper.optionToEntity),
    };
  }

  async findGroupByPetpoojaId(petpoojaId: string): Promise<ModifierGroupEntity | null> {
    const row = await this.prisma.modifierGroup.findUnique({ where: { petpoojaId } });
    return row ? ModifierMapper.groupToEntity(row) : null;
  }

  async listGroupsByIds(ids: string[]): Promise<ModifierGroupWithOptions[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.modifierGroup.findMany({
      where: { id: { in: ids } },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      include: INCLUDE,
    });
    return rows.map((r) => ({
      group: ModifierMapper.groupToEntity(r),
      options: r.modifiers.map(ModifierMapper.optionToEntity),
    }));
  }

  async listAllGroups(): Promise<ModifierGroupWithOptions[]> {
    const rows = await this.prisma.modifierGroup.findMany({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      include: INCLUDE,
    });
    return rows.map((r) => ({
      group: ModifierMapper.groupToEntity(r),
      options: r.modifiers.map(ModifierMapper.optionToEntity),
    }));
  }

  async upsertGroupFromPetpooja(input: ModifierGroupUpsertInput): Promise<ModifierGroupEntity> {
    const row = await this.prisma.$transaction(async (tx) => {
      const g = await tx.modifierGroup.upsert({
        where: { petpoojaId: input.petpoojaId },
        create: {
          petpoojaId: input.petpoojaId,
          name: input.name,
          description: input.description ?? null,
          minSelection: input.minSelection,
          maxSelection: input.maxSelection,
          isRequired: input.isRequired,
          allowMultiple: input.allowMultiple,
          displayOrder: input.displayOrder,
          isAvailable: input.isAvailable,
          translations: (input.translations ?? undefined) as Prisma.InputJsonValue | undefined,
        },
        update: {
          name: input.name,
          description: input.description ?? null,
          minSelection: input.minSelection,
          maxSelection: input.maxSelection,
          isRequired: input.isRequired,
          allowMultiple: input.allowMultiple,
          displayOrder: input.displayOrder,
          isAvailable: input.isAvailable,
          translations: (input.translations ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });

      const existing = await tx.modifierOption.findMany({
        where: { groupId: g.id },
        select: { petpoojaId: true },
      });
      const incoming = new Set(input.options.map((o) => o.petpoojaId));
      const stale = existing.filter((e) => !incoming.has(e.petpoojaId)).map((e) => e.petpoojaId);
      if (stale.length) {
        await tx.modifierOption.deleteMany({ where: { groupId: g.id, petpoojaId: { in: stale } } });
      }

      for (const opt of input.options) {
        await tx.modifierOption.upsert({
          where: { petpoojaId: opt.petpoojaId },
          create: {
            petpoojaId: opt.petpoojaId,
            groupId: g.id,
            name: opt.name,
            price: new Prisma.Decimal(opt.price as string | number),
            displayOrder: opt.displayOrder,
            isAvailable: opt.isAvailable,
            isDefault: opt.isDefault,
            translations: (opt.translations ?? undefined) as Prisma.InputJsonValue | undefined,
          },
          update: {
            groupId: g.id,
            name: opt.name,
            price: new Prisma.Decimal(opt.price as string | number),
            displayOrder: opt.displayOrder,
            isAvailable: opt.isAvailable,
            isDefault: opt.isDefault,
            translations: (opt.translations ?? undefined) as Prisma.InputJsonValue | undefined,
          },
        });
      }
      return g;
    });
    return ModifierMapper.groupToEntity(row);
  }

  async deleteGroupsByPetpoojaIdsNotIn(keep: string[]): Promise<number> {
    const res = await this.prisma.modifierGroup.deleteMany({
      where: { petpoojaId: { notIn: keep } },
    });
    return res.count;
  }
}
