import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { SearchService } from '../services/search.service';
import {
  AutocompleteQueryDto,
  SearchQueryDto,
  SearchResponseDto,
  SuggestionResponseDto,
} from '../dto';

@ApiTags('Search')
@Controller({ path: 'search', version: '1' })
export class SearchController {
  constructor(private readonly svc: SearchService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Search catalog (products, categories, offers, stores)' })
  @ApiOkResponse({ type: SearchResponseDto })
  search(@Query() q: SearchQueryDto, @Req() req: Request): Promise<SearchResponseDto> {
    const userId = (req.user as { sub?: string } | undefined)?.sub ?? null;
    return this.svc.search(q, userId);
  }

  @Get('autocomplete')
  @Public()
  @ApiOperation({ summary: 'Autocomplete suggestions' })
  @ApiOkResponse({ type: SuggestionResponseDto })
  async autocomplete(@Query() q: AutocompleteQueryDto): Promise<SuggestionResponseDto> {
    return { suggestions: await this.svc.autocomplete(q.q, q.limit) };
  }

  @Get('popular')
  @Public()
  @ApiOperation({ summary: 'Popular searches over the last N days' })
  popular(): Promise<{ query: string; count: number }[]> {
    return this.svc.popular();
  }

  @Get('recent')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Recent searches for the authenticated user' })
  async recent(@Req() req: Request) {
    const userId = (req.user as { sub: string }).sub;
    return this.svc.recent(userId);
  }
}
