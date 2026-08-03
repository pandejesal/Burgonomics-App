import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './env.validation';
import appConfig from './app.config';
import databaseConfig from './database.config';
import redisConfig from './redis.config';
import cacheConfig from './cache.config';
import bullmqConfig from './bullmq.config';
import jwtConfig from './jwt.config';
import securityConfig from './security.config';
import rateLimitConfig from './rate-limit.config';
import petpoojaConfig from './petpooja.config';
import razorpayConfig from './razorpay.config';
import firebaseConfig from './firebase.config';
import storageConfig from './storage.config';
import featureFlagsConfig from './feature-flags.config';
import observabilityConfig from './observability.config';
import swaggerConfig from './swagger.config';

/**
 * Global configuration module.
 *
 * Loads and validates every runtime env var via Zod, then exposes
 * strongly-typed namespaces via `ConfigService.getOrThrow<T>('ns')`.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      envFilePath: [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env'],
      validate: (raw) => validateEnv(raw),
      load: [
        appConfig,
        databaseConfig,
        redisConfig,
        cacheConfig,
        bullmqConfig,
        jwtConfig,
        securityConfig,
        rateLimitConfig,
        petpoojaConfig,
        razorpayConfig,
        firebaseConfig,
        storageConfig,
        featureFlagsConfig,
        observabilityConfig,
        swaggerConfig,
      ],
    }),
  ],
})
export class ConfigurationModule {}
