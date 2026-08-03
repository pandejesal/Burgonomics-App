import { ApiProperty } from '@nestjs/swagger';

export class ApiResponseDto<T> {
  @ApiProperty() success!: boolean;
  @ApiProperty() timestamp!: string;
  @ApiProperty() correlationId!: string;
  data?: T;
}
