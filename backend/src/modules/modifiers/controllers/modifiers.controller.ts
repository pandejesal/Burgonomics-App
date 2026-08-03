import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { ModifiersService } from '../services/modifiers.service';
import { ModifierMapper } from '../mappers/modifier.mapper';
import { ModifierGroupResponseDto } from '../dto';

@ApiTags('Modifiers')
@Public()
@Controller({ path: 'modifier-groups', version: '1' })
export class ModifiersController {
  constructor(private readonly svc: ModifiersService) {}

  @Get()
  @ApiOperation({ summary: 'List all modifier groups with options' })
  @ApiOkResponse({ type: [ModifierGroupResponseDto] })
  async list(): Promise<ModifierGroupResponseDto[]> {
    const rows = await this.svc.listAll();
    return rows.map(({ group, options }) => ModifierMapper.groupToResponse(group, options));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a modifier group' })
  @ApiOkResponse({ type: ModifierGroupResponseDto })
  async get(@Param('id') id: string): Promise<ModifierGroupResponseDto> {
    const { group, options } = await this.svc.get(id);
    return ModifierMapper.groupToResponse(group, options);
  }
}
