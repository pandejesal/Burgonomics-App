import { Global, Module } from '@nestjs/common';
import { AuditService } from './services/audit.service';
import { AuditExportService } from './services/audit-export.service';
import { AuditInterceptor } from './interceptors/audit.interceptor';
import { AuditController } from './controllers/audit.controller';
import { AuditPrismaRepository } from './repositories/prisma/audit.prisma-repository';
import { AUDIT_REPOSITORY } from './repositories/interfaces/audit-repository.interface';

@Global()
@Module({
  controllers: [AuditController],
  providers: [
    AuditService,
    AuditExportService,
    AuditInterceptor,
    AuditPrismaRepository,
    { provide: AUDIT_REPOSITORY, useExisting: AuditPrismaRepository },
  ],
  exports: [AuditService, AuditExportService, AuditInterceptor, AUDIT_REPOSITORY],
})
export class AuditModule {}
