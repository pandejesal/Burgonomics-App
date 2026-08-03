import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Max, Min } from 'class-validator';

export class StoreHoursResponseDto {
  @ApiProperty() dayOfWeek!: number;
  @ApiProperty() openTime!: string;
  @ApiProperty() closeTime!: string;
}

export class StoreResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() address!: string;
  @ApiProperty() city!: string;
  @ApiProperty() state!: string;
  @ApiProperty() pincode!: string;
  @ApiProperty() country!: string;
  @ApiPropertyOptional() phone?: string | null;
  @ApiPropertyOptional() latitude?: number | null;
  @ApiPropertyOptional() longitude?: number | null;
  @ApiProperty({ enum: ['OPEN', 'CLOSED', 'PAUSED'] }) status!: 'OPEN' | 'CLOSED' | 'PAUSED';
  @ApiPropertyOptional({ type: String, format: 'date-time' }) turnOnAt?: string | null;
  @ApiPropertyOptional() minPrepMinutes?: number | null;
  @ApiPropertyOptional({ type: [StoreHoursResponseDto] }) hours?: StoreHoursResponseDto[];
  @ApiPropertyOptional() distanceKm?: number;
}

export class SearchStoresDto {
  @ApiPropertyOptional() @IsOptional() @IsString() query?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  @Transform(({ value }) => Number(value))
  latitude?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  @Transform(({ value }) => Number(value))
  longitude?: number;
  @ApiPropertyOptional({ minimum: 1, maximum: 50 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(50)
  radiusKm?: number;
}

export class NearestStoreQueryDto {
  @IsLatitude() @Transform(({ value }) => Number(value)) latitude!: number;
  @IsLongitude() @Transform(({ value }) => Number(value)) longitude!: number;
}
