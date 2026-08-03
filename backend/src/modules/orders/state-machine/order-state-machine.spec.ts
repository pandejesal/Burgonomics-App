import { OrderStateMachine } from './order-state-machine';

describe('OrderStateMachine', () => {
  it('permits happy-path progression', () => {
    expect(OrderStateMachine.canTransition('PAYMENT_PENDING', 'PAYMENT_VERIFIED')).toBe(true);
    expect(OrderStateMachine.canTransition('ORDER_ACCEPTED', 'PREPARING')).toBe(true);
    expect(OrderStateMachine.canTransition('OUT_FOR_DELIVERY', 'DELIVERED')).toBe(true);
  });

  it('rejects illegal jumps', () => {
    expect(OrderStateMachine.canTransition('CART', 'DELIVERED')).toBe(false);
    expect(() => OrderStateMachine.assertTransition('READY', 'CHECKOUT')).toThrow();
  });

  it('flags terminal states', () => {
    expect(OrderStateMachine.isTerminal('COMPLETED')).toBe(true);
    expect(OrderStateMachine.isTerminal('PREPARING')).toBe(false);
  });
});
