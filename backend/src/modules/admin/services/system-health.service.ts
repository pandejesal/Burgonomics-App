import { Injectable } from '@nestjs/common';
import { HealthCheckService } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from '@modules/health/indicators/database.indicator';
import { RedisHealthIndicator } from '@modules/health/indicators/redis.indicator';
import { PetpoojaHealthIndicator } from '@modules/health/indicators/petpooja.indicator';
import { RazorpayHealthIndicator } from '@modules/health/indicators/razorpay.indicator';
import { FirebaseHealthIndicator } from '@modules/health/indicators/firebase.indicator';

@Injectable()
export class SystemHealthService {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: DatabaseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly petpooja: PetpoojaHealthIndicator,
    private readonly razorpay: RazorpayHealthIndicator,
    private readonly firebase: FirebaseHealthIndicator,
  ) {}

  overall() {
    return this.health.check([
      () => this.db.isHealthy('database'),
      () => this.redis.isHealthy('redis'),
      () => this.petpooja.isHealthy('petpooja'),
      () => this.razorpay.isHealthy('razorpay'),
      () => this.firebase.isHealthy('firebase'),
    ]);
  }
}
