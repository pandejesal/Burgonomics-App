export class CartItemModifierEntity {
  id!: string;
  cartItemId!: string;
  groupId!: string;
  groupName!: string;
  optionId!: string;
  optionPetpoojaId!: string;
  optionName!: string;
  priceDelta!: string;
}

export class CartItemEntity {
  id!: string;
  cartId!: string;
  productId!: string;
  productPetpoojaId!: string;
  name!: string;
  quantity!: number;
  unitPrice!: string;
  taxRate!: string;
  notes?: string | null;
  modifiers!: CartItemModifierEntity[];
  createdAt!: Date;
  updatedAt!: Date;
}
