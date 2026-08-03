import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { UsersModule } from '@modules/users';
import { RolesGuard } from '@common/guards';
import type { JwtConfig } from '@config/jwt.config';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshTokenStrategy } from './strategies/refresh-token.strategy';
import { OtpRequestPrismaRepository } from './repositories/prisma/otp-request.prisma-repository';
import { RefreshTokenPrismaRepository } from './repositories/prisma/refresh-token.prisma-repository';
import {
  OTP_REQUEST_REPOSITORY,
  REFRESH_TOKEN_REPOSITORY,
} from './repositories/interfaces/auth-repository.interface';
import { OTP_PROVIDER } from './interfaces/otp-provider.interface';
import { SmsOtpProvider } from './providers/sms-otp.provider';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const cfg = config.getOrThrow<JwtConfig>('jwt');
        return {
          secret: cfg.accessSecret,
          signOptions: { expiresIn: cfg.accessTtl, issuer: cfg.issuer, audience: cfg.audience },
        };
      },
    }),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    RefreshTokenStrategy,
    OtpRequestPrismaRepository,
    RefreshTokenPrismaRepository,
    SmsOtpProvider,
    { provide: OTP_PROVIDER, useClass: SmsOtpProvider },
    { provide: OTP_REQUEST_REPOSITORY, useExisting: OtpRequestPrismaRepository },
    { provide: REFRESH_TOKEN_REPOSITORY, useExisting: RefreshTokenPrismaRepository },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
