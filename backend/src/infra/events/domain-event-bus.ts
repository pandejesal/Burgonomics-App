import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * In-process domain event bus. Prefer this for low-latency same-request
 * fan-out; use the transactional outbox (`OutboxService`) whenever the
 * publication must survive process crash / restart.
 */
@Injectable()
export class DomainEventBus {
  constructor(private readonly emitter: EventEmitter2) {}

  publish<T>(event: string, payload: T): void {
    this.emitter.emit(event, payload);
  }

  async publishAsync<T>(event: string, payload: T): Promise<unknown[]> {
    return this.emitter.emitAsync(event, payload);
  }
}
