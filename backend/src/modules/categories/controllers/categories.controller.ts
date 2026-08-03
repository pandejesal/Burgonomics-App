import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { CategoriesService } from '../services/categories.service';
import { CategoryMapper } from '../mappers/category.mapper';
import { CategoryResponseDto, ListCategoriesQueryDto } from '../dto';

@ApiTags('Categories')
@Public()
@Controller({ path: 'categories', version: '1' })
export class CategoriesController {
  constructor(private readonly svc: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'List categories (filter, search, paginate)' })
  @ApiOkResponse({ type: [CategoryResponseDto] })
  async list(@Query() q: ListCategoriesQueryDto) {
    const { items, total } = await this.svc.list(q);
    return {
      items: items.map((c) => CategoryMapper.toResponse(c)),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  @Get('tree')
  @ApiOperation({ summary: 'Visible category tree (root → children)' })
  async tree(): Promise<CategoryResponseDto[]> {
    const all = await this.svc.getVisibleTree();
    const byParent = new Map<string | null, typeof all>();
    all.forEach((c) => {
      const list = byParent.get(c.parentId ?? null) ?? [];
      list.push(c);
      byParent.set(c.parentId ?? null, list);
    });
    const build = (parentId: string | null): CategoryResponseDto[] =>
      (byParent.get(parentId) ?? []).map((c) => CategoryMapper.toResponse(c, build(c.id)));
    return build(null);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a single category' })
  @ApiOkResponse({ type: CategoryResponseDto })
  async get(@Param('id') id: string): Promise<CategoryResponseDto> {
    const c = await this.svc.get(id);
    return CategoryMapper.toResponse(c);
  }
}
