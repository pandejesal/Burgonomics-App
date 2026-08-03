import { Module } from '@nestjs/common';
import { PricingEngineService } from './services/pricing-engine.service';

@Module({
  providers: [PricingEngineService],
  exports: [PricingEngineService],
})
export class PricingModule {}
