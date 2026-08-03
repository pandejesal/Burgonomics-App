import { Module } from '@nestjs/common';
import { StoresController } from './controllers/stores.controller';
import { StoresService } from './services/stores.service';
import { StorePrismaRepository } from './repositories/prisma/store.prisma-repository';
import { STORE_REPOSITORY } from './repositories/interfaces/store-repository.interface';

@Module({
  controllers: [StoresController],
  providers: [
    StoresService,
    StorePrismaRepository,
    { provide: STORE_REPOSITORY, useExisting: StorePrismaRepository },
  ],
  exports: [StoresService, STORE_REPOSITORY],
})
export class StoresModule {}
