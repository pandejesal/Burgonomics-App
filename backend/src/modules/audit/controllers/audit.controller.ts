import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { PermissionsGuard } from '@modules/rbac';
import { RequirePermissions } from '@modules/rbac';
import { PERMISSIONS } from '@modules/rbac';
import { ZodValidationPipe } from '@common/pipes';
import { AuditService } from '../services/audit.service';
import { AuditExportService } from '../services/audit-export.service';
import {
  exportAuditQuerySchema,
  listAuditQuerySchema,
  type ExportAuditQueryDto,
  type ListAuditQueryDto,
} from '../dto';

@ApiTags('Admin Audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller({ path: 'admin/audit', version: '1' })
export class AuditController {
  constructor(
    private readonly audit: AuditService,
    private readonly exporter: AuditExportService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  @ApiOperation({ summary: 'List / search audit logs' })
  list(@Query(new ZodValidationPipe(listAuditQuerySchema)) q: ListAuditQueryDto) {
    return this.audit.list(q);
  }

  @Get('export')
  @RequirePermissions(PERMISSIONS.AUDIT_EXPORT)
  @ApiOperation({ summary: 'Stream an audit log export (CSV or NDJSON)' })
  async export(
    @Query(new ZodValidationPipe(exportAuditQuerySchema)) q: ExportAuditQueryDto,
    @Res() res: Response,
  ) {
    const { stream, contentType, filename } = await this.exporter.export(q);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    stream.pipe(res);
  }
}
