import type { SearchStoresDto } from '../../dto';
import type { StoreEntity, StoreHoursEntity } from '../../entities/store.entity';

export const STORE_REPOSITORY = Symbol('STORE_REPOSITORY');

export interface StoreWithHours {
  store: StoreEntity;
  hours: StoreHoursEntity[];
}

export interface IStoreRepository {
  list(): Promise<StoreEntity[]>;
  findById(id: string): Promise<StoreEntity | null>;
  findByPetpoojaRestId(restId: string): Promise<StoreEntity | null>;
  search(input: SearchStoresDto): Promise<StoreEntity[]>;
  hoursFor(storeId: string): Promise<StoreHoursEntity[]>;
  withHours(storeId: string): Promise<StoreWithHours | null>;
}
