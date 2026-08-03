import { Module } from '@nestjs/common';
import { ModifiersController } from './controllers/modifiers.controller';
import { ModifiersService } from './services/modifiers.service';
import { ModifierPrismaRepository } from './repositories/prisma/modifier.prisma-repository';
import { MODIFIER_REPOSITORY } from './repositories/interfaces/modifier-repository.interface';

@Module({
  controllers: [ModifiersController],
  providers: [
    ModifiersService,
    ModifierPrismaRepository,
    { provide: MODIFIER_REPOSITORY, useExisting: ModifierPrismaRepository },
  ],
  exports: [ModifiersService, MODIFIER_REPOSITORY],
})
export class ModifiersModule {}
