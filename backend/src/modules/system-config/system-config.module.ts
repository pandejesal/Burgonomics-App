import { Global, Module } from '@nestjs/common';
import { SystemConfigController } from './controllers/system-config.controller';
import { SystemConfigService } from './services/system-config.service';
import { SystemConfigPrismaRepository } from './repositories/prisma/system-config.prisma-repository';
import { SYSTEM_CONFIG_REPOSITORY } from './repositories/interfaces/system-config-repository.interface';

@Global()
@Module({
  controllers: [SystemConfigController],
  providers: [
    SystemConfigService,
    SystemConfigPrismaRepository,
    { provide: SYSTEM_CONFIG_REPOSITORY, useExisting: SystemConfigPrismaRepository },
  ],
  exports: [SystemConfigService, SYSTEM_CONFIG_REPOSITORY],
})
export class SystemConfigModule {}
