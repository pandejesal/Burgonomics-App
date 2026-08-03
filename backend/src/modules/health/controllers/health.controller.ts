import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { DatabaseHealthIndicator } from '../indicators/database.indicator';
import { RedisHealthIndicator } from '../indicators/redis.indicator';
import { PetpoojaHealthIndicator } from '../indicators/petpooja.indicator';
import { RazorpayHealthIndicator } from '../indicators/razorpay.indicator';
import { FirebaseHealthIndicator } from '../indicators/firebase.indicator';

@ApiTags('Health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: DatabaseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly petpooja: PetpoojaHealthIndicator,
    private readonly razorpay: RazorpayHealthIndicator,
    private readonly firebase: FirebaseHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Aggregate liveness + readiness' })
  check() {
    return this.health.check([
      () => this.db.isHealthy('database'),
      () => this.redis.isHealthy('redis'),
    ]);
  }

  @Get('liveness')
  @ApiOperation({ summary: 'Liveness — process is up' })
  liveness() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('readiness')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness — core dependencies reachable' })
  readiness() {
    return this.health.check([
      () => this.db.isHealthy('database'),
      () => this.redis.isHealthy('redis'),
    ]);
  }

  @Get('database')
  @HealthCheck()
  database() {
    return this.health.check([() => this.db.isHealthy('database')]);
  }

  @Get('redis')
  @HealthCheck()
  redisCheck() {
    return this.health.check([() => this.redis.isHealthy('redis')]);
  }

  @Get('petpooja')
  @HealthCheck()
  petpoojaCheck() {
    return this.health.check([() => this.petpooja.isHealthy('petpooja')]);
  }

  @Get('razorpay')
  @HealthCheck()
  razorpayCheck() {
    return this.health.check([() => this.razorpay.isHealthy('razorpay')]);
  }

  @Get('firebase')
  @HealthCheck()
  firebaseCheck() {
    return this.health.check([() => this.firebase.isHealthy('firebase')]);
  }
}
