import {
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
  Req,
  Get,
  Param,
  Delete,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AdminAuthService } from '../services/admin-auth.service';
import { AdminJwtGuard } from '../guards/admin-jwt.guard';
import { CurrentAdmin } from '../decorators/admin-auth.decorator';
import {
  AdminLoginDto,
  AdminTokenPairDto,
  Disable2FaDto,
  LoginChallengeDto,
  Setup2FaResponseDto,
  Verify2FaDto,
} from '../dto/admin-auth.dto';

@ApiTags('Admin Auth')
@Controller({ path: 'admin/auth', version: '1' })
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  private getClientInfo(req: Request) {
    const ip =
      (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
    const browser = (req.headers['user-agent'] as string) || 'Unknown';
    return { ip, browser };
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log in with admin credentials' })
  @ApiOkResponse({ type: LoginChallengeDto })
  async login(@Body() body: AdminLoginDto, @Req() req: Request): Promise<LoginChallengeDto> {
    const { ip, browser } = this.getClientInfo(req);
    return this.auth.login(body, ip, browser);
  }

  @Post('verify-2fa')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify TOTP code to complete login' })
  @ApiOkResponse({ type: AdminTokenPairDto })
  async verify2Fa(@Body() body: Verify2FaDto, @Req() req: Request): Promise<AdminTokenPairDto> {
    const { ip, browser } = this.getClientInfo(req);
    return this.auth.verify2Fa(body, ip, browser);
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  @Post('setup-2fa')
  @HttpCode(200)
  @ApiOperation({ summary: 'Initialize TOTP 2FA setup' })
  @ApiOkResponse({ type: Setup2FaResponseDto })
  async setup2Fa(@CurrentAdmin() admin: any): Promise<Setup2FaResponseDto> {
    return this.auth.setup2Fa(admin.id, admin.email);
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  @Post('verify-setup-2fa')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify TOTP code to complete and activate 2FA' })
  async verifySetup2Fa(
    @CurrentAdmin() admin: any,
    @Body() body: { code: string },
  ): Promise<{ success: boolean }> {
    return this.auth.verifySetup2Fa(admin.id, body.code);
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  @Post('disable-2fa')
  @HttpCode(200)
  @ApiOperation({ summary: 'Disable TOTP 2FA' })
  async disable2Fa(
    @CurrentAdmin() admin: any,
    @Body() body: Disable2FaDto,
  ): Promise<{ success: boolean }> {
    return this.auth.disable2Fa(admin.id, body);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Obtain new token pairs' })
  async refresh(
    @Body() body: { refreshToken: string },
    @Req() req: Request,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const { ip, browser } = this.getClientInfo(req);
    return this.auth.refresh(body.refreshToken, ip, browser);
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Invalidate admin session' })
  async logout(@Body() body: { refreshToken: string }): Promise<{ success: boolean }> {
    await this.auth.logout(body.refreshToken);
    return { success: true };
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  @Post('change-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Change administrative password' })
  async changePassword(
    @CurrentAdmin() admin: any,
    @Body() body: { oldPass: string; newPass: string },
  ): Promise<{ success: boolean }> {
    return this.auth.changePassword(admin.id, body.oldPass, body.newPass);
  }

  @Post('force-dev-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Force password change for seeded Dev user before first login' })
  async forceDeveloperPasswordChange(
    @Body() body: { challengeToken: string; oldPass: string; newPass: string },
  ): Promise<{ success: boolean }> {
    return this.auth.forceDeveloperPasswordChange(body.challengeToken, body.oldPass, body.newPass);
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  @Get('sessions')
  @ApiOperation({ summary: 'List concurrent active administrative sessions' })
  async getSessions(@CurrentAdmin() admin: any) {
    return this.auth.getSessions(admin.id);
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Revoke and force log out a concurrent administrative session' })
  async revokeSession(@CurrentAdmin() admin: any, @Param('id') sessionId: string) {
    return this.auth.revokeSession(admin.id, sessionId);
  }
}
