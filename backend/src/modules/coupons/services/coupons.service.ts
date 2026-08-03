import { Inject, Injectable } from '@nestjs/common';
import {
  COUPON_REPOSITORY,
  type ICouponRepository,
} from '../repositories/interfaces/coupon-repository.interface';

@Injectable()
export class CouponsService {
  constructor(@Inject(COUPON_REPOSITORY) private readonly repo: ICouponRepository) {}

  list(args: { storeId?: string; page: number; pageSize: number }) {
    return this.repo.list(args);
  }

  findByCode(code: string) {
    return this.repo.findByCode(code);
  }
}
