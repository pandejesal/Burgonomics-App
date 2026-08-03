import { Module } from '@nestjs/common';
import { AnalyticsModule } from '@modules/analytics';
import { HealthModule } from '@modules/health/health.module';
import { UsersModule } from '@modules/users';
import { StoresModule } from '@modules/stores';
import { OrdersModule } from '@modules/orders';
import { CouponsModule } from '@modules/coupons';
import { OffersModule } from '@modules/offers';
import { NotificationsModule } from '@modules/notifications';
import { PetpoojaSyncModule } from '@modules/petpooja-sync';
import { MenuModule } from '@modules/menu';
import { FeatureFlagsModule } from '@modules/feature-flags';
import { AdminDashboardController } from './controllers/admin-dashboard.controller';
import { AdminOperationsController } from './controllers/admin-operations.controller';
import { AdminOrchestrationController } from './controllers/admin-orchestration.controller';
import { DashboardService } from './services/dashboard.service';
import { QueueOpsService } from './services/queue-ops.service';
import { WebhookOpsService } from './services/webhook-ops.service';
import { PaymentOpsService } from './services/payment-ops.service';
import { SystemHealthService } from './services/system-health.service';
import { AdminOpsPrismaRepository } from './repositories/prisma/admin-ops.prisma-repository';
import { ADMIN_OPS_REPOSITORY } from './repositories/interfaces/admin-ops-repository.interface';

@Module({
  imports: [
    AnalyticsModule,
    HealthModule,
    UsersModule,
    StoresModule,
    OrdersModule,
    CouponsModule,
    OffersModule,
    NotificationsModule,
    PetpoojaSyncModule,
    MenuModule,
    FeatureFlagsModule,
  ],
  controllers: [AdminDashboardController, AdminOperationsController, AdminOrchestrationController],
  providers: [
    DashboardService,
    QueueOpsService,
    WebhookOpsService,
    PaymentOpsService,
    SystemHealthService,
    AdminOpsPrismaRepository,
    { provide: ADMIN_OPS_REPOSITORY, useExisting: AdminOpsPrismaRepository },
  ],
})
export class AdminModule {}
