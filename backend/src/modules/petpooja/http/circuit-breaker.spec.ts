import { CircuitBreaker, CircuitBreakerOpenError } from '../http/circuit-breaker';

describe('CircuitBreaker', () => {
  it('opens after failureThreshold failures', async () => {
    const b = new CircuitBreaker({
      name: 't',
      failureThreshold: 2,
      cooldownMs: 1000,
      halfOpenMax: 1,
    });
    await expect(b.execute(() => Promise.reject(new Error('x')))).rejects.toThrow('x');
    await expect(b.execute(() => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(b.currentState).toBe('OPEN');
    await expect(b.execute(() => Promise.resolve(1))).rejects.toBeInstanceOf(
      CircuitBreakerOpenError,
    );
  });

  it('half-opens after cooldown and closes on success', async () => {
    const b = new CircuitBreaker({
      name: 't2',
      failureThreshold: 1,
      cooldownMs: 10,
      halfOpenMax: 1,
    });
    await expect(b.execute(() => Promise.reject(new Error('x')))).rejects.toThrow();
    expect(b.currentState).toBe('OPEN');
    await new Promise((r) => setTimeout(r, 20));
    const v = await b.execute(() => Promise.resolve(42));
    expect(v).toBe(42);
    expect(b.currentState).toBe('CLOSED');
  });
});
