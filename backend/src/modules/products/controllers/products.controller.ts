import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { ProductsService } from '../services/products.service';
import { ProductMapper } from '../mappers/product.mapper';
import { ListProductsQueryDto, ProductResponseDto } from '../dto';

@ApiTags('Products')
@Public()
@Controller({ path: 'products', version: '1' })
export class ProductsController {
  constructor(private readonly svc: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List products (filter, search, sort, paginate)' })
  @ApiOkResponse({ type: [ProductResponseDto] })
  async list(@Query() q: ListProductsQueryDto) {
    const { items, total } = await this.svc.list(q);
    return {
      items: items.map(({ product, images, modifierGroupIds }) =>
        ProductMapper.toResponse(product, images, modifierGroupIds),
      ),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a single product with images and modifier groups' })
  @ApiOkResponse({ type: ProductResponseDto })
  async get(@Param('id') id: string): Promise<ProductResponseDto> {
    const { product, images, modifierGroupIds } = await this.svc.get(id);
    return ProductMapper.toResponse(product, images, modifierGroupIds);
  }
}
