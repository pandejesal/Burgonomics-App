import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * RFC-7807 Problem Details representation.
 */
export class ProblemDetailsDto {
  @ApiProperty({ example: 'about:blank' }) type!: string;
  @ApiProperty() title!: string;
  @ApiProperty() status!: number;
  @ApiProperty() code!: string;
  @ApiPropertyOptional() detail?: string;
  @ApiPropertyOptional() instance?: string;
  @ApiProperty() correlationId!: string;
  @ApiPropertyOptional() retryable?: boolean;
  @ApiPropertyOptional() errors?: Record<string, unknown>;
}
