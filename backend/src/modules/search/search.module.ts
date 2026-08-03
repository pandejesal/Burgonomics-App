import { Module } from '@nestjs/common';
import { SearchController } from './controllers/search.controller';
import { SearchService } from './services/search.service';
import { PostgresSearchDriver } from './drivers/postgres-search.driver';
import { SEARCH_DRIVER } from './drivers/search-driver.interface';
import { SearchLogPrismaRepository } from './repositories/prisma/search-log.prisma-repository';
import { SEARCH_LOG_REPOSITORY } from './repositories/interfaces/search-log-repository.interface';

@Module({
  controllers: [SearchController],
  providers: [
    SearchService,
    PostgresSearchDriver,
    { provide: SEARCH_DRIVER, useExisting: PostgresSearchDriver },
    SearchLogPrismaRepository,
    { provide: SEARCH_LOG_REPOSITORY, useExisting: SearchLogPrismaRepository },
  ],
  exports: [SearchService, SEARCH_DRIVER],
})
export class SearchModule {}
