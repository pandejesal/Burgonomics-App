import { Role } from '@common/enums';

/**
 * JWT access-token payload. Signed with HS256.
 */
export interface JwtPayload {
  sub: string;
  phone: string;
  roles: Role[];
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

/**
 * Value exposed on `request.user` after JwtStrategy validation.
 */
export interface AuthenticatedUser {
  sub: string;
  phone: string;
  roles: Role[];
}
