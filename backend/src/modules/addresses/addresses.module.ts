import { Module } from '@nestjs/common';
import { AddressesController } from './controllers/addresses.controller';
import { AddressesService } from './services/addresses.service';
import { AddressPrismaRepository } from './repositories/prisma/address.prisma-repository';
import { ADDRESS_REPOSITORY } from './repositories/interfaces/address-repository.interface';

@Module({
  controllers: [AddressesController],
  providers: [
    AddressesService,
    AddressPrismaRepository,
    { provide: ADDRESS_REPOSITORY, useExisting: AddressPrismaRepository },
  ],
  exports: [AddressesService, ADDRESS_REPOSITORY],
})
export class AddressesModule {}
