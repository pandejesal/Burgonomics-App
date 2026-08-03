import { Module } from '@nestjs/common';
import { ConfigurationModule } from '@config/configuration.module';
import { CommonModule } from '@common/common.module';
import { InfraModule } from '@infra/infra.module';
import { AuthModule } from '@modules/auth';
import { UsersModule } from '@modules/users';
import { AddressesModule } from '@modules/addresses/addresses.module';
import { StoresModule } from '@modules/stores/stores.module';
import { HealthModule } from '@modules/health/health.module';
import { FeatureFlagsModule as FeatureFlagsAdminModule } from '@modules/feature-flags/feature-flags.module';
import { StorageModule as DomainStorageModule } from '@modules/storage/storage.module';
import { CategoriesModule } from '@modules/categories/categories.module';
import { ProductsModule } from '@modules/products/products.module';
import { ModifiersModule } from '@modules/modifiers/modifiers.module';
import { MenuModule } from '@modules/menu/menu.module';
import { OffersModule } from '@modules/offers/offers.module';
import { SearchModule } from '@modules/search/search.module';
import { PetpoojaSyncModule } from '@modules/petpooja-sync/petpooja-sync.module';
import { PetpoojaModule } from '@modules/petpooja/petpooja.module';
import { CartModule } from '@modules/cart/cart.module';
import { PricingModule } from '@modules/pricing/pricing.module';
import { CouponsModule } from '@modules/coupons/coupons.module';
import { OrdersModule } from '@modules/orders/orders.module';
import { CheckoutModule } from '@modules/checkout/checkout.module';
import { PaymentsModule } from '@modules/payments/payments.module';
import { FirebaseModule } from '@modules/firebase';
import { RealtimeModule } from '@modules/realtime/realtime.module';
import { NotificationsModule } from '@modules/notifications';
import { RbacModule } from '@modules/rbac';
import { AuditModule } from '@modules/audit';
import { AnalyticsModule } from '@modules/analytics';
import { ReportsModule } from '@modules/reports';
import { SystemConfigModule } from '@modules/system-config';
import { AdminModule } from '@modules/admin';
import { AdminAuthModule } from './modules/admin-auth/admin-auth.module';

/**
 * Root application module. Feature modules layered on top of the
 * infrastructure and cross-cutting foundation.
 */
@Module({
  imports: [
    ConfigurationModule,
    CommonModule,
    InfraModule,
    AuthModule,
    UsersModule,
    AddressesModule,
    StoresModule,
    HealthModule,
    FeatureFlagsAdminModule,
    DomainStorageModule,
    // Catalog domain (PETPOOJA-owned)
    CategoriesModule,
    ProductsModule,
    ModifiersModule,
    MenuModule,
    OffersModule,
    SearchModule,
    PetpoojaSyncModule,
    // Commerce domain
    PricingModule,
    CartModule,
    CouponsModule,
    OrdersModule,
    CheckoutModule,
    PaymentsModule,
    // Realtime communication platform
    FirebaseModule,
    RealtimeModule,
    NotificationsModule,
    // PETPOOJA integration (must load after commerce so it can observe order events)
    PetpoojaModule,
    // Enterprise administration & operations
    RbacModule,
    AuditModule,
    SystemConfigModule,
    AnalyticsModule,
    ReportsModule,
    AdminModule,
    AdminAuthModule,
  ],
})
export class AppModule {}
