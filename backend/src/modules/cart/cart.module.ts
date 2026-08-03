import { Module } from '@nestjs/common';
import { CartController } from './controllers/cart.controller';
import { CartService } from './services/cart.service';
import { CartPrismaRepository } from './repositories/prisma/cart.prisma-repository';
import { CART_REPOSITORY } from './repositories/interfaces/cart-repository.interface';
import { ProductsModule } from '@modules/products/products.module';
import { ModifiersModule } from '@modules/modifiers/modifiers.module';
import { PricingModule } from '@modules/pricing/pricing.module';

@Module({
  imports: [ProductsModule, ModifiersModule, PricingModule],
  controllers: [CartController],
  providers: [
    CartService,
    CartPrismaRepository,
    { provide: CART_REPOSITORY, useExisting: CartPrismaRepository },
  ],
  exports: [CartService, CART_REPOSITORY],
})
export class CartModule {}
