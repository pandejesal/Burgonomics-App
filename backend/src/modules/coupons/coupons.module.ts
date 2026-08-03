import { Module } from '@nestjs/common';
import { CouponsController } from './controllers/coupons.controller';
import { CouponsService } from './services/coupons.service';
import { CouponValidatorService } from './services/coupon-validator.service';
import { CouponPrismaRepository } from './repositories/prisma/coupon.prisma-repository';
import { COUPON_REPOSITORY } from './repositories/interfaces/coupon-repository.interface';
import { CartModule } from '@modules/cart/cart.module';

@Module({
  imports: [CartModule],
  controllers: [CouponsController],
  providers: [
    CouponsService,
    CouponValidatorService,
    CouponPrismaRepository,
    { provide: COUPON_REPOSITORY, useExisting: CouponPrismaRepository },
  ],
  exports: [CouponsService, CouponValidatorService, COUPON_REPOSITORY],
})
export class CouponsModule {}
