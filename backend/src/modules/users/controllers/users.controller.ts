import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { UsersService } from '../services/users.service';
import { UserMapper } from '../mappers/user.mapper';
import {
  CompletionStatusDto,
  PreferencesResponseDto,
  UpdatePreferencesDto,
  UpdateUserDto,
  UserResponseDto,
} from '../dto';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'me', version: '1' })
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get the current user profile' })
  @ApiOkResponse({ type: UserResponseDto })
  async getMe(@CurrentUser('sub') userId: string): Promise<UserResponseDto> {
    const user = await this.users.getById(userId);
    return UserMapper.toResponse(user);
  }

  @Patch()
  @ApiOperation({ summary: 'Update the current user profile' })
  @ApiOkResponse({ type: UserResponseDto })
  async updateMe(
    @CurrentUser('sub') userId: string,
    @Body() body: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const user = await this.users.updateProfile(userId, body);
    return UserMapper.toResponse(user);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Get preferences for the current user' })
  @ApiOkResponse({ type: PreferencesResponseDto })
  async getPreferences(@CurrentUser('sub') userId: string): Promise<PreferencesResponseDto> {
    const prefs = await this.users.getPreferences(userId);
    return UserMapper.preferencesToResponse(prefs as never);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Update preferences for the current user' })
  @ApiOkResponse({ type: PreferencesResponseDto })
  async updatePreferences(
    @CurrentUser('sub') userId: string,
    @Body() body: UpdatePreferencesDto,
  ): Promise<PreferencesResponseDto> {
    const prefs = await this.users.updatePreferences(userId, body);
    return UserMapper.preferencesToResponse(prefs as never);
  }

  @Get('completion')
  @ApiOperation({ summary: 'Get profile completion status' })
  @ApiOkResponse({ type: CompletionStatusDto })
  async completion(@CurrentUser('sub') userId: string): Promise<CompletionStatusDto> {
    return this.users.getCompletionStatus(userId);
  }
}
