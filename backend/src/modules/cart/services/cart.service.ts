import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError, ValidationError } from '@common/errors';
import { DomainEventBus } from '@infra/events/domain-event-bus';
import { ProductsService } from '@modules/products/services/products.service';
import { ModifiersService } from '@modules/modifiers/services/modifiers.service';
import { PricingEngineService } from '@modules/pricing/services/pricing-engine.service';
import {
  CART_REPOSITORY,
  type ICartRepository,
  type AddItemArgs,
} from '../repositories/interfaces/cart-repository.interface';
import type { CartEntity, FulfillmentType } from '../entities/cart.entity';
import {
  CART_EVENTS,
  type CartItemEvent,
  type CartLifecycleEvent,
  type CartMergedEvent,
} from '../events/cart.events';
import type { CartTotalsDto } from '../dto';
import type { AddItemInput, UpdateItemInput } from '../validators/cart.validators';

const CART_TTL_MINUTES = 60 * 24; // 24h

export interface CartOwnerContext {
  userId?: string | null;
  anonymousId?: string | null;
}

@Injectable()
export class CartService {
  constructor(
    @Inject(CART_REPOSITORY) private readonly repo: ICartRepository,
    private readonly products: ProductsService,
    private readonly modifiers: ModifiersService,
    private readonly pricing: PricingEngineService,
    private readonly bus: DomainEventBus,
  ) {}

  private expiryDate(): Date {
    return new Date(Date.now() + CART_TTL_MINUTES * 60_000);
  }

  async getOrCreateActive(
    ctx: CartOwnerContext,
    fulfillment: FulfillmentType = 'TAKEAWAY',
  ): Promise<CartEntity> {
    if (ctx.userId) {
      const existing = await this.repo.findActiveByUser(ctx.userId);
      if (existing) return existing;
    } else if (ctx.anonymousId) {
      const existing = await this.repo.findActiveByAnonymous(ctx.anonymousId);
      if (existing) return existing;
    } else {
      throw new ValidationError('userId or anonymousId required to open a cart');
    }
    const cart = await this.repo.create({
      userId: ctx.userId ?? null,
      anonymousId: ctx.anonymousId ?? null,
      fulfillment,
      expiresAt: this.expiryDate(),
    });
    this.publish(CART_EVENTS.CREATED, cart);
    return cart;
  }

  async getById(id: string): Promise<CartEntity> {
    const c = await this.repo.findById(id);
    if (!c) throw new NotFoundError('Cart not found');
    return c;
  }

  async updateMeta(
    cartId: string,
    args: Parameters<ICartRepository['updateMeta']>[1],
  ): Promise<CartEntity> {
    const c = await this.repo.updateMeta(cartId, args);
    this.publish(CART_EVENTS.UPDATED, c);
    return c;
  }

  async addItem(cartId: string, input: AddItemInput): Promise<CartEntity> {
    const { product, images: _images, modifierGroupIds } = await this.products.get(input.productId);
    const resolvedModifiers: AddItemArgs['modifiers'] = [];

    if (input.modifiers?.length) {
      for (const sel of input.modifiers) {
        if (!modifierGroupIds.includes(sel.groupId)) {
          throw new ValidationError(`Modifier group ${sel.groupId} not valid for this product`);
        }
        const group = await this.modifiers.get(sel.groupId);
        const option = group.options.find((o) => o.id === sel.optionId);
        if (!option) throw new ValidationError(`Modifier option ${sel.optionId} not found`);
        resolvedModifiers.push({
          groupId: group.group.id,
          groupName: group.group.name,
          optionId: option.id,
          optionPetpoojaId: option.petpoojaId,
          optionName: option.name,
          priceDelta: option.price,
        });
      }
    }

    const cart = await this.repo.addItem(cartId, {
      productId: product.id,
      productPetpoojaId: product.petpoojaId,
      name: product.name,
      quantity: input.quantity,
      unitPrice: product.basePrice,
      taxRate: product.taxRate,
      notes: input.notes ?? null,
      modifiers: resolvedModifiers,
    });
    const added = cart.items.at(-1)!;
    this.publish<CartItemEvent>(CART_EVENTS.ITEM_ADDED, {
      cartId: cart.id,
      userId: cart.userId,
      anonymousId: cart.anonymousId,
      storeId: cart.storeId,
      itemId: added.id,
      productId: added.productId,
      quantity: added.quantity,
    });
    return cart;
  }

  async updateItem(cartId: string, itemId: string, input: UpdateItemInput): Promise<CartEntity> {
    let modifiers: AddItemArgs['modifiers'] | undefined;
    if (input.modifiers) {
      modifiers = [];
      for (const sel of input.modifiers) {
        const group = await this.modifiers.get(sel.groupId);
        const option = group.options.find((o) => o.id === sel.optionId);
        if (!option) throw new ValidationError(`Modifier option ${sel.optionId} not found`);
        modifiers.push({
          groupId: group.group.id,
          groupName: group.group.name,
          optionId: option.id,
          optionPetpoojaId: option.petpoojaId,
          optionName: option.name,
          priceDelta: option.price,
        });
      }
    }
    const cart = await this.repo.updateItem(cartId, itemId, {
      quantity: input.quantity,
      notes: input.notes,
      modifiers,
    });
    this.publish(CART_EVENTS.ITEM_UPDATED, cart);
    return cart;
  }

  async removeItem(cartId: string, itemId: string): Promise<CartEntity> {
    const cart = await this.repo.removeItem(cartId, itemId);
    this.publish(CART_EVENTS.ITEM_REMOVED, cart);
    return cart;
  }

  async clear(cartId: string): Promise<CartEntity> {
    const cart = await this.repo.clear(cartId);
    this.publish(CART_EVENTS.CLEARED, cart);
    return cart;
  }

  async mergeAnonymousIntoUser(anonymousId: string, userId: string): Promise<CartEntity> {
    const res = await this.repo.mergeAnonymousInto(anonymousId, userId);
    if (!res) return this.getOrCreateActive({ userId });
    this.bus.publish<CartMergedEvent>(CART_EVENTS.MERGED, {
      sourceCartId: res.target.id,
      targetCartId: res.target.id,
      userId,
      itemsMerged: res.itemsMerged,
    });
    return res.target;
  }

  computeTotals(
    cart: CartEntity,
    opts?: { couponDiscount?: string; offerDiscount?: string },
  ): CartTotalsDto {
    return this.pricing.priceCart({
      items: cart.items,
      fulfillment: cart.fulfillment,
      currency: cart.currency,
      couponDiscount: opts?.couponDiscount ?? '0',
      offerDiscount: opts?.offerDiscount ?? '0',
    });
  }

  async validateForCheckout(
    cart: CartEntity,
  ): Promise<{ valid: boolean; issues: { code: string; message: string; itemId?: string }[] }> {
    const issues: { code: string; message: string; itemId?: string }[] = [];
    if (!cart.items.length) issues.push({ code: 'EMPTY_CART', message: 'Cart is empty' });
    if (!cart.storeId) issues.push({ code: 'STORE_REQUIRED', message: 'Store must be selected' });
    if (cart.fulfillment === 'DELIVERY' && !cart.addressId) {
      issues.push({ code: 'ADDRESS_REQUIRED', message: 'Delivery address required' });
    }
    if (cart.fulfillment === 'DINE_IN' && !cart.tableNumber) {
      issues.push({ code: 'TABLE_REQUIRED', message: 'Table number required for dine-in' });
    }
    for (const item of cart.items) {
      if (!cart.storeId) continue;
      const avail = await this.products.availability(item.productId, cart.storeId);
      if (!avail || !avail.isAvailable || !avail.inStock) {
        issues.push({
          code: 'UNAVAILABLE',
          message: `${item.name} is unavailable at this store`,
          itemId: item.id,
        });
      }
    }
    return { valid: issues.length === 0, issues };
  }

  async expireStale(): Promise<number> {
    return this.repo.expireStaleCarts(new Date());
  }

  private publish<T extends CartLifecycleEvent = CartLifecycleEvent>(
    event: string,
    payload: CartEntity | T,
  ): void {
    if ('id' in payload && 'items' in payload) {
      const c = payload as CartEntity;
      this.bus.publish<CartLifecycleEvent>(event, {
        cartId: c.id,
        userId: c.userId,
        anonymousId: c.anonymousId,
        storeId: c.storeId,
      });
    } else {
      this.bus.publish<T>(event, payload as T);
    }
  }
}
