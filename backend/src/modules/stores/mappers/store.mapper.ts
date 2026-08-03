import type { Store, StoreHours } from '@prisma/client';
import { StoreEntity, StoreHoursEntity } from '../entities/store.entity';
import { StoreResponseDto, StoreHoursResponseDto } from '../dto';

export class StoreMapper {
  static toEntity(row: Store): StoreEntity {
    const e = new StoreEntity();
    Object.assign(e, row, { status: row.status as StoreEntity['status'] });
    return e;
  }

  static hoursToEntity(row: StoreHours): StoreHoursEntity {
    const e = new StoreHoursEntity();
    Object.assign(e, row);
    return e;
  }

  static toResponse(
    e: StoreEntity,
    hours: StoreHoursEntity[] = [],
    distanceKm?: number,
  ): StoreResponseDto {
    return {
      id: e.id,
      name: e.name,
      address: e.address,
      city: e.city,
      state: e.state,
      pincode: e.pincode,
      country: e.country,
      phone: e.phone ?? null,
      latitude: e.latitude ?? null,
      longitude: e.longitude ?? null,
      status: e.status,
      turnOnAt: e.turnOnAt?.toISOString() ?? null,
      minPrepMinutes: e.minPrepMinutes ?? null,
      hours: hours.map((h): StoreHoursResponseDto => ({
        dayOfWeek: h.dayOfWeek,
        openTime: h.openTime,
        closeTime: h.closeTime,
      })),
      distanceKm,
    };
  }
}
