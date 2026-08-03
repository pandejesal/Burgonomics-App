import { Module } from '@nestjs/common';
import { OffersController } from './controllers/offers.controller';
import { OffersService } from './services/offers.service';
import { OfferPrismaRepository } from './repositories/prisma/offer.prisma-repository';
import { OFFER_REPOSITORY } from './repositories/interfaces/offer-repository.interface';

@Module({
  controllers: [OffersController],
  providers: [
    OffersService,
    OfferPrismaRepository,
    { provide: OFFER_REPOSITORY, useExisting: OfferPrismaRepository },
  ],
  exports: [OffersService, OFFER_REPOSITORY],
})
export class OffersModule {}
