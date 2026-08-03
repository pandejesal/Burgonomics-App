import { Module } from '@nestjs/common';
import { OrdersController } from './controllers/orders.controller';
import { OrderTrackingController } from './controllers/order-tracking.controller';
import { OrdersService } from './services/orders.service';
import { OrderTrackingService } from './services/order-tracking.service';
import { InventoryValidatorService } from './services/inventory-validator.service';
import { OrderPrismaRepository } from './repositories/prisma/order.prisma-repository';
import { ORDER_REPOSITORY } from './repositories/interfaces/order-repository.interface';
import { ProductsModule } from '@modules/products/products.module';
import { StoresModule } from '@modules/stores/stores.module';

@Module({
  imports: [ProductsModule, StoresModule],
  controllers: [OrdersController, OrderTrackingController],
  providers: [
    OrdersService,
    OrderTrackingService,
    InventoryValidatorService,
    OrderPrismaRepository,
    { provide: ORDER_REPOSITORY, useExisting: OrderPrismaRepository },
  ],
  exports: [OrdersService, OrderTrackingService, InventoryValidatorService, ORDER_REPOSITORY],
})
export class OrdersModule {}
