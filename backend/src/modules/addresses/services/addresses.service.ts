import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundError } from '@common/errors';
import type { CreateAddressDto, UpdateAddressDto } from '../dto';
import type { AddressEntity } from '../entities/address.entity';
import { ADDRESS_EVENTS } from '../events/address.events';
import {
  ADDRESS_REPOSITORY,
  type IAddressRepository,
} from '../repositories/interfaces/address-repository.interface';

@Injectable()
export class AddressesService {
  constructor(
    @Inject(ADDRESS_REPOSITORY) private readonly repo: IAddressRepository,
    private readonly events: EventEmitter2,
  ) {}

  list(userId: string): Promise<AddressEntity[]> {
    return this.repo.list(userId);
  }

  async get(userId: string, id: string): Promise<AddressEntity> {
    const a = await this.repo.findById(userId, id);
    if (!a) throw new NotFoundError('Address not found');
    return a;
  }

  async create(userId: string, input: CreateAddressDto): Promise<AddressEntity> {
    const a = await this.repo.create(userId, input);
    this.events.emit(ADDRESS_EVENTS.CREATED, { userId, addressId: a.id });
    return a;
  }

  async update(userId: string, id: string, patch: UpdateAddressDto): Promise<AddressEntity> {
    const a = await this.repo.update(userId, id, patch);
    this.events.emit(ADDRESS_EVENTS.UPDATED, { userId, addressId: a.id });
    return a;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.repo.delete(userId, id);
    this.events.emit(ADDRESS_EVENTS.DELETED, { userId, addressId: id });
  }

  async setDefault(userId: string, id: string): Promise<AddressEntity> {
    const a = await this.repo.setDefault(userId, id);
    this.events.emit(ADDRESS_EVENTS.DEFAULT_CHANGED, { userId, addressId: a.id });
    return a;
  }
}
