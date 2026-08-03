import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@infra/queue/queue.constants';
import { DomainEventBus } from '@infra/events/domain-event-bus';
import { CategoriesService } from '@modules/categories/services/categories.service';
import { ProductsService } from '@modules/products/services/products.service';
import { ModifiersService } from '@modules/modifiers/services/modifiers.service';
import { OffersService } from '@modules/offers/services/offers.service';
import { MenuCacheService } from '@modules/menu/services/menu-cache.service';
import { OrdersService } from '@modules/orders/services/orders.service';
import { PrismaService } from '@infra/prisma/prisma.service';
import { PetpoojaService } from './petpooja.service';
import { PetpoojaCredentialsService } from './petpooja-credentials.service';
import { toSaveOrderRequest } from '../mappers/save-order.mapper';
import { mapMenuEnvelope } from '../mappers/menu-push.mapper';
import { translateOrderCallback } from '../mappers/order-callback.mapper';
import { translateStockWebhook, translateStoreStatusWebhook } from '../mappers/store-status.mapper';
import type {
  OrderCallbackWebhook,
  PushMenuWebhook,
  StockUpdateWebhook,
  StoreStatusWebhook,
} from '../dto/petpooja.dto';
import {
  PETPOOJA_EVENTS,
  type MenuSyncedEvent,
  type OrderCallbackAppliedEvent,
  type OrderSentToPetpoojaEvent,
  type StockUpdatedEvent,
  type StoreStatusChangedEvent,
} from '../events/petpooja.events';

/**
 * PetpoojaAdapter — the ONE facade every other module uses to interact
 * with PETPOOJA. Feature modules must never touch PetpoojaService or
 * PetpoojaHttpClient directly. This adapter:
 *
 *  • enqueues outbound work (save order, cancel, rider) on BullMQ
 *  • ingests inbound webhook payloads into domain services
 *  • emits domain events for cross-module reactions
 *  • is the single call-site that knows PETPOOJA DTO shapes
 */
@Injectable()
export class PetpoojaAdapter {
  private readonly logger = new Logger(PetpoojaAdapter.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly petpooja: PetpoojaService,
    private readonly credentials: PetpoojaCredentialsService,
    private readonly categories: CategoriesService,
    private readonly products: ProductsService,
    private readonly modifiers: ModifiersService,
    private readonly offers: OffersService,
    private readonly orders: OrdersService,
    private readonly menuCache: MenuCacheService,
    private readonly bus: DomainEventBus,
    @InjectQueue(QUEUE_NAMES.PETPOOJA_SAVE_ORDER) private readonly saveOrderQ: Queue,
    @InjectQueue(QUEUE_NAMES.PETPOOJA_ORDER_CANCEL) private readonly cancelQ: Queue,
    @InjectQueue(QUEUE_NAMES.PETPOOJA_RIDER_UPDATE) private readonly riderQ: Queue,
    @InjectQueue(QUEUE_NAMES.PETPOOJA_WEBHOOK_PROCESS) private readonly webhookQ: Queue,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // Outbound (queue producers)
  // ═══════════════════════════════════════════════════════════

  async enqueueSaveOrder(orderId: string, correlationId?: string) {
    return this.saveOrderQ.add(
      'save',
      { orderId, correlationId },
      {
        jobId: `save-order:${orderId}`,
        attempts: 8,
        backoff: { type: 'exponential', delay: 5_000 },
      },
    );
  }

  async enqueueCancelOrder(orderId: string, reason: string, correlationId?: string) {
    return this.cancelQ.add(
      'cancel',
      { orderId, reason, correlationId },
      {
        jobId: `cancel-order:${orderId}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
      },
    );
  }

  async enqueueRiderUpdate(
    orderId: string,
    status: string,
    riderName: string,
    riderPhone: string,
    correlationId?: string,
  ) {
    return this.riderQ.add(
      'rider',
      { orderId, status, riderName, riderPhone, correlationId },
      { attempts: 5, backoff: { type: 'exponential', delay: 3_000 } },
    );
  }

  async enqueueWebhook(webhookEventId: string, webhookType: string, correlationId?: string) {
    return this.webhookQ.add(
      webhookType,
      { webhookEventId, webhookType, correlationId },
      {
        jobId: `webhook:${webhookEventId}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 3_000 },
      },
    );
  }

  // ═══════════════════════════════════════════════════════════
  // Outbound (called by consumers)
  // ═══════════════════════════════════════════════════════════

  /**
   * Composes and dispatches a /save_order call. Called by the
   * save-order consumer. Idempotent: PETPOOJA dedups by
   * `OrderInfo.Order.orderID` (== our clientOrderId).
   */
  async dispatchSaveOrder(orderId: string, correlationId?: string): Promise<void> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { modifiers: true } },
      },
    });
    if (!row) throw new NotFoundException(`Order ${orderId} not found`);
    if (row.petpoojaOrderId) {
      this.logger.log(
        `[${correlationId}] Order ${orderId} already linked to PETPOOJA ${row.petpoojaOrderId}; skip.`,
      );
      return;
    }

    const [store, user, address] = await Promise.all([
      this.prisma.store.findUnique({ where: { id: row.storeId } }),
      this.prisma.user.findUnique({ where: { id: row.userId } }),
      row.addressId
        ? this.prisma.address.findUnique({ where: { id: row.addressId } })
        : Promise.resolve(null),
    ]);
    if (!store) throw new NotFoundException(`Store ${row.storeId} not found`);
    if (!user) throw new NotFoundException(`User ${row.userId} not found`);

    const payload = toSaveOrderRequest({
      order: {
        ...row,
        subtotal: row.subtotal.toString(),
        itemDiscount: row.itemDiscount.toString(),
        offerDiscount: row.offerDiscount.toString(),
        couponDiscount: row.couponDiscount.toString(),
        taxes: row.taxes.toString(),
        packingFee: row.packingFee.toString(),
        deliveryFee: row.deliveryFee.toString(),
        serviceCharge: row.serviceCharge.toString(),
        roundOff: row.roundOff.toString(),
        grandTotal: row.grandTotal.toString(),
        pricingSnapshot: row.pricingSnapshot as Record<string, unknown>,
        taxSnapshot: (row.taxSnapshot as Record<string, unknown>) ?? null,
        items: row.items.map((i) => ({
          ...i,
          unitPrice: i.unitPrice.toString(),
          taxRate: i.taxRate.toString(),
          lineTotal: i.lineTotal.toString(),
          modifiers: i.modifiers.map((m) => ({
            ...m,
            priceDelta: m.priceDelta.toString(),
          })),
        })),
        events: [],
      } as never,
      store: { ...store } as never,
      user: { ...user } as never,
      address: address as never,
      credentials: this.credentials.credentials(),
    });

    const ack = await this.petpooja.saveOrder(payload, correlationId);
    const petpoojaOrderId = ack.orderID ?? `PP-${Date.now()}`;
    await this.orders.linkPetpoojaOrderId(orderId, petpoojaOrderId, correlationId);
    this.bus.publish<OrderSentToPetpoojaEvent>(PETPOOJA_EVENTS.ORDER_SENT, {
      orderId,
      petpoojaOrderId,
      correlationId,
    });
  }

  async dispatchCancelOrder(
    orderId: string,
    reason: string,
    correlationId?: string,
  ): Promise<void> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: false },
    });
    if (!row) throw new NotFoundException(`Order ${orderId} not found`);
    const store = await this.prisma.store.findUnique({ where: { id: row.storeId } });
    if (!store) throw new NotFoundException(`Store ${row.storeId} not found`);

    await this.petpooja.cancelOrder(
      {
        restID: store.petpoojaRestId,
        clientorderID: row.clientOrderId,
        cancelReason: reason,
        status: '-1',
      },
      correlationId,
    );
  }

  async dispatchRiderUpdate(
    orderId: string,
    status: string,
    riderName: string,
    riderPhone: string,
    correlationId?: string,
  ): Promise<void> {
    const row = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!row) throw new NotFoundException(`Order ${orderId} not found`);
    await this.petpooja.riderStatusUpdate(
      {
        status: status as never,
        order_id: row.clientOrderId,
        external_order_id: row.petpoojaOrderId ?? '',
        rider_data: {
          rider_name: riderName,
          rider_phone_number: riderPhone,
        },
      },
      correlationId,
    );
  }

  // ═══════════════════════════════════════════════════════════
  // Inbound webhook ingestion (called by webhook processor)
  // ═══════════════════════════════════════════════════════════

  async ingestPushMenu(payload: PushMenuWebhook, correlationId?: string): Promise<void> {
    const envelope = mapMenuEnvelope(payload);

    // Categories first (referenced by products), then modifier groups,
    // then products (need both), then offers.
    const categoryDbByPetpooja = new Map<string, string>();
    for (const cat of envelope.categories) {
      const parentDbId = cat.parentPetpoojaId
        ? (categoryDbByPetpooja.get(cat.parentPetpoojaId) ?? null)
        : null;
      const entity = await this.categories.upsertFromPetpooja(cat, parentDbId, correlationId);
      categoryDbByPetpooja.set(cat.petpoojaId, entity.id);
    }

    const modifierGroupDbByPetpooja = new Map<string, string>();
    for (const g of envelope.modifierGroups) {
      const entity = await this.modifiers.upsertFromPetpooja(g, correlationId);
      modifierGroupDbByPetpooja.set(g.petpoojaId, entity.id);
    }

    for (const p of envelope.products) {
      const categoryDbId = categoryDbByPetpooja.get(p.categoryPetpoojaId);
      if (!categoryDbId) {
        this.logger.warn(
          `Product ${p.petpoojaId} references unknown category ${p.categoryPetpoojaId}; skipping.`,
        );
        continue;
      }
      const modifierGroupDbIds = p.modifierGroupPetpoojaIds
        .map((id) => modifierGroupDbByPetpooja.get(id))
        .filter((v): v is string => Boolean(v));
      await this.products.upsertFromPetpooja(p, categoryDbId, modifierGroupDbIds, correlationId);
    }

    for (const o of envelope.offers) {
      await this.offers.upsertFromPetpooja(o, correlationId);
    }

    await this.menuCache.invalidate();
    this.bus.publish<MenuSyncedEvent>(PETPOOJA_EVENTS.MENU_SYNCED, {
      restaurantPetpoojaId: envelope.restaurantPetpoojaId,
      counts: {
        categories: envelope.categories.length,
        products: envelope.products.length,
        modifierGroups: envelope.modifierGroups.length,
        offers: envelope.offers.length,
      },
      correlationId,
    });
  }

  async ingestOrderCallback(payload: OrderCallbackWebhook, correlationId?: string): Promise<void> {
    const translation = translateOrderCallback(payload);
    const order = await this.prisma.order.findUnique({
      where: { clientOrderId: payload.orderID },
    });
    if (!order) {
      this.logger.warn(`Received order-callback for unknown orderID=${payload.orderID}`);
      return;
    }
    await this.orders.transition(order.id, translation.targetState, {
      reason: translation.reason,
      correlationId,
      patch: translation.patch,
    });
    this.bus.publish<OrderCallbackAppliedEvent>(PETPOOJA_EVENTS.ORDER_CALLBACK_APPLIED, {
      orderId: order.id,
      clientOrderId: order.clientOrderId,
      targetState: translation.targetState,
      correlationId,
    });
  }

  async ingestStockUpdate(payload: StockUpdateWebhook, correlationId?: string): Promise<void> {
    const t = translateStockWebhook(payload);
    const store = await this.prisma.store.findUnique({
      where: { petpoojaRestId: t.petpoojaRestId },
    });
    if (!store) {
      this.logger.warn(`Stock update for unknown restID=${t.petpoojaRestId}; skipped.`);
      return;
    }
    if (t.type !== 'item') {
      // Addon-level stock is not yet modelled in the domain; log and skip.
      this.logger.log(
        `Addon stock update ignored (type=${t.type}, count=${t.petpoojaItemIds.length}).`,
      );
      return;
    }
    for (const petpoojaItemId of t.petpoojaItemIds) {
      const product = await this.prisma.product.findUnique({
        where: { petpoojaId: petpoojaItemId },
      });
      if (!product) continue;
      await this.products.applyStockUpdate(
        {
          productPetpoojaId: petpoojaItemId,
          storePetpoojaRestId: t.petpoojaRestId,
          inStock: t.inStock,
        },
        product.id,
        store.id,
        'PETPOOJA_WEBHOOK',
        correlationId,
      );
    }
    await this.menuCache.invalidate(store.id);
    this.bus.publish<StockUpdatedEvent>(PETPOOJA_EVENTS.STOCK_UPDATED, {
      petpoojaRestId: t.petpoojaRestId,
      petpoojaItemIds: t.petpoojaItemIds,
      inStock: t.inStock,
      correlationId,
    });
  }

  async ingestStoreStatus(payload: StoreStatusWebhook, correlationId?: string): Promise<void> {
    const t = translateStoreStatusWebhook(payload);
    const store = await this.prisma.store.update({
      where: { petpoojaRestId: t.petpoojaRestId },
      data: {
        status: t.status,
        turnOnAt: t.turnOnAt,
      },
    });
    await this.menuCache.invalidate(store.id);
    this.bus.publish<StoreStatusChangedEvent>(PETPOOJA_EVENTS.STORE_STATUS_CHANGED, {
      storeId: store.id,
      petpoojaRestId: t.petpoojaRestId,
      status: t.status,
      turnOnAt: t.turnOnAt,
      reason: t.reason,
      correlationId,
    });
  }

  /**
   * Handles PETPOOJA's get_store_status probe by returning our current
   * store state. Called synchronously by the webhook controller so
   * PETPOOJA gets a live response.
   */
  async computeStoreStatusResponse(petpoojaRestId: string) {
    const store = await this.prisma.store.findUnique({
      where: { petpoojaRestId },
    });
    if (!store) {
      return {
        restID: petpoojaRestId,
        status: 'error' as const,
        store_status: '0' as const,
        http_code: '500' as const,
        message: 'Store not registered',
      };
    }
    return {
      restID: petpoojaRestId,
      status: 'success' as const,
      store_status: store.status === 'OPEN' ? ('1' as const) : ('0' as const),
      http_code: '200' as const,
      message: store.status === 'OPEN' ? 'Store is currently active' : 'Store is currently closed',
    };
  }
}
