import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import { NotFoundError } from '@common/errors';
import type { CreateAddressDto, UpdateAddressDto } from '../../dto';
import type { AddressEntity } from '../../entities/address.entity';
import { AddressMapper } from '../../mappers/address.mapper';
import type { IAddressRepository } from '../interfaces/address-repository.interface';

@Injectable()
export class AddressPrismaRepository implements IAddressRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<AddressEntity[]> {
    const rows = await this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
    return rows.map(AddressMapper.toEntity);
  }

  async findById(userId: string, id: string): Promise<AddressEntity | null> {
    const row = await this.prisma.address.findFirst({ where: { id, userId } });
    return row ? AddressMapper.toEntity(row) : null;
  }

  async create(userId: string, input: CreateAddressDto): Promise<AddressEntity> {
    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }
      const row = await tx.address.create({ data: { ...input, userId } });
      return AddressMapper.toEntity(row);
    });
  }

  async update(userId: string, id: string, patch: UpdateAddressDto): Promise<AddressEntity> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.address.findFirst({ where: { id, userId } });
      if (!existing) throw new NotFoundError('Address not found');
      if (patch.isDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        });
      }
      const row = await tx.address.update({ where: { id }, data: patch });
      return AddressMapper.toEntity(row);
    });
  }

  async delete(userId: string, id: string): Promise<void> {
    const res = await this.prisma.address.deleteMany({ where: { id, userId } });
    if (res.count === 0) throw new NotFoundError('Address not found');
  }

  async setDefault(userId: string, id: string): Promise<AddressEntity> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.address.findFirst({ where: { id, userId } });
      if (!existing) throw new NotFoundError('Address not found');
      await tx.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
      const row = await tx.address.update({ where: { id }, data: { isDefault: true } });
      return AddressMapper.toEntity(row);
    });
  }
}
