import type { Cart, CartItem, CartItemModifier } from '@prisma/client';
import { CartEntity, type FulfillmentType, type CartStatus } from '../entities/cart.entity';
import { CartItemEntity, CartItemModifierEntity } from '../entities/cart-item.entity';
import type {
  CartItemModifierResponseDto,
  CartItemResponseDto,
  CartResponseDto,
  CartTotalsDto,
  FulfillmentTypeDto,
} from '../dto';

type CartRow = Cart & { items: (CartItem & { modifiers: CartItemModifier[] })[] };

export class CartMapper {
  static modifierToEntity(row: CartItemModifier): CartItemModifierEntity {
    const e = new CartItemModifierEntity();
    Object.assign(e, { ...row, priceDelta: row.priceDelta.toString() });
    return e;
  }

  static itemToEntity(row: CartItem & { modifiers: CartItemModifier[] }): CartItemEntity {
    const e = new CartItemEntity();
    Object.assign(e, {
      ...row,
      unitPrice: row.unitPrice.toString(),
      taxRate: row.taxRate.toString(),
      modifiers: row.modifiers.map(CartMapper.modifierToEntity),
    });
    return e;
  }

  static toEntity(row: CartRow): CartEntity {
    const e = new CartEntity();
    Object.assign(e, {
      ...row,
      fulfillment: row.fulfillment as FulfillmentType,
      status: row.status as CartStatus,
      items: row.items.map(CartMapper.itemToEntity),
    });
    return e;
  }

  static modifierToResponse(m: CartItemModifierEntity): CartItemModifierResponseDto {
    return {
      groupId: m.groupId,
      groupName: m.groupName,
      optionId: m.optionId,
      optionName: m.optionName,
      priceDelta: m.priceDelta,
    };
  }

  static itemToResponse(i: CartItemEntity): CartItemResponseDto {
    const unit = Number(i.unitPrice) + i.modifiers.reduce((s, m) => s + Number(m.priceDelta), 0);
    return {
      id: i.id,
      productId: i.productId,
      name: i.name,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      taxRate: i.taxRate,
      lineSubtotal: (unit * i.quantity).toFixed(2),
      modifiers: i.modifiers.map(CartMapper.modifierToResponse),
      notes: i.notes ?? null,
    };
  }

  static toResponse(c: CartEntity, totals: CartTotalsDto): CartResponseDto {
    return {
      id: c.id,
      userId: c.userId ?? null,
      anonymousId: c.anonymousId ?? null,
      storeId: c.storeId ?? null,
      fulfillment: c.fulfillment as unknown as FulfillmentTypeDto,
      addressId: c.addressId ?? null,
      tableNumber: c.tableNumber ?? null,
      status: c.status,
      currency: c.currency,
      notes: c.notes ?? null,
      items: c.items.map(CartMapper.itemToResponse),
      totals,
      expiresAt: c.expiresAt ?? null,
    };
  }
}
