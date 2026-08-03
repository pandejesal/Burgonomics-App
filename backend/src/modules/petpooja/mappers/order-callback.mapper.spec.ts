import { translateOrderCallback } from '../mappers/order-callback.mapper';
import { PETPOOJA_CALLBACK_STATUS } from '../constants';

describe('translateOrderCallback', () => {
  const base = {
    restID: 'R1',
    orderID: 'CO1',
    cancel_reason: null,
    minimum_prep_time: null,
    minimum_delivery_time: null,
    rider_name: null,
    rider_phone_number: null,
    is_modified: false,
  };

  it('translates ACCEPTED_1 → ORDER_ACCEPTED with acceptedAt', () => {
    const r = translateOrderCallback({
      ...base,
      status: PETPOOJA_CALLBACK_STATUS.ACCEPTED_1,
      minimum_prep_time: '20',
    });
    expect(r.targetState).toBe('ORDER_ACCEPTED');
    expect(r.prepEtaMinutes).toBe(20);
    expect(r.patch.acceptedAt).toBeInstanceOf(Date);
  });

  it('translates FOOD_READY → READY', () => {
    const r = translateOrderCallback({
      ...base,
      status: PETPOOJA_CALLBACK_STATUS.FOOD_READY,
    });
    expect(r.targetState).toBe('READY');
    expect(r.patch.readyAt).toBeInstanceOf(Date);
  });

  it('translates DISPATCHED → OUT_FOR_DELIVERY with rider', () => {
    const r = translateOrderCallback({
      ...base,
      status: PETPOOJA_CALLBACK_STATUS.DISPATCHED,
      rider_name: 'John',
      rider_phone_number: '9999',
      minimum_delivery_time: '30',
    });
    expect(r.targetState).toBe('OUT_FOR_DELIVERY');
    expect(r.rider).toEqual({ name: 'John', phone: '9999' });
    expect(r.deliveryEtaMinutes).toBe(30);
  });

  it('translates DELIVERED → DELIVERED', () => {
    const r = translateOrderCallback({
      ...base,
      status: PETPOOJA_CALLBACK_STATUS.DELIVERED,
    });
    expect(r.targetState).toBe('DELIVERED');
    expect(r.patch.deliveredAt).toBeInstanceOf(Date);
  });

  it('translates CANCELLED → CANCELLED with reason', () => {
    const r = translateOrderCallback({
      ...base,
      status: PETPOOJA_CALLBACK_STATUS.CANCELLED,
      cancel_reason: 'kitchen closed',
    });
    expect(r.targetState).toBe('CANCELLED');
    expect(r.patch.cancellationReason).toBe('kitchen closed');
    expect(r.reason).toBe('kitchen closed');
  });
});
