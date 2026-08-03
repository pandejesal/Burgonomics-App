export type OtpPurposeValue = 'LOGIN' | 'PHONE_CHANGE' | 'ACCOUNT_RECOVERY';

export class RefreshTokenEntity {
  id!: string;
  userId!: string;
  tokenHash!: string;
  expiresAt!: Date;
  revokedAt?: Date | null;
  replacedById?: string | null;
  userAgent?: string | null;
  ip?: string | null;
  createdAt!: Date;
}

export class OtpRequestEntity {
  id!: string;
  phone!: string;
  codeHash!: string;
  purpose!: OtpPurposeValue;
  attempts!: number;
  verifiedAt?: Date | null;
  expiresAt!: Date;
  createdAt!: Date;
}
