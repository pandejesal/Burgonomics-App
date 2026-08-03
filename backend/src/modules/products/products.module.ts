import { Module } from '@nestjs/common';
import { ProductsController } from './controllers/products.controller';
import { ProductsService } from './services/products.service';
import { ProductPrismaRepository } from './repositories/prisma/product.prisma-repository';
import { PRODUCT_REPOSITORY } from './repositories/interfaces/product-repository.interface';

@Module({
  controllers: [ProductsController],
  providers: [
    ProductsService,
    ProductPrismaRepository,
    { provide: PRODUCT_REPOSITORY, useExisting: ProductPrismaRepository },
  ],
  exports: [ProductsService, PRODUCT_REPOSITORY],
})
export class ProductsModule {}
