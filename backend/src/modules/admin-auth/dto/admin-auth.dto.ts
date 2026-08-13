import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class AdminLoginDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '********' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class LoginChallengeDto {
  @ApiProperty()
  challengeToken!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  requires2Fa!: boolean;

  @ApiProperty()
  requiresPasswordChange!: boolean;
}

export class Verify2FaDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  challengeToken?: string;

  @ApiProperty()
  @IsString()
  @Length(6, 8)
  code!: string;
}

export class Disable2FaDto {
  @ApiProperty()
  @IsString()
  @Length(6, 8)
  code!: string;
}

export class AdminTokenPairDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty()
  admin!: {
    id: string;
    email: string;
    fullName: string;
    avatar: string | null;
    role: {
      name: string;
      permissions: string[];
    };
  };
}

export class Setup2FaResponseDto {
  @ApiProperty()
  secret!: string;

  @ApiProperty()
  qrCodeUrl!: string;

  @ApiProperty({ required: false, type: [String] })
  recoveryCodes?: string[];
}
