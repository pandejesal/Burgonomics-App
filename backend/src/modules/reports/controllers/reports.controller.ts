import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions, PERMISSIONS } from '@modules/rbac';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ZodValidationPipe } from '@common/pipes';
import { Audit } from '@modules/audit';
import { ReportsService } from '../services/reports.service';
import {
  createReportSchema,
  listReportsQuerySchema,
  type CreateReportDto,
  type ListReportsQueryDto,
} from '../dto';

@ApiTags('Admin Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller({ path: 'admin/reports', version: '1' })
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.REPORTS_READ)
  @ApiOperation({ summary: 'List generated / in-flight reports' })
  list(@Query(new ZodValidationPipe(listReportsQuerySchema)) q: ListReportsQueryDto) {
    return this.svc.list(q);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.REPORTS_READ)
  @ApiOperation({ summary: 'Get a report by id' })
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.REPORTS_GENERATE)
  @Audit({ action: 'report.enqueue', resourceType: 'report' })
  @ApiOperation({ summary: 'Enqueue an asynchronous report generation job' })
  create(
    @CurrentUser('sub') actorId: string,
    @Body(new ZodValidationPipe(createReportSchema)) body: CreateReportDto,
  ) {
    return this.svc.enqueue({ ...body, requestedBy: actorId });
  }
}
