import { Module } from '@nestjs/common';
import { CategoriesModule } from '@modules/categories/categories.module';
import { ProductsModule } from '@modules/products/products.module';
import { ModifiersModule } from '@modules/modifiers/modifiers.module';
import { OffersModule } from '@modules/offers/offers.module';
import { MenuModule } from '@modules/menu/menu.module';
import { OrdersModule } from '@modules/orders/orders.module';
import { PetpoojaHttpClient } from './http/petpooja-http.client';
import { PetpoojaCredentialsService } from './services/petpooja-credentials.service';
import { PetpoojaService } from './services/petpooja.service';
import { PetpoojaAdapter } from './services/petpooja-adapter.service';
import { WebhookProcessorService } from './services/webhook-processor.service';
import { OrderOutboundBridge } from './services/order-outbound.bridge';
import { PetpoojaWebhookController } from './controllers/petpooja-webhook.controller';
import { PetpoojaDirectWebhookController } from './controllers/petpooja-direct-webhook.controller';
import { PetpoojaAdminController } from './controllers/petpooja-admin.controller';
import { PetpoojaMobileController } from './controllers/petpooja-mobile.controller';
import { PetpoojaWebhookGuard } from './guards/petpooja-webhook.guard';
import { PetpoojaSaveOrderConsumer } from './consumers/petpooja-save-order.consumer';
import { PetpoojaOrderCancelConsumer } from './consumers/petpooja-order-cancel.consumer';
import { PetpoojaRiderUpdateConsumer } from './consumers/petpooja-rider-update.consumer';
import { PetpoojaWebhookProcessorConsumer } from './consumers/petpooja-webhook-processor.consumer';
import {
  PetpoojaWebhookPrismaRepository,
  PETPOOJA_WEBHOOK_REPOSITORY,
} from './repositories/petpooja-webhook.repository';

/**
 * PETPOOJA Integration Module.
 *
 * Owns the entire PETPOOJA surface area:
 *   • HTTP client (retries / breaker / metrics)
 *   • Credential provisioning
 *   • Outbound typed service (`PetpoojaService`)
 *   • Facade (`PetpoojaAdapter`) — the ONLY entry-point for other modules
 *   • Webhook ingress + async processor
 *   • BullMQ consumers for save_order / cancel / rider / webhook
 *
 * Domain modules never import PETPOOJA DTOs. They interact through the
 * adapter or by consuming events on the domain event bus.
 */
@Module({
  imports: [
    CategoriesModule,
    ProductsModule,
    ModifiersModule,
    OffersModule,
    MenuModule,
    OrdersModule,
  ],
  controllers: [PetpoojaWebhookController, PetpoojaAdminController],
  providers: [
    PetpoojaCredentialsService,
    PetpoojaHttpClient,
    PetpoojaService,
    PetpoojaAdapter,
    WebhookProcessorService,
    OrderOutboundBridge,
    PetpoojaWebhookGuard,
    PetpoojaSaveOrderConsumer,
    PetpoojaOrderCancelConsumer,
    PetpoojaRiderUpdateConsumer,
    PetpoojaWebhookProcessorConsumer,
    PetpoojaWebhookPrismaRepository,
    {
      provide: PETPOOJA_WEBHOOK_REPOSITORY,
      useExisting: PetpoojaWebhookPrismaRepository,
    },
  ],
  exports: [PetpoojaAdapter, PetpoojaService, PetpoojaCredentialsService],
})
export class PetpoojaModule {}
