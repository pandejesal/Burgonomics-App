import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsPhoneNumber, IsString, Length } from 'class-validator';

export class RequestOtpDto {
  @ApiProperty({ example: '+919999999999' })
  @IsPhoneNumber(undefined)
  phone!: string;

  @ApiPropertyOptional({ enum: ['LOGIN', 'PHONE_CHANGE', 'ACCOUNT_RECOVERY'], default: 'LOGIN' })
  @IsOptional()
  @IsIn(['LOGIN', 'PHONE_CHANGE', 'ACCOUNT_RECOVERY'])
  purpose?: 'LOGIN' | 'PHONE_CHANGE' | 'ACCOUNT_RECOVERY';
}

export class VerifyOtpDto {
  @ApiProperty({ example: '+919999999999' })
  @IsPhoneNumber(undefined)
  phone!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(4, 8)
  code!: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}

export class LogoutDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class TokenPairDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
  @ApiProperty() accessTokenExpiresAt!: string;
  @ApiProperty() refreshTokenExpiresAt!: string;
}

export class OtpChallengeDto {
  @ApiProperty() challengeId!: string;
  @ApiProperty() expiresAt!: string;
  @ApiProperty() resendAfterSeconds!: number;
}
