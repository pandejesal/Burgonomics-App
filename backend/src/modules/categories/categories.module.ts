import { Module } from '@nestjs/common';
import { CategoriesController } from './controllers/categories.controller';
import { CategoriesService } from './services/categories.service';
import { CategoryPrismaRepository } from './repositories/prisma/category.prisma-repository';
import { CATEGORY_REPOSITORY } from './repositories/interfaces/category-repository.interface';

@Module({
  controllers: [CategoriesController],
  providers: [
    CategoriesService,
    CategoryPrismaRepository,
    { provide: CATEGORY_REPOSITORY, useExisting: CategoryPrismaRepository },
  ],
  exports: [CategoriesService, CATEGORY_REPOSITORY],
})
export class CategoriesModule {}
