import { ApiProperty } from '@nestjs/swagger';

export class CompletionStatusDto {
  @ApiProperty() hasName!: boolean;
  @ApiProperty() hasEmail!: boolean;
  @ApiProperty() hasAvatar!: boolean;
  @ApiProperty() hasAddress!: boolean;
  @ApiProperty() percentComplete!: number;
}
