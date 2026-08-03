import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import { RedisService } from '@infra/redis/redis.service';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { TOTP } from 'otplib';
const totpInstance = new TOTP();
const authenticator = {
  generateSecret: () => totpInstance.generateSecret(),
  keyuri: (label: string, issuer: string, secret: string) =>
    totpInstance.toURI({ secret, label, issuer }),
  verify: (opts: { token: string; secret: string }) =>
    totpInstance.verify(opts.token, { secret: opts.secret }),
};
import * as crypto from 'crypto';
import { MetricsService } from '@infra/observability/metrics/metrics.service';
import {
  AdminLoginDto,
  AdminTokenPairDto,
  Disable2FaDto,
  LoginChallengeDto,
  Setup2FaResponseDto,
  Verify2FaDto,
} from '../dto/admin-auth.dto';

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly metrics: MetricsService,
  ) {}

  private hashRefreshToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async login(dto: AdminLoginDto, ip: string, browser: string): Promise<LoginChallengeDto> {
    const admin = await this.prisma.adminUser.findUnique({
      where: { email: dto.email },
    });

    if (!admin || !admin.isActive) {
      // For security, do not disclose whether user exists or not
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await argon2.verify(admin.passwordHash, dto.password);
    if (!isPasswordValid) {
      this.metrics.adminLogins.inc({ status: 'failed_password' });
      await this.logAudit({
        adminId: admin.id,
        action: 'ADMIN_LOGIN_PASSWORD_FAILED',
        resource: 'auth',
        ip,
        browser,
        metadata: { email: dto.email },
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    // Default Developer password check: require change if it matches default BurgonomicsDev2026!
    // Or if lastLoginAt is null, they should change password.
    const requiresPasswordChange = admin.isDeveloper && admin.lastLoginAt === null;

    const challengeToken = crypto.randomBytes(32).toString('hex');
    const challengeKey = `admin_challenge:${challengeToken}`;

    await this.redis.client.set(
      challengeKey,
      JSON.stringify({
        adminId: admin.id,
        email: admin.email,
        step: 'PASSWORD_VERIFIED',
      }),
      'EX',
      300, // 5 minutes validity
    );

    await this.logAudit({
      adminId: admin.id,
      action: 'ADMIN_LOGIN_PASSWORD_SUCCESS',
      resource: 'auth',
      ip,
      browser,
    });

    return {
      challengeToken,
      email: admin.email,
      requires2Fa: admin.totpSecret !== null,
      requiresPasswordChange,
    };
  }

  async setup2Fa(adminId: string, email: string): Promise<Setup2FaResponseDto> {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      throw new BadRequestException('Admin user not found');
    }

    const secret = authenticator.generateSecret();
    const qrCodeUrl = authenticator.keyuri(email, 'Burgonomics Admin', secret);

    // Generate 8 recovery codes
    const recoveryCodes: string[] = [];
    for (let i = 0; i < 8; i++) {
      recoveryCodes.push(crypto.randomBytes(4).toString('hex').toLowerCase()); // 8-character hex
    }

    // Save temporarily in redis to avoid incomplete setup lockouts
    await this.redis.client.set(`admin_2fa_setup:${adminId}`, secret, 'EX', 600); // 10 minutes
    await this.redis.client.set(
      `admin_2fa_recovery_setup:${adminId}`,
      recoveryCodes.join(','),
      'EX',
      600,
    );

    await this.logAudit({
      adminId,
      action: 'ADMIN_2FA_SETUP_INITIATED',
      resource: 'auth',
    });

    return { secret, qrCodeUrl, recoveryCodes };
  }

  async verifySetup2Fa(adminId: string, code: string): Promise<{ success: boolean }> {
    const secret = await this.redis.client.get(`admin_2fa_setup:${adminId}`);
    if (!secret) {
      throw new BadRequestException('2FA setup session expired. Please initiate setup again.');
    }

    const isValid = authenticator.verify({ token: code, secret });
    if (!isValid) {
      throw new BadRequestException('Invalid verification code');
    }

    // Fetch recovery codes
    const recoveryCodesStr = await this.redis.client.get(`admin_2fa_recovery_setup:${adminId}`);
    const fullTotpSecret = recoveryCodesStr ? `${secret}|${recoveryCodesStr}` : secret;

    await this.prisma.adminUser.update({
      where: { id: adminId },
      data: { totpSecret: fullTotpSecret },
    });

    await this.redis.client.del(`admin_2fa_setup:${adminId}`);
    await this.redis.client.del(`admin_2fa_recovery_setup:${adminId}`);

    await this.logAudit({
      adminId,
      action: 'ADMIN_2FA_SETUP_SUCCESS',
      resource: 'auth',
    });

    return { success: true };
  }

  async verify2Fa(dto: Verify2FaDto, ip: string, browser: string): Promise<AdminTokenPairDto> {
    if (!dto.challengeToken) {
      throw new BadRequestException('Challenge token is required');
    }

    const challengeKey = `admin_challenge:${dto.challengeToken}`;
    const challengeDataStr = await this.redis.client.get(challengeKey);
    if (!challengeDataStr) {
      throw new UnauthorizedException('Challenge session expired or invalid');
    }

    const challenge = JSON.parse(challengeDataStr);
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: challenge.adminId },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('Admin user not found or inactive');
    }

    if (admin.totpSecret) {
      let secret = admin.totpSecret;
      let recoveryCodes: string[] = [];
      if (admin.totpSecret.includes('|')) {
        const parts = admin.totpSecret.split('|');
        secret = parts[0];
        recoveryCodes = parts[1].split(',').filter(Boolean);
      }

      const lowerCode = dto.code.toLowerCase().trim();
      const matchedRecoveryIndex = recoveryCodes.indexOf(lowerCode);

      if (matchedRecoveryIndex !== -1) {
        // Recovery Code match!
        recoveryCodes.splice(matchedRecoveryIndex, 1);
        const newTotpSecret =
          recoveryCodes.length > 0 ? `${secret}|${recoveryCodes.join(',')}` : secret;

        await this.prisma.adminUser.update({
          where: { id: admin.id },
          data: { totpSecret: newTotpSecret },
        });

        await this.logAudit({
          adminId: admin.id,
          action: 'ADMIN_LOGIN_RECOVERY_CODE_SUCCESS',
          resource: 'auth',
          ip,
          browser,
        });
      } else {
        // Fallback to standard TOTP verification
        const isTotpValid = authenticator.verify({
          token: dto.code,
          secret: secret,
        });

        if (!isTotpValid) {
          this.metrics.adminLogins.inc({ status: 'failed_2fa' });
          await this.logAudit({
            adminId: admin.id,
            action: 'ADMIN_2FA_VERIFICATION_FAILED',
            resource: 'auth',
            ip,
            browser,
          });
          throw new UnauthorizedException('Invalid 2FA code');
        }
      }
    } else {
      // User is logging in first time without 2FA
      // In a strict production system, Super Admin / Dev can login but must be urged to setup 2FA
    }

    // Clean up challenge
    await this.redis.client.del(challengeKey);

    // Update login audit times
    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        lastLoginAt: new Date(),
        lastSeenAt: new Date(),
      },
    });

    // Generate tokens
    const tokens = await this.generateAdminTokens(admin);

    // Create session
    await this.createSession({
      adminId: admin.id,
      refreshToken: tokens.refreshToken,
      ip,
      browser,
    });

    this.metrics.adminLogins.inc({ status: 'success' });

    await this.logAudit({
      adminId: admin.id,
      action: 'ADMIN_LOGIN_COMPLETE',
      resource: 'auth',
      ip,
      browser,
    });

    return {
      ...tokens,
      admin: {
        id: admin.id,
        email: admin.email,
        fullName: admin.fullName,
        avatar: admin.avatar,
        role: {
          name: admin.role.name,
          permissions: admin.role.permissions.map((p) => p.permission.key),
        },
      },
    };
  }

  async disable2Fa(adminId: string, dto: Disable2FaDto): Promise<{ success: boolean }> {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
    });

    if (!admin || !admin.totpSecret) {
      throw new BadRequestException('2FA is not enabled for this account');
    }

    let secret = admin.totpSecret;
    let recoveryCodes: string[] = [];
    if (admin.totpSecret.includes('|')) {
      const parts = admin.totpSecret.split('|');
      secret = parts[0];
      recoveryCodes = parts[1].split(',').filter(Boolean);
    }

    const lowerCode = dto.code.toLowerCase().trim();
    const isRecoveryMatch = recoveryCodes.includes(lowerCode);
    const isTotpValid =
      isRecoveryMatch ||
      authenticator.verify({
        token: dto.code,
        secret: secret,
      });

    if (!isTotpValid) {
      throw new BadRequestException('Invalid verification code');
    }

    await this.prisma.adminUser.update({
      where: { id: adminId },
      data: { totpSecret: null },
    });

    await this.logAudit({
      adminId,
      action: 'ADMIN_2FA_DISABLED',
      resource: 'auth',
    });

    return { success: true };
  }

  async changePassword(
    adminId: string,
    oldPass: string,
    newPass: string,
  ): Promise<{ success: boolean }> {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      throw new BadRequestException('Admin user not found');
    }

    const isOldValid = await argon2.verify(admin.passwordHash, oldPass);
    if (!isOldValid) {
      throw new BadRequestException('Current password does not match');
    }

    const hashedNew = await argon2.hash(newPass);
    await this.prisma.adminUser.update({
      where: { id: adminId },
      data: { passwordHash: hashedNew },
    });

    await this.logAudit({
      adminId,
      action: 'ADMIN_PASSWORD_CHANGED',
      resource: 'auth',
    });

    return { success: true };
  }

  async forceDeveloperPasswordChange(
    challengeToken: string,
    oldPass: string,
    newPass: string,
  ): Promise<{ success: boolean }> {
    const challengeKey = `admin_challenge:${challengeToken}`;
    const challengeDataStr = await this.redis.client.get(challengeKey);
    if (!challengeDataStr) {
      throw new BadRequestException('Session expired');
    }

    const challenge = JSON.parse(challengeDataStr);
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: challenge.adminId },
    });

    if (!admin) {
      throw new BadRequestException('Admin user not found');
    }

    const isOldValid = await argon2.verify(admin.passwordHash, oldPass);
    if (!isOldValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const hashedNew = await argon2.hash(newPass);
    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        passwordHash: hashedNew,
        lastLoginAt: new Date(), // Set so the requirements check clears
      },
    });

    await this.logAudit({
      adminId: admin.id,
      action: 'ADMIN_PASSWORD_CHANGED_FORCE',
      resource: 'auth',
    });

    return { success: true };
  }

  async refresh(
    token: string,
    ip: string,
    browser: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = this.hashRefreshToken(token);
    const session = await this.prisma.adminSession.findUnique({
      where: { refreshTokenHash: tokenHash },
      include: {
        admin: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        // Token is expired, delete session
        await this.prisma.adminSession.delete({ where: { id: session.id } });
      }
      throw new UnauthorizedException('Refresh token is expired or invalid');
    }

    const admin = session.admin;
    if (!admin.isActive) {
      throw new UnauthorizedException('Admin account is deactivated');
    }

    // Rotate refresh token
    const tokens = await this.generateAdminTokens(admin);
    const newHash = this.hashRefreshToken(tokens.refreshToken);

    await this.prisma.adminSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: newHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Refresh 7 days TTL
        lastSeenAt: new Date(),
        ip,
        browser,
      },
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async logout(token: string): Promise<void> {
    const tokenHash = this.hashRefreshToken(token);
    const session = await this.prisma.adminSession.findUnique({
      where: { refreshTokenHash: tokenHash },
    });

    if (session) {
      await this.prisma.adminSession.delete({
        where: { id: session.id },
      });

      await this.logAudit({
        adminId: session.adminId,
        action: 'ADMIN_LOGOUT',
        resource: 'auth',
      });
    }
  }

  private async generateAdminTokens(admin: any) {
    const payload = {
      sub: admin.id,
      email: admin.email,
      role: admin.role.name,
      permissions: admin.role.permissions.map((p: any) => p.permission.key),
    };

    const accessSecret =
      process.env.ADMIN_JWT_ACCESS_SECRET || 'burgonomics-admin-access-secret-key-2026!';
    const refreshSecret =
      process.env.ADMIN_JWT_REFRESH_SECRET || 'burgonomics-admin-refresh-secret-key-2026!';

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: accessSecret,
        expiresIn: '15m',
      }),
      this.jwt.signAsync(payload, {
        secret: refreshSecret,
        expiresIn: '7d',
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async createSession(data: {
    adminId: string;
    refreshToken: string;
    ip: string;
    browser: string;
  }) {
    const tokenHash = this.hashRefreshToken(data.refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    let os = 'Unknown';
    let device = 'Desktop';
    let browserName = 'Unknown';

    if (data.browser) {
      const ua = data.browser.toLowerCase();
      if (ua.includes('firefox')) browserName = 'Firefox';
      else if (ua.includes('chrome')) browserName = 'Chrome';
      else if (ua.includes('safari')) browserName = 'Safari';
      else if (ua.includes('msie') || ua.includes('trident')) browserName = 'IE';

      if (ua.includes('windows')) os = 'Windows';
      else if (ua.includes('macintosh')) os = 'macOS';
      else if (ua.includes('linux')) os = 'Linux';
      else if (ua.includes('android')) {
        os = 'Android';
        device = 'Mobile';
      } else if (ua.includes('iphone') || ua.includes('ipad')) {
        os = 'iOS';
        device = 'Mobile';
      }
    }

    // Geo Login Alert check: compare with previous session
    try {
      const previousSession = await this.prisma.adminSession.findFirst({
        where: { adminId: data.adminId },
        orderBy: { lastSeenAt: 'desc' },
      });

      if (previousSession && previousSession.ip !== data.ip) {
        await this.logAudit({
          adminId: data.adminId,
          action: 'ADMIN_GEO_LOGIN_ALERT',
          resource: 'auth',
          ip: data.ip,
          browser: data.browser,
          metadata: {
            alertType: 'NEW_IP_LOCATION_DETECTED',
            previousIp: previousSession.ip,
            currentIp: data.ip,
            previousAgent: `${previousSession.os} / ${previousSession.browser}`,
            currentAgent: `${os} / ${browserName}`,
          },
        });
      }
    } catch (err) {
      this.logger.error('Failed to execute Geo Login Alert check', err);
    }

    await this.prisma.adminSession.create({
      data: {
        adminId: data.adminId,
        device,
        browser: browserName,
        os,
        ip: data.ip,
        country: 'India', // Default to India as BURGONOMICS is a domestic platform
        refreshTokenHash: tokenHash,
        expiresAt,
      },
    });

    this.metrics.adminSessions.inc();
  }

  async getSessions(adminId: string) {
    return this.prisma.adminSession.findMany({
      where: { adminId },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        device: true,
        browser: true,
        os: true,
        ip: true,
        country: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
      },
    });
  }

  async revokeSession(adminId: string, sessionId: string): Promise<{ success: boolean }> {
    const session = await this.prisma.adminSession.findFirst({
      where: { id: sessionId, adminId },
    });

    if (!session) {
      throw new BadRequestException('Session not found or not authorized');
    }

    await this.prisma.adminSession.delete({
      where: { id: sessionId },
    });

    this.metrics.adminSessions.dec();

    await this.logAudit({
      adminId,
      action: 'ADMIN_SESSION_REVOKED',
      resource: 'auth',
      entityId: sessionId,
      metadata: {
        revokedDevice: `${session.os} (${session.browser})`,
        revokedIp: session.ip,
      },
    });

    return { success: true };
  }

  private logger = new Logger(AdminAuthService.name);

  async logAudit(data: {
    adminId?: string;
    action: string;
    resource: string;
    entityId?: string;
    ip?: string;
    browser?: string;
    metadata?: any;
  }): Promise<void> {
    try {
      this.metrics.adminAuditLogs.inc({ action: data.action, resource: data.resource });
      await this.prisma.adminAuditLog.create({
        data: {
          adminId: data.adminId || null,
          action: data.action,
          resource: data.resource,
          entityId: data.entityId || null,
          ip: data.ip || '127.0.0.1',
          browser: data.browser || 'system',
          metadata: data.metadata || null,
        },
      });
    } catch (err) {
      console.error('[AdminAuthService] Failed to create audit log:', err);
    }
  }
}
