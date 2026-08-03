import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@common/enums';

export class UserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() phone!: string;
  @ApiPropertyOptional() email?: string | null;
  @ApiPropertyOptional() name?: string | null;
  @ApiPropertyOptional() avatarUrl?: string | null;
  @ApiProperty({ enum: Role }) role!: Role;
  @ApiProperty() isActive!: boolean;
  @ApiPropertyOptional({ type: String, format: 'date-time' }) lastLoginAt?: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}
