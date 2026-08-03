import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ModifierOptionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() price!: string;
  @ApiProperty() displayOrder!: number;
  @ApiProperty() isAvailable!: boolean;
  @ApiProperty() isDefault!: boolean;
}

export class ModifierGroupResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string | null;
  @ApiProperty() minSelection!: number;
  @ApiProperty() maxSelection!: number;
  @ApiProperty() isRequired!: boolean;
  @ApiProperty() allowMultiple!: boolean;
  @ApiProperty() displayOrder!: number;
  @ApiProperty() isAvailable!: boolean;
  @ApiProperty({ type: [ModifierOptionResponseDto] }) options!: ModifierOptionResponseDto[];
}
