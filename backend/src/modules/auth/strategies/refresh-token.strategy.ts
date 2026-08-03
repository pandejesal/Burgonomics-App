import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import type { Request } from 'express';
import type { JwtConfig } from '@config/jwt.config';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

const REFRESH_HEADER = 'x-refresh-token';

/**
 * Refresh-token strategy. Extracts the opaque refresh token from the
 * `X-Refresh-Token` header or the request body and hands it to
 * AuthService.refresh for validation and rotation.
 */
@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(config: ConfigService) {
    const cfg = config.getOrThrow<JwtConfig>('jwt');
    super({
      jwtFromRequest: (req: Request) =>
        (req.headers[REFRESH_HEADER] as string) ??
        (req.body as { refreshToken?: string })?.refreshToken ??
        null,
      ignoreExpiration: false,
      secretOrKey: cfg.refreshSecret,
      passReqToCallback: true,
    });
  }

  validate(_req: Request, payload: JwtPayload): JwtPayload {
    return payload;
  }
}
