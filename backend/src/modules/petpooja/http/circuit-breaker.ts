import { Logger } from '@nestjs/common';

/**
 * In-house circuit breaker (no opossum dependency). Three states:
 *   CLOSED    — normal traffic; failures counted
 *   OPEN      — all calls rejected until cooldown expires
 *   HALF_OPEN — a single probe call is allowed; success closes, failure re-opens
 */
export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  failureThreshold: number;
  cooldownMs: number;
  halfOpenMax: number;
  name: string;
}

export class CircuitBreakerOpenError extends Error {
  constructor(name: string, retryAfterMs: number) {
    super(`Circuit breaker "${name}" is OPEN; retry in ${retryAfterMs}ms`);
    this.name = 'CircuitBreakerOpenError';
  }
}

export class CircuitBreaker {
  private readonly logger: Logger;
  private state: BreakerState = 'CLOSED';
  private failures = 0;
  private openedAt = 0;
  private halfOpenInFlight = 0;

  constructor(private readonly opts: CircuitBreakerOptions) {
    this.logger = new Logger(`CircuitBreaker[${opts.name}]`);
  }

  get currentState(): BreakerState {
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed < this.opts.cooldownMs) {
        throw new CircuitBreakerOpenError(this.opts.name, this.opts.cooldownMs - elapsed);
      }
      this.transition('HALF_OPEN');
    }
    if (this.state === 'HALF_OPEN') {
      if (this.halfOpenInFlight >= this.opts.halfOpenMax) {
        throw new CircuitBreakerOpenError(this.opts.name, this.opts.cooldownMs);
      }
      this.halfOpenInFlight += 1;
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    } finally {
      if (this.state === 'HALF_OPEN' && this.halfOpenInFlight > 0) {
        this.halfOpenInFlight -= 1;
      }
    }
  }

  private onSuccess(): void {
    if (this.state !== 'CLOSED') this.transition('CLOSED');
    this.failures = 0;
  }

  private onFailure(): void {
    this.failures += 1;
    if (this.state === 'HALF_OPEN' || this.failures >= this.opts.failureThreshold) {
      this.openedAt = Date.now();
      this.transition('OPEN');
    }
  }

  private transition(next: BreakerState): void {
    if (this.state === next) return;
    this.logger.warn(`${this.state} → ${next} (failures=${this.failures})`);
    this.state = next;
    if (next === 'CLOSED') this.failures = 0;
  }
}
