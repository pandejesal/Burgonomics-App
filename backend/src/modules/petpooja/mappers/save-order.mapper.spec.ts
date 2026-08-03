import { toSaveOrderRequest } from '../mappers/save-order.mapper';
import { SaveOrderRequestSchema } from '../dto/petpooja.dto';

describe('toSaveOrderRequest', () => {
  const creds = { app_key: 'k', app_secret: 's', access_token: 't' };
  const store = {
    id: 's1',
    petpoojaRestId: 'REST-1',
    name: 'Burg 1',
    address: '1 Foo',
    city: 'BLR',
    state: 'KA',
    pincode: '560001',
    country: 'IN',
    phone: '9998887777',
    latitude: null,
    longitude: null,
    status: 'OPEN' as const,
    turnOnAt: null,
    minPrepMinutes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const user = {
    id: 'u1',
    phone: '9876543210',
    email: 'j@j.com',
    name: 'Jane',
    avatarUrl: null,
    role: 'CUSTOMER' as never,
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const address = null;
  const order = {
    id: 'o1',
    clientOrderId: 'CO-1',
    petpoojaOrderId: null,
    userId: 'u1',
    storeId: 's1',
    addressId: null,
    fulfillment: 'TAKEAWAY' as const,
    status: 'PAYMENT_VERIFIED' as const,
    tableNumber: null,
    currency: 'INR',
    subtotal: '100.00',
    itemDiscount: '0',
    offerDiscount: '10.00',
    couponDiscount: '5.00',
    couponCode: 'X10',
    taxes: '5.25',
    packingFee: '0',
    deliveryFee: '0',
    serviceCharge: '0',
    roundOff: '0',
    grandTotal: '90.25',
    pricingSnapshot: {},
    taxSnapshot: null,
    customerNotes: null,
    paymentReference: 'pay_1',
    prepEtaMinutes: null,
    placedAt: new Date(),
    acceptedAt: null,
    readyAt: null,
    dispatchedAt: null,
    deliveredAt: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    events: [],
    items: [
      {
        id: 'oi1',
        orderId: 'o1',
        productId: 'p1',
        productPetpoojaId: 'PP-1',
        name: 'Burger',
        quantity: 1,
        unitPrice: '99.00',
        taxRate: '5.00',
        lineTotal: '99.00',
        notes: null,
        modifiers: [
          {
            id: 'm1',
            orderItemId: 'oi1',
            groupId: 'g1',
            groupName: 'Extras',
            optionId: 'op1',
            optionPetpoojaId: 'ADDON-1',
            optionName: 'Cheese',
            priceDelta: '15.00',
          },
        ],
      },
    ],
  };

  it('produces a schema-valid save_order payload', () => {
    const payload = toSaveOrderRequest({
      order: order as never,
      store,
      user: user as never,
      address,
      credentials: creds,
    });
    const parsed = SaveOrderRequestSchema.parse(payload);
    expect(parsed.restID).toBe('REST-1');
    expect(parsed.OrderInfo.Order.orderID).toBe('CO-1');
    expect(parsed.OrderInfo.OrderItem[0].id).toBe('PP-1');
    expect(parsed.OrderInfo.OrderItem[0].AddonItem[0].id).toBe('ADDON-1');
    expect(parsed.OrderInfo.OrderItem[0].AddonItem[0].price).toBe('15.00');
    expect(parsed.OrderInfo.Discount.length).toBeGreaterThanOrEqual(2);
  });
});
