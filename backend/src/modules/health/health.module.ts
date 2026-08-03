import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './controllers/health.controller';
import { DatabaseHealthIndicator } from './indicators/database.indicator';
import { RedisHealthIndicator } from './indicators/redis.indicator';
import { PetpoojaHealthIndicator } from './indicators/petpooja.indicator';
import { RazorpayHealthIndicator } from './indicators/razorpay.indicator';
import { FirebaseHealthIndicator } from './indicators/firebase.indicator';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [
    DatabaseHealthIndicator,
    RedisHealthIndicator,
    PetpoojaHealthIndicator,
    RazorpayHealthIndicator,
    FirebaseHealthIndicator,
  ],
  exports: [
    TerminusModule,
    DatabaseHealthIndicator,
    RedisHealthIndicator,
    PetpoojaHealthIndicator,
    RazorpayHealthIndicator,
    FirebaseHealthIndicator,
  ],
})
export class HealthModule {}
