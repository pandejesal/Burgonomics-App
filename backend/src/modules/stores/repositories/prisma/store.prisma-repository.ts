import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import type { SearchStoresDto } from '../../dto';
import type { StoreEntity, StoreHoursEntity } from '../../entities/store.entity';
import { StoreMapper } from '../../mappers/store.mapper';
import type { IStoreRepository, StoreWithHours } from '../interfaces/store-repository.interface';

@Injectable()
export class StorePrismaRepository implements IStoreRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<StoreEntity[]> {
    const rows = await this.prisma.store.findMany({ orderBy: { name: 'asc' } });
    return rows.map(StoreMapper.toEntity);
  }

  async findById(id: string): Promise<StoreEntity | null> {
    const row = await this.prisma.store.findUnique({ where: { id } });
    return row ? StoreMapper.toEntity(row) : null;
  }

  async findByPetpoojaRestId(restId: string): Promise<StoreEntity | null> {
    const row = await this.prisma.store.findUnique({ where: { petpoojaRestId: restId } });
    return row ? StoreMapper.toEntity(row) : null;
  }

  async search(input: SearchStoresDto): Promise<StoreEntity[]> {
    const where: Prisma.StoreWhereInput = {};
    if (input.query) {
      where.OR = [
        { name: { contains: input.query, mode: 'insensitive' } },
        { address: { contains: input.query, mode: 'insensitive' } },
      ];
    }
    if (input.city) where.city = { equals: input.city, mode: 'insensitive' };
    const rows = await this.prisma.store.findMany({ where, orderBy: { name: 'asc' } });
    return rows.map(StoreMapper.toEntity);
  }

  async hoursFor(storeId: string): Promise<StoreHoursEntity[]> {
    const rows = await this.prisma.storeHours.findMany({
      where: { storeId },
      orderBy: [{ dayOfWeek: 'asc' }, { openTime: 'asc' }],
    });
    return rows.map(StoreMapper.hoursToEntity);
  }

  async withHours(storeId: string): Promise<StoreWithHours | null> {
    const row = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: { hours: { orderBy: [{ dayOfWeek: 'asc' }, { openTime: 'asc' }] } },
    });
    if (!row) return null;
    return {
      store: StoreMapper.toEntity(row),
      hours: row.hours.map(StoreMapper.hoursToEntity),
    };
  }
}
