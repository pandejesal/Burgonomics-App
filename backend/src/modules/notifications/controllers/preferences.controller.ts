import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { PreferencesService } from '../services/preferences.service';
import { PreferencesResponseDto, UpdatePreferencesDto } from '../dto';

@ApiTags('Notification Preferences')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'notifications/preferences', version: '1' })
export class NotificationPreferencesController {
  constructor(private readonly svc: PreferencesService) {}

  @Get()
  @ApiOperation({ summary: 'Get channel-level notification preferences' })
  async get(@CurrentUser('id') userId: string): Promise<PreferencesResponseDto> {
    return this.svc.getForUser(userId, true);
  }

  @Patch()
  @ApiOperation({ summary: 'Update channel-level notification preferences' })
  async update(
    @CurrentUser('id') userId: string,
    @Body() body: UpdatePreferencesDto,
  ): Promise<PreferencesResponseDto> {
    if (body.channels?.length) await this.svc.update(userId, body.channels);
    return this.svc.getForUser(userId, body.pushEnabled ?? true);
  }
}
