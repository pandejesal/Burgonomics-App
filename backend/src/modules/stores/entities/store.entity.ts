export type StoreStatusValue = 'OPEN' | 'CLOSED' | 'PAUSED';

export class StoreEntity {
  id!: string;
  petpoojaRestId!: string;
  name!: string;
  address!: string;
  city!: string;
  state!: string;
  pincode!: string;
  country!: string;
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status!: StoreStatusValue;
  turnOnAt?: Date | null;
  minPrepMinutes?: number | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export class StoreHoursEntity {
  id!: string;
  storeId!: string;
  dayOfWeek!: number;
  openTime!: string;
  closeTime!: string;
}
