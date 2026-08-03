import type { CreateAddressDto, UpdateAddressDto } from '../../dto';
import type { AddressEntity } from '../../entities/address.entity';

export const ADDRESS_REPOSITORY = Symbol('ADDRESS_REPOSITORY');

export interface IAddressRepository {
  list(userId: string): Promise<AddressEntity[]>;
  findById(userId: string, id: string): Promise<AddressEntity | null>;
  create(userId: string, input: CreateAddressDto): Promise<AddressEntity>;
  update(userId: string, id: string, patch: UpdateAddressDto): Promise<AddressEntity>;
  delete(userId: string, id: string): Promise<void>;
  setDefault(userId: string, id: string): Promise<AddressEntity>;
}
