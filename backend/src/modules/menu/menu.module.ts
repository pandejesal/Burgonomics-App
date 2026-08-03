import { Module } from '@nestjs/common';
import { MenuController } from './controllers/menu.controller';
import { MenuService } from './services/menu.service';
import { MenuCacheService } from './services/menu-cache.service';
import { MenuPrismaRepository } from './repositories/prisma/menu.prisma-repository';
import { MENU_REPOSITORY } from './repositories/interfaces/menu-repository.interface';

@Module({
  controllers: [MenuController],
  providers: [
    MenuService,
    MenuCacheService,
    MenuPrismaRepository,
    { provide: MENU_REPOSITORY, useExisting: MenuPrismaRepository },
  ],
  exports: [MenuService, MenuCacheService, MENU_REPOSITORY],
})
export class MenuModule {}
