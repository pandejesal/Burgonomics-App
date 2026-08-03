import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards';
import { Roles } from '@common/decorators/roles.decorator';
import { Public } from '@common/decorators/public.decorator';
import { Role } from '@common/enums';
import { FeatureFlagsAdminService } from '../services/feature-flags-admin.service';
import { FeatureFlagDto, FlagCheckDto, UpsertFeatureFlagDto } from '../dto';

@ApiTags('Feature Flags')
@Controller({ path: 'feature-flags', version: '1' })
export class FeatureFlagsController {
  constructor(private readonly svc: FeatureFlagsAdminService) {}

  @Public()
  @Get('check/:key')
  @ApiOperation({ summary: 'Resolve a flag for the calling context' })
  @ApiOkResponse({ type: FlagCheckDto })
  check(@Param('key') key: string): Promise<FlagCheckDto> {
    return this.svc.check(key);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Get()
  @ApiOkResponse({ type: [FeatureFlagDto] })
  list(): Promise<FeatureFlagDto[]> {
    return this.svc.list();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Post()
  @ApiOkResponse({ type: FeatureFlagDto })
  upsert(@Body() body: UpsertFeatureFlagDto): Promise<FeatureFlagDto> {
    return this.svc.upsert(body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Delete(':key')
  remove(@Param('key') key: string): Promise<void> {
    return this.svc.remove(key);
  }
}
