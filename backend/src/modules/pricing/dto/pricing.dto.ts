import { ApiProperty } from '@nestjs/swagger';

export class PricingSnapshotDto {
  @ApiProperty() subtotal!: string;
  @ApiProperty() itemDiscount!: string;
  @ApiProperty() offerDiscount!: string;
  @ApiProperty() couponDiscount!: string;
  @ApiProperty() taxes!: string;
  @ApiProperty() packingFee!: string;
  @ApiProperty() deliveryFee!: string;
  @ApiProperty() serviceCharge!: string;
  @ApiProperty() roundOff!: string;
  @ApiProperty() grandTotal!: string;
  @ApiProperty() currency!: string;
  @ApiProperty() calculatedAt!: string;
}
