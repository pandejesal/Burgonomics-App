import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions, PERMISSIONS } from '@modules/rbac';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ZodValidationPipe } from '@common/pipes';
import { Audit } from '@modules/audit';
import { SystemConfigService } from '../services/system-config.service';
import {
  listConfigQuerySchema,
  setConfigSchema,
  type ListConfigQueryDto,
  type SetConfigDto,
} from '../dto';

@ApiTags('Admin System Config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller({ path: 'admin/system-config', version: '1' })
export class SystemConfigController {
  constructor(private readonly svc: SystemConfigService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SYSTEM_CONFIG_READ)
  @ApiOperation({ summary: 'List system configuration entries' })
  list(@Query(new ZodValidationPipe(listConfigQuerySchema)) q: ListConfigQueryDto) {
    return this.svc.list(q.category);
  }

  @Get(':key')
  @RequirePermissions(PERMISSIONS.SYSTEM_CONFIG_READ)
  @ApiOperation({ summary: 'Read a single configuration entry' })
  get(@Param('key') key: string) {
    return this.svc.get(key);
  }

  @Get(':key/history')
  @RequirePermissions(PERMISSIONS.SYSTEM_CONFIG_READ)
  @ApiOperation({ summary: 'Version history for a configuration entry' })
  history(@Param('key') key: string) {
    return this.svc.history(key);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SYSTEM_CONFIG_WRITE)
  @Audit({ action: 'system-config.set', resourceType: 'system-config' })
  @ApiOperation({ summary: 'Upsert a configuration entry (versioned)' })
  set(
    @CurrentUser('sub') actorId: string,
    @Body(new ZodValidationPipe(setConfigSchema)) body: SetConfigDto,
  ) {
    return this.svc.set({ ...body, updatedBy: actorId });
  }

  @Delete(':key')
  @RequirePermissions(PERMISSIONS.SYSTEM_CONFIG_WRITE)
  @Audit({ action: 'system-config.delete', resourceType: 'system-config' })
  @ApiOperation({ summary: 'Delete a configuration entry' })
  delete(@Param('key') key: string) {
    return this.svc.delete(key).then(() => ({ ok: true }));
  }
}
