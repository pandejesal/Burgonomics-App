import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { Roles } from '@common/decorators/roles.decorator';
import { RolesGuard } from '@common/guards/roles.guard';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { Role } from '@common/enums';
import { MenuService } from '../services/menu.service';
import { MenuQueryDto, MenuRefreshDto, MenuResponseDto } from '../dto';

@ApiTags('Menu')
@Controller({ path: 'menu', version: '1' })
export class MenuController {
  constructor(private readonly svc: MenuService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Aggregated menu for a store (categories + products + modifiers)' })
  @ApiOkResponse({ type: MenuResponseDto })
  get(@Query() q: MenuQueryDto): Promise<MenuResponseDto> {
    return this.svc.getMenu(q);
  }

  @Post('refresh')
  @HttpCode(202)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STORE_MANAGER)
  @ApiOperation({ summary: 'Trigger a PETPOOJA menu refresh (queues a sync job)' })
  refresh(@Body() body: MenuRefreshDto) {
    return this.svc.requestRefresh(body);
  }
}
