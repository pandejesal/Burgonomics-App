import { ApiProperty } from '@nestjs/swagger';

export class PreferencesResponseDto {
  @ApiProperty() language!: string;
  @ApiProperty() theme!: string;
  @ApiProperty() notificationsEnabled!: boolean;
  @ApiProperty() marketingOptIn!: boolean;
}
