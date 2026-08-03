import { Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '@common/decorators/roles.decorator';
import { RolesGuard } from '@common/guards/roles.guard';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { Role } from '@common/enums';
import { PetpoojaSyncService } from '../services/petpooja-sync.service';
import type { SyncScope } from '../dto';

@ApiTags('Catalog Sync (admin)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/catalog/sync', version: '1' })
export class PetpoojaSyncController {
  constructor(private readonly svc: PetpoojaSyncService) {}

  @Post('trigger')
  @HttpCode(202)
  @ApiOperation({ summary: 'Enqueue a PETPOOJA sync (admin only)' })
  trigger(@Query('scope') scope: SyncScope, @Query('storeId') storeId?: string) {
    return this.svc.enqueueFetch({ scope, storeId });
  }

  @Get('history')
  @ApiOperation({ summary: 'Recent sync log history' })
  history() {
    return this.svc.history();
  }

  @Get('health')
  @ApiOperation({ summary: 'Sync pipeline health' })
  health() {
    return this.svc.health();
  }
}
