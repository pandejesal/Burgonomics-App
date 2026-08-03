import type { Address } from '@prisma/client';
import { AddressEntity } from '../entities/address.entity';
import { AddressResponseDto } from '../dto';

export class AddressMapper {
  static toEntity(row: Address): AddressEntity {
    const e = new AddressEntity();
    Object.assign(e, row);
    return e;
  }

  static toResponse(e: AddressEntity): AddressResponseDto {
    return {
      id: e.id,
      label: e.label,
      line1: e.line1,
      line2: e.line2 ?? null,
      landmark: e.landmark ?? null,
      city: e.city,
      state: e.state,
      pincode: e.pincode,
      country: e.country,
      latitude: e.latitude ?? null,
      longitude: e.longitude ?? null,
      isDefault: e.isDefault,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }
}
