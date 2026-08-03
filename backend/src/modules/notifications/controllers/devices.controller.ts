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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { DevicesService } from '../services/devices.service';
import { DeviceMapper } from '../mappers/notification.mapper';
import { DeviceHeartbeatDto, DeviceResponseDto, RegisterDeviceDto } from '../dto';

@ApiTags('Devices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'devices', version: '1' })
export class DevicesController {
  constructor(private readonly svc: DevicesService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Register or refresh a push-notification device' })
  async register(
    @CurrentUser('id') userId: string,
    @Body() body: RegisterDeviceDto,
  ): Promise<DeviceResponseDto> {
    const device = await this.svc.register({ ...body, userId });
    return DeviceMapper.toResponse(device);
  }

  @Get()
  @ApiOperation({ summary: 'List the authenticated user’s registered devices' })
  async list(@CurrentUser('id') userId: string): Promise<DeviceResponseDto[]> {
    const items = await this.svc.listMine(userId);
    return items.map(DeviceMapper.toResponse);
  }

  @Patch(':id/heartbeat')
  @ApiOperation({ summary: 'Update device metadata / last-seen timestamp' })
  async heartbeat(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() body: DeviceHeartbeatDto,
  ): Promise<DeviceResponseDto> {
    const d = await this.svc.heartbeat(id, userId, body);
    return DeviceMapper.toResponse(d);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke (unregister) a device' })
  async remove(@CurrentUser('id') userId: string, @Param('id') id: string): Promise<void> {
    await this.svc.remove(id, userId);
  }
}
