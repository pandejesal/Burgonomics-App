import { Inject, Injectable, NotImplementedException } from '@nestjs/common';
import { NotFoundError } from '@common/errors';
import type { SearchStoresDto } from '../dto';
import type { StoreEntity } from '../entities/store.entity';
import {
  STORE_REPOSITORY,
  type IStoreRepository,
  type StoreWithHours,
} from '../repositories/interfaces/store-repository.interface';

@Injectable()
export class StoresService {
  constructor(@Inject(STORE_REPOSITORY) private readonly repo: IStoreRepository) {}

  list(): Promise<StoreEntity[]> {
    return this.repo.list();
  }

  search(input: SearchStoresDto): Promise<StoreEntity[]> {
    return this.repo.search(input);
  }

  async get(id: string): Promise<StoreWithHours> {
    const res = await this.repo.withHours(id);
    if (!res) throw new NotFoundError('Store not found');
    return res;
  }

  isOpen(store: StoreEntity, now: Date = new Date()): boolean {
    if (store.status !== 'OPEN') return false;
    if (store.turnOnAt && store.turnOnAt.getTime() > now.getTime()) return false;
    return true;
  }

  /**
   * Placeholder — geo-ranked nearest store lookup will be wired in a
   * later phase using PostGIS or an in-process haversine over cached
   * store coordinates.
   */
  async findNearest(_latitude: number, _longitude: number): Promise<StoreEntity> {
    throw new NotImplementedException('Nearest-store resolution not yet implemented');
  }
}
