import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { AddressesService } from '../services/addresses.service';
import { AddressMapper } from '../mappers/address.mapper';
import { AddressResponseDto, CreateAddressDto, UpdateAddressDto } from '../dto';

@ApiTags('Addresses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'me/addresses', version: '1' })
export class AddressesController {
  constructor(private readonly svc: AddressesService) {}

  @Get()
  @ApiOperation({ summary: 'List addresses for the current user' })
  @ApiOkResponse({ type: [AddressResponseDto] })
  async list(@CurrentUser('sub') userId: string): Promise<AddressResponseDto[]> {
    const rows = await this.svc.list(userId);
    return rows.map(AddressMapper.toResponse);
  }

  @Post()
  @ApiOperation({ summary: 'Create an address' })
  @ApiOkResponse({ type: AddressResponseDto })
  async create(
    @CurrentUser('sub') userId: string,
    @Body() body: CreateAddressDto,
  ): Promise<AddressResponseDto> {
    return AddressMapper.toResponse(await this.svc.create(userId, body));
  }

  @Get(':id')
  @ApiOkResponse({ type: AddressResponseDto })
  async get(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
  ): Promise<AddressResponseDto> {
    return AddressMapper.toResponse(await this.svc.get(userId, id));
  }

  @Patch(':id')
  @ApiOkResponse({ type: AddressResponseDto })
  async update(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() body: UpdateAddressDto,
  ): Promise<AddressResponseDto> {
    return AddressMapper.toResponse(await this.svc.update(userId, id, body));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser('sub') userId: string, @Param('id') id: string): Promise<void> {
    await this.svc.remove(userId, id);
  }

  @Post(':id/default')
  @ApiOkResponse({ type: AddressResponseDto })
  async setDefault(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
  ): Promise<AddressResponseDto> {
    return AddressMapper.toResponse(await this.svc.setDefault(userId, id));
  }
}
