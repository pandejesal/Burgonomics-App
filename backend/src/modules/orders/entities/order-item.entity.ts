export class OrderItemModifierEntity {
  id!: string;
  orderItemId!: string;
  groupId!: string;
  groupName!: string;
  optionId!: string;
  optionPetpoojaId!: string;
  optionName!: string;
  priceDelta!: string;
}

export class OrderItemEntity {
  id!: string;
  orderId!: string;
  productId!: string;
  productPetpoojaId!: string;
  name!: string;
  quantity!: number;
  unitPrice!: string;
  taxRate!: string;
  lineTotal!: string;
  notes?: string | null;
  modifiers!: OrderItemModifierEntity[];
}
