import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_OPS_REPOSITORY,
  type IAdminOpsRepository,
  type PaymentSearchFilter,
} from '../repositories/interfaces/admin-ops-repository.interface';

@Injectable()
export class PaymentOpsService {
  constructor(@Inject(ADMIN_OPS_REPOSITORY) private readonly repo: IAdminOpsRepository) {}

  search(filter: PaymentSearchFilter) {
    return this.repo.searchPayments(filter);
  }

  recentRefunds(limit = 50) {
    return this.repo.listRecentRefunds(limit);
  }

  detectDuplicates(windowMinutes = 60) {
    return this.repo.detectDuplicatePayments(windowMinutes);
  }

  reconcile(from: Date, to: Date) {
    return this.repo.reconcilePayments(from, to);
  }
}
