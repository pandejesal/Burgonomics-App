import type { ModifierGroup, ModifierOption } from '@prisma/client';
import { ModifierGroupEntity, ModifierOptionEntity } from '../entities/modifier.entity';
import { ModifierGroupResponseDto, ModifierOptionResponseDto } from '../dto';

export class ModifierMapper {
  static groupToEntity(row: ModifierGroup): ModifierGroupEntity {
    const e = new ModifierGroupEntity();
    Object.assign(e, {
      ...row,
      translations: (row.translations as Record<string, string> | null) ?? null,
    });
    return e;
  }

  static optionToEntity(row: ModifierOption): ModifierOptionEntity {
    const e = new ModifierOptionEntity();
    Object.assign(e, {
      ...row,
      price: row.price.toString(),
      translations: (row.translations as Record<string, string> | null) ?? null,
    });
    return e;
  }

  static optionToResponse(o: ModifierOptionEntity): ModifierOptionResponseDto {
    return {
      id: o.id,
      name: o.name,
      price: o.price,
      displayOrder: o.displayOrder,
      isAvailable: o.isAvailable,
      isDefault: o.isDefault,
    };
  }

  static groupToResponse(
    g: ModifierGroupEntity,
    options: ModifierOptionEntity[],
  ): ModifierGroupResponseDto {
    return {
      id: g.id,
      name: g.name,
      description: g.description ?? null,
      minSelection: g.minSelection,
      maxSelection: g.maxSelection,
      isRequired: g.isRequired,
      allowMultiple: g.allowMultiple,
      displayOrder: g.displayOrder,
      isAvailable: g.isAvailable,
      options: options.map(ModifierMapper.optionToResponse),
    };
  }
}
