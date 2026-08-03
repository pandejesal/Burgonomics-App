import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { JwtAuthGuard } from '@common/guards';
import { AuthService } from '../services/auth.service';
import {
  LogoutDto,
  OtpChallengeDto,
  RefreshTokenDto,
  RequestOtpDto,
  TokenPairDto,
  VerifyOtpDto,
} from '../dto';

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('otp/request')
  @HttpCode(200)
  @ApiOperation({ summary: 'Request an OTP challenge' })
  @ApiOkResponse({ type: OtpChallengeDto })
  requestOtp(@Body() body: RequestOtpDto): Promise<OtpChallengeDto> {
    return this.auth.requestOtp(body.phone, body.purpose ?? 'LOGIN');
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify OTP and obtain a token pair' })
  @ApiOkResponse({ type: TokenPairDto })
  verifyOtp(@Body() body: VerifyOtpDto): Promise<TokenPairDto> {
    return this.auth.verifyOtp(body.phone, body.code);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Exchange a refresh token for a new pair' })
  @ApiOkResponse({ type: TokenPairDto })
  refresh(@Body() body: RefreshTokenDto): Promise<TokenPairDto> {
    return this.auth.refresh(body.refreshToken);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke the current refresh token' })
  async logout(@Body() body: LogoutDto): Promise<void> {
    await this.auth.logout(body.refreshToken);
  }
}
