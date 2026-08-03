import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import { UsersService } from '@modules/users';
import { Role } from '@common/enums';
import { RedisService } from '@infra/redis/redis.service';
import { MetricsService } from '@infra/observability/metrics/metrics.service';
import type { JwtConfig } from '@config/jwt.config';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';
import type { OtpChallengeDto, TokenPairDto } from '../dto';
import { AUTH_EVENTS } from '../events/auth.events';
import {
  IOtpRequestRepository,
  IRefreshTokenRepository,
  OTP_REQUEST_REPOSITORY,
  REFRESH_TOKEN_REPOSITORY,
} from '../repositories/interfaces/auth-repository.interface';
import { OTP_PROVIDER, OtpProvider } from '../interfaces/otp-provider.interface';
import type { OtpPurposeValue } from '../entities/auth.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
    @Inject(OTP_REQUEST_REPOSITORY)
    private readonly otpRequests: IOtpRequestRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: IRefreshTokenRepository,
    @Inject(OTP_PROVIDER)
    private readonly otpProvider: OtpProvider,
  ) {}

  async requestOtp(
    phone: string,
    purpose: 'LOGIN' | 'PHONE_CHANGE' | 'ACCOUNT_RECOVERY' = 'LOGIN',
  ): Promise<OtpChallengeDto> {
    // 1. Phone Format Validation
    if (!phone || !/^[6-9]\d{9}$/.test(phone.replace('+91', ''))) {
      throw new BadRequestException('Enter a valid 10-digit mobile number.');
    }

    const resendWindowSec = 30;
    const limitWindowSec = 900; // 15 mins
    const maxRequests = 3;

    // 2. Cooldown check
    const cooldownKey = `cooldown:${phone}`;
    const cooldownExists = await this.redis.client.get(cooldownKey);
    if (cooldownExists) {
      throw new BadRequestException(`Please wait ${resendWindowSec} seconds before resending.`);
    }

    // 3. Request count limit check (Max 3 within 15 minutes)
    const countKey = `req_count:${phone}`;
    const requestCount = await this.redis.client.get(countKey);
    const pCount = requestCount ? parseInt(requestCount, 10) : 0;
    if (pCount >= maxRequests) {
      throw new BadRequestException('Too many OTP requests. Please try again after 15 minutes.');
    }

    // 4. Generate random 6-digit OTP
    const code = crypto.randomInt(100000, 1000000).toString();
    const codeHash = crypto.createHash('sha256').update(`${code}:${phone}`).digest('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // 5. Save OTP Challenge to PostgreSQL
    const challenge = await this.otpRequests.create({
      phone,
      codeHash,
      purpose: purpose as OtpPurposeValue,
      expiresAt,
    });

    // 6. Save challenge state to Redis with 5-minute TTL
    const redisChallenge = {
      phone,
      codeHash,
      expiresAt: expiresAt.getTime(),
      attempts: 0,
    };
    await this.redis.client.set(`otp:${challenge.id}`, JSON.stringify(redisChallenge), 'EX', 300);

    // 7. Update Cooldown & Limit Counters
    await Promise.all([
      this.redis.client.set(cooldownKey, '1', 'EX', resendWindowSec),
      this.redis.client.incr(countKey),
    ]);

    const countTtl = await this.redis.client.ttl(countKey);
    if (countTtl < 0) {
      await this.redis.client.expire(countKey, limitWindowSec);
    }

    // 8. Deliver via interchangeable SMS gateway
    await this.otpProvider.send({
      phone,
      code,
      purpose,
    });

    this.metrics.otpRequests.inc({
      provider: this.config.get<string>('SMS_PROVIDER') ?? 'unknown',
      channel: purpose === 'LOGIN' ? 'sms' : 'whatsapp',
      purpose,
    });

    return {
      challengeId: challenge.id,
      expiresAt: expiresAt.toISOString(),
      resendAfterSeconds: resendWindowSec,
    };
  }

  async verifyOtp(phone: string, code: string): Promise<TokenPairDto> {
    // 1. Fetch the latest active challenge for this phone number
    const challengeRow = await this.otpRequests.findLatestActive(phone, 'LOGIN');
    if (!challengeRow) {
      this.metrics.otpVerifications.inc({ status: 'failed_no_active_challenge' });
      throw new UnauthorizedException('No active OTP challenge found or session expired.');
    }

    // 2. Load attempts/cooldown state from Redis to prevent database load
    const redisKey = `otp:${challengeRow.id}`;
    const redisData = await this.redis.client.get(redisKey);
    let attempts = challengeRow.attempts;

    if (redisData) {
      const parsed = JSON.parse(redisData);
      attempts = parsed.attempts;
    }

    const maxAttempts = 5;
    if (attempts >= maxAttempts) {
      await this.redis.client.del(redisKey);
      this.metrics.otpVerifications.inc({ status: 'failed_too_many_attempts' });
      throw new UnauthorizedException(
        'Too many verification attempts. This OTP has been invalidated.',
      );
    }

    // 3. Compare code hashes
    const inputHash = crypto.createHash('sha256').update(`${code}:${phone}`).digest('hex');
    const isCorrect = inputHash === challengeRow.codeHash;

    if (!isCorrect) {
      // Increment attempt
      const newAttempts = attempts + 1;
      await this.otpRequests.incrementAttempts(challengeRow.id);

      if (redisData) {
        const parsed = JSON.parse(redisData);
        parsed.attempts = newAttempts;
        await this.redis.client.set(redisKey, JSON.stringify(parsed), 'EX', 300);
      }

      if (newAttempts >= maxAttempts) {
        await this.redis.client.del(redisKey);
        this.metrics.otpVerifications.inc({ status: 'failed_attempts_exhausted' });
        throw new UnauthorizedException('Too many failed attempts. This OTP is now invalidated.');
      }

      this.metrics.otpVerifications.inc({ status: 'failed_incorrect_code' });
      throw new UnauthorizedException(
        `Incorrect code. ${maxAttempts - newAttempts} attempts remaining.`,
      );
    }

    // 4. Success -> Mark verified in DB, delete session from Redis
    await Promise.all([
      this.otpRequests.markVerified(challengeRow.id, new Date()),
      this.redis.client.del(redisKey),
    ]);

    this.metrics.otpVerifications.inc({ status: 'success' });

    // 5. Find or Create User
    let user = await this.users.findByPhone(phone);
    if (!user) {
      user = await this.users.create(phone);
    }

    // 6. Generate Token Pair
    const tokens = await this.generateTokenPair(user.id, phone, [Role.CUSTOMER]);

    this.events.emit(AUTH_EVENTS.LOGIN_SUCCEEDED, {
      userId: user.id,
      phone: user.phone,
      isNewUser: false,
    });

    return tokens;
  }

  async refresh(refreshToken: string): Promise<TokenPairDto> {
    const cfg = this.config.getOrThrow<JwtConfig>('jwt');

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: cfg.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const dbToken = await this.refreshTokens.findByHash(tokenHash);

    if (!dbToken || dbToken.revokedAt || new Date() > dbToken.expiresAt) {
      // SECURITY BREACH WARNING: If a revoked token is reused, perform emergency lockout
      if (dbToken && dbToken.revokedAt) {
        await this.refreshTokens.revokeAllForUser(dbToken.userId);
        throw new UnauthorizedException(
          'Security Alert: Compromised session detected. All sessions revoked.',
        );
      }
      throw new UnauthorizedException('Refresh token is invalid or has expired.');
    }

    // Revoke old token and rotate
    const user = await this.users.getById(dbToken.userId);
    const tokens = await this.generateTokenPair(user.id, user.phone, [Role.CUSTOMER]);

    const newTokenHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
    await this.refreshTokens.revoke(dbToken.id, newTokenHash);

    return tokens;
  }

  async logout(refreshToken?: string): Promise<void> {
    if (refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const dbToken = await this.refreshTokens.findByHash(tokenHash);
      if (dbToken) {
        await this.refreshTokens.revoke(dbToken.id);
        this.events.emit(AUTH_EVENTS.LOGGED_OUT, { userId: dbToken.userId });
        return;
      }
    }
    this.events.emit(AUTH_EVENTS.LOGGED_OUT, {});
  }

  async issueAccessToken(
    userId: string,
    phone: string,
    roles: Role[] = [Role.CUSTOMER],
  ): Promise<string> {
    const cfg = this.config.getOrThrow<JwtConfig>('jwt');
    const payload: JwtPayload = { sub: userId, phone, roles };
    return this.jwt.signAsync(payload, {
      secret: cfg.accessSecret,
      expiresIn: cfg.accessTtl,
      issuer: cfg.issuer,
      audience: cfg.audience,
    });
  }

  private async generateTokenPair(
    userId: string,
    phone: string,
    roles: Role[],
  ): Promise<TokenPairDto> {
    const cfg = this.config.getOrThrow<JwtConfig>('jwt');
    const accessToken = await this.issueAccessToken(userId, phone, roles);

    const refreshToken = await this.jwt.signAsync(
      { sub: userId, phone, roles },
      {
        secret: cfg.refreshSecret,
        expiresIn: cfg.refreshTtl,
        issuer: cfg.issuer,
        audience: cfg.audience,
      },
    );

    const refreshTtlMs = 30 * 24 * 60 * 60 * 1000; // 30 days
    const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    await this.refreshTokens.create({
      userId,
      tokenHash: refreshHash,
      expiresAt: new Date(Date.now() + refreshTtlMs),
    });

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      refreshTokenExpiresAt: new Date(Date.now() + refreshTtlMs).toISOString(),
    };
  }
}
