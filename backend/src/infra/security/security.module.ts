import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { HashService } from './hash.service';
import { HmacService } from './hmac.service';
import { TokenService } from './token.service';
import type { RateLimitConfig } from '@config/rate-limit.config';

@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const rateLimit = config.getOrThrow<RateLimitConfig>('rateLimit');
        return [
          {
            ttl: rateLimit.ttlSeconds * 1000,
            limit: rateLimit.max,
          },
        ];
      },
    }),
  ],
  providers: [
    HashService,
    HmacService,
    TokenService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [HashService, HmacService, TokenService, ThrottlerModule],
})
export class SecurityModule {}
