import { Inject, Injectable } from '@nestjs/common';
import {
  ORDER_REPOSITORY,
  type IOrderRepository,
} from '../repositories/interfaces/order-repository.interface';
import { NotFoundError } from '@common/errors';

@Injectable()
export class OrderTrackingService {
  constructor(@Inject(ORDER_REPOSITORY) private readonly repo: IOrderRepository) {}

  async timeline(orderId: string): Promise<{
    order: NonNullable<Awaited<ReturnType<IOrderRepository['findById']>>>;
    etaAt: Date | null;
  }> {
    const order = await this.repo.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    const etaAt = order.prepEtaMinutes
      ? new Date(order.placedAt.getTime() + order.prepEtaMinutes * 60_000)
      : null;
    return { order, etaAt };
  }
}
