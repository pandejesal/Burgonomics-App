import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CategoriesModule } from '../categories/categories.module';
import { ProductsModule } from '../products/products.module';
import { ModifiersModule } from '../modifiers/modifiers.module';
import { OffersModule } from '../offers/offers.module';
import { MenuModule } from '../menu/menu.module';
import { PetpoojaModule } from '../petpooja/petpooja.module';
import { PetpoojaSyncService } from './services/petpooja-sync.service';
import { PetpoojaSyncScheduler } from './schedulers/petpooja-sync.scheduler';
import { PetpoojaSyncController } from './controllers/petpooja-sync.controller';
import { PetpoojaFetchConsumer } from './consumers/petpooja-fetch.consumer';
import { PetpoojaStockConsumer } from './consumers/petpooja-stock.consumer';
import { SyncLogPrismaRepository } from './repositories/prisma/sync-log.prisma-repository';
import { SYNC_LOG_REPOSITORY } from './repositories/interfaces/sync-log-repository.interface';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    CategoriesModule,
    ProductsModule,
    ModifiersModule,
    OffersModule,
    MenuModule,
    PetpoojaModule,
  ],
  controllers: [PetpoojaSyncController],
  providers: [
    PetpoojaSyncService,
    PetpoojaSyncScheduler,
    PetpoojaFetchConsumer,
    PetpoojaStockConsumer,
    SyncLogPrismaRepository,
    { provide: SYNC_LOG_REPOSITORY, useExisting: SyncLogPrismaRepository },
  ],
  exports: [PetpoojaSyncService],
})
export class PetpoojaSyncModule {}
