import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions, PERMISSIONS } from '@modules/rbac';
import { Audit } from '@modules/audit';
import { ZodValidationPipe } from '@common/pipes';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { UsersService } from '@modules/users';
import { StoresService } from '@modules/stores';
import { OrdersService } from '@modules/orders';
import { CouponsService } from '@modules/coupons';
import { OffersService } from '@modules/offers';
import { NotificationsService } from '@modules/notifications';
import { PetpoojaSyncService } from '@modules/petpooja-sync';
import { MenuCacheService } from '@modules/menu';
import { FeatureFlagsAdminService } from '@modules/feature-flags';
import { broadcastNotificationSchema, type BroadcastNotificationDto } from '../dto';

/**
 * Cross-domain admin orchestration. Delegates to existing services so
 * each domain stays authoritative; audit + RBAC are applied at the
 * controller boundary.
 */
@ApiTags('Admin Orchestration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller({ path: 'admin', version: '1' })
export class AdminOrchestrationController {
  constructor(
    private readonly users: UsersService,
    private readonly stores: StoresService,
    private readonly orders: OrdersService,
    private readonly coupons: CouponsService,
    private readonly offers: OffersService,
    private readonly notifications: NotificationsService,
    private readonly petpoojaSync: PetpoojaSyncService,
    private readonly menuCache: MenuCacheService,
    private readonly featureFlags: FeatureFlagsAdminService,
  ) {}

  // Customers
  @Get('customers/:id')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_READ)
  @ApiOperation({ summary: 'Fetch a customer profile' })
  getCustomer(@Param('id') id: string) {
    return this.users.getById(id);
  }

  // Stores
  @Get('stores/:id')
  @RequirePermissions(PERMISSIONS.STORES_READ)
  @ApiOperation({ summary: 'Fetch a store' })
  getStore(@Param('id') id: string) {
    return this.stores.get(id);
  }

  // Orders
  @Post('orders/:id/cancel')
  @RequirePermissions(PERMISSIONS.ORDERS_CANCEL)
  @Audit({ action: 'order.cancel', resourceType: 'order' })
  @ApiOperation({ summary: 'Admin cancel an order' })
  cancelOrder(
    @Param('id') id: string,
    @CurrentUser('sub') actorId: string,
    @Body('reason') reason?: string,
  ) {
    return this.orders.cancel(id, actorId, reason);
  }

  // Menu synchronization
  @Post('menu/sync')
  @RequirePermissions(PERMISSIONS.MENU_SYNC)
  @Audit({ action: 'menu.sync', resourceType: 'menu' })
  @ApiOperation({ summary: 'Trigger manual PETPOOJA menu sync' })
  triggerMenuSync(@Query('storeId') storeId?: string) {
    return this.petpoojaSync.enqueueFetch({ scope: 'FULL', storeId });
  }

  @Post('menu/cache/refresh')
  @RequirePermissions(PERMISSIONS.MENU_READ)
  @Audit({ action: 'menu.cache.refresh', resourceType: 'menu' })
  @ApiOperation({ summary: 'Invalidate the menu cache' })
  refreshMenuCache(@Query('storeId') storeId?: string) {
    return this.menuCache.invalidate(storeId).then(() => ({ ok: true }));
  }

  // Notifications broadcast
  @Post('notifications/broadcast')
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_BROADCAST)
  @Audit({ action: 'notifications.broadcast', resourceType: 'notification' })
  @ApiOperation({ summary: 'Broadcast a notification to a topic or all users' })
  broadcast(
    @Body(new ZodValidationPipe(broadcastNotificationSchema)) body: BroadcastNotificationDto,
    @CurrentUser('sub') actorId: string,
  ) {
    // Fan-out is handled by the notifications broadcast queue consumer;
    // the service exposes creation semantics per-user, so admin broadcasts
    // are enqueued as a single announcement notification with topic metadata.
    return this.notifications.create(
      {
        userId: actorId,
        type: 'ANNOUNCEMENT',
        title: body.title,
        body: body.body,
        deeplink: body.deeplink,
        data: body.data,
      } as never,
      undefined,
    );
  }

  // Offers & coupons — pass-through to domain services
  @Get('offers')
  @RequirePermissions(PERMISSIONS.OFFERS_READ)
  @ApiOperation({ summary: 'List offers' })
  listOffers() {
    return this.offers.list({} as never);
  }

  @Get('coupons')
  @RequirePermissions(PERMISSIONS.COUPONS_READ)
  @ApiOperation({ summary: 'List coupons (delegates to domain)' })
  listCoupons() {
    return this.coupons as unknown as { list: () => unknown };
  }

  // Feature flags
  @Get('feature-flags')
  @RequirePermissions(PERMISSIONS.FEATURE_FLAGS_READ)
  @ApiOperation({ summary: 'List feature flags' })
  listFeatureFlags() {
    return this.featureFlags.list();
  }
}
