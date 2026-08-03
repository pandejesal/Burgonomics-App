import { Module } from '@nestjs/common';
import { CheckoutController } from './controllers/checkout.controller';
import { CheckoutService } from './services/checkout.service';
import { CheckoutValidatorService } from './services/checkout-validator.service';
import { CheckoutPrismaRepository } from './repositories/prisma/checkout.prisma-repository';
import { CHECKOUT_REPOSITORY } from './repositories/interfaces/checkout-repository.interface';
import { CartModule } from '@modules/cart/cart.module';
import { PricingModule } from '@modules/pricing/pricing.module';
import { CouponsModule } from '@modules/coupons/coupons.module';
import { OrdersModule } from '@modules/orders/orders.module';
import { StoresModule } from '@modules/stores/stores.module';

@Module({
  imports: [CartModule, PricingModule, CouponsModule, OrdersModule, StoresModule],
  controllers: [CheckoutController],
  providers: [
    CheckoutService,
    CheckoutValidatorService,
    CheckoutPrismaRepository,
    { provide: CHECKOUT_REPOSITORY, useExisting: CheckoutPrismaRepository },
  ],
  exports: [CheckoutService, CheckoutValidatorService, CHECKOUT_REPOSITORY],
})
export class CheckoutModule {}
