import type {
  OtpPurposeValue,
  OtpRequestEntity,
  RefreshTokenEntity,
} from '../../entities/auth.entity';

export const OTP_REQUEST_REPOSITORY = Symbol('OTP_REQUEST_REPOSITORY');
export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');

export interface CreateOtpInput {
  phone: string;
  codeHash: string;
  purpose: OtpPurposeValue;
  expiresAt: Date;
}

export interface IOtpRequestRepository {
  create(input: CreateOtpInput): Promise<OtpRequestEntity>;
  findLatestActive(phone: string, purpose: OtpPurposeValue): Promise<OtpRequestEntity | null>;
  incrementAttempts(id: string): Promise<void>;
  markVerified(id: string, at: Date): Promise<void>;
}

export interface CreateRefreshInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  ip?: string;
}

export interface IRefreshTokenRepository {
  create(input: CreateRefreshInput): Promise<RefreshTokenEntity>;
  findByHash(tokenHash: string): Promise<RefreshTokenEntity | null>;
  revoke(id: string, replacedById?: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}
