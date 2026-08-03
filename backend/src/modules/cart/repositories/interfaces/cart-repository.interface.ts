import type { CartEntity, FulfillmentType } from '../../entities/cart.entity';

export const CART_REPOSITORY = Symbol('CART_REPOSITORY');

export interface CreateCartArgs {
  userId?: string | null;
  anonymousId?: string | null;
  storeId?: string | null;
  fulfillment: FulfillmentType;
  currency?: string;
  expiresAt?: Date | null;
}

export interface AddItemArgs {
  productId: string;
  productPetpoojaId: string;
  name: string;
  quantity: number;
  unitPrice: string;
  taxRate: string;
  notes?: string | null;
  modifiers: {
    groupId: string;
    groupName: string;
    optionId: string;
    optionPetpoojaId: string;
    optionName: string;
    priceDelta: string;
  }[];
}

export interface UpdateItemArgs {
  quantity?: number;
  notes?: string | null;
  modifiers?: AddItemArgs['modifiers'];
}

export interface UpdateCartMetaArgs {
  storeId?: string | null;
  fulfillment?: FulfillmentType;
  addressId?: string | null;
  tableNumber?: string | null;
  notes?: string | null;
}

export interface ICartRepository {
  create(args: CreateCartArgs): Promise<CartEntity>;
  findById(id: string): Promise<CartEntity | null>;
  findActiveByUser(userId: string): Promise<CartEntity | null>;
  findActiveByAnonymous(anonymousId: string): Promise<CartEntity | null>;
  updateMeta(cartId: string, args: UpdateCartMetaArgs): Promise<CartEntity>;
  addItem(cartId: string, args: AddItemArgs): Promise<CartEntity>;
  updateItem(cartId: string, itemId: string, args: UpdateItemArgs): Promise<CartEntity>;
  removeItem(cartId: string, itemId: string): Promise<CartEntity>;
  clear(cartId: string): Promise<CartEntity>;
  markStatus(cartId: string, status: 'CONVERTED' | 'ABANDONED' | 'EXPIRED'): Promise<void>;
  mergeAnonymousInto(
    anonymousId: string,
    userId: string,
  ): Promise<{ target: CartEntity; itemsMerged: number } | null>;
  expireStaleCarts(now: Date): Promise<number>;
}
