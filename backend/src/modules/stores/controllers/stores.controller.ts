import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { StoresService } from '../services/stores.service';
import { StoreMapper } from '../mappers/store.mapper';
import { NearestStoreQueryDto, SearchStoresDto, StoreResponseDto } from '../dto';

@ApiTags('Stores')
@Public()
@Controller({ path: 'stores', version: '1' })
export class StoresController {
  constructor(private readonly svc: StoresService) {}

  @Get()
  @ApiOperation({ summary: 'Search stores' })
  @ApiOkResponse({ type: [StoreResponseDto] })
  async list(@Query() q: SearchStoresDto): Promise<StoreResponseDto[]> {
    const rows = await this.svc.search(q);
    return rows.map((s) => StoreMapper.toResponse(s));
  }

  @Get('nearest')
  @ApiOperation({ summary: 'Get the nearest store (placeholder)' })
  @ApiOkResponse({ type: StoreResponseDto })
  async nearest(@Query() q: NearestStoreQueryDto): Promise<StoreResponseDto> {
    const s = await this.svc.findNearest(q.latitude, q.longitude);
    return StoreMapper.toResponse(s);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get store details with hours' })
  @ApiOkResponse({ type: StoreResponseDto })
  async get(@Param('id') id: string): Promise<StoreResponseDto> {
    const { store, hours } = await this.svc.get(id);
    return StoreMapper.toResponse(store, hours);
  }
}
