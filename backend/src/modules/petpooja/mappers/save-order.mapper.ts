import type { OrderEntity } from '@modules/orders/entities/order.entity';
import type { StoreEntity } from '@modules/stores/entities/store.entity';
import type { UserEntity } from '@modules/users/entities/user.entity';
import type { AddressEntity } from '@modules/addresses/entities/address.entity';
import type { CredentialBlock, SaveOrderRequest } from '../dto/petpooja.dto';

export interface SaveOrderMapperInput {
  order: OrderEntity;
  store: StoreEntity;
  user: UserEntity;
  address?: AddressEntity | null;
  credentials: CredentialBlock;
  deviceUdid?: string;
  deviceType?: string;
  preorderDate?: string;
  urgent?: { flag: '0' | '1'; minutes: number };
  ondcBap?: string;
  collectCash?: '0' | '1';
  otp?: string;
  dcTaxPercentage?: string;
  pcTaxPercentage?: string;
}

const money = (v: string | number | null | undefined): string => {
  if (v === null || v === undefined) return '0.00';
  const n = typeof v === 'string' ? Number(v) : v;
  if (Number.isNaN(n)) return '0.00';
  return n.toFixed(2);
};

const formatAddress = (a?: AddressEntity | null): string => {
  if (!a) return '';
  return [a.line1, a.line2, a.landmark, a.city, a.state, a.pincode].filter(Boolean).join(', ');
};

/**
 * Deterministically maps a persisted Order + Store + User context into
 * the PETPOOJA /save_order request envelope. Validated by
 * `SaveOrderRequestSchema` before dispatch. Contains ZERO domain
 * logic — pure translation.
 */
export function toSaveOrderRequest(input: SaveOrderMapperInput): SaveOrderRequest {
  const { order, store, user, address, credentials } = input;

  const taxLines = extractTaxes(order);
  const discountLines = extractDiscounts(order);

  return {
    ...credentials,
    res_name: store.name,
    address: [store.address, store.city, store.state, store.pincode].filter(Boolean).join(', '),
    Contact_information: store.phone ?? '',
    restID: store.petpoojaRestId,
    udid: input.deviceUdid ?? '',
    device_type: input.deviceType ?? 'Web',
    OrderInfo: {
      Customer: {
        name: user.name ?? 'Customer',
        email: user.email ?? '',
        phone: user.phone,
        address: formatAddress(address) || 'N/A',
      },
      Order: {
        clientorderID: order.clientOrderId,
        order_type: order.fulfillment === 'TAKEAWAY' ? 'PickUp' : order.fulfillment === 'DINE_IN' ? 'DineIn' : 'Delivery',
        payment_type: order.paymentReference ? 'Online' : 'Cash',
        collect_cash: input.collectCash ?? '0.00',
        min_prep_time: String(input.urgent?.minutes ?? 25),
        otp: input.otp ?? '',
        total_amount: money(order.grandTotal),
        tax_amount: money(order.taxes),
        discount_amount: money(order.offerDiscount),
        delivery_charges: money(order.deliveryFee),
        packing_charges: money(order.packingFee),
        dc_tax_percentage: input.dcTaxPercentage ?? '5.00',
        pc_tax_percentage: input.pcTaxPercentage ?? '5.00',
        urgent_order: input.urgent?.flag ?? '0',
        urgent_time: String(input.urgent?.minutes ?? 0),
        ondc_bap: input.ondcBap ?? '',
        details: {
          clientorderID: order.clientOrderId,
          pre_order: input.preorderDate ? '1' : '0',
          order_type: order.fulfillment === 'TAKEAWAY' ? 'PickUp' : order.fulfillment === 'DINE_IN' ? 'DineIn' : 'Delivery',
          payment_type: order.paymentReference ? 'Online' : 'Cash',
          collect_cash: input.collectCash ?? '0.00',
          min_prep_time: String(input.urgent?.minutes ?? 25),
          otp: input.otp ?? '',
          total_amount: money(order.grandTotal),
          tax_amount: money(order.taxes),
          discount_amount: money(order.offerDiscount),
          delivery_charges: money(order.deliveryFee),
          packing_charges: money(order.packingFee),
          dc_tax_percentage: input.dcTaxPercentage ?? '5.00',
          pc_tax_percentage: input.pcTaxPercentage ?? '5.00',
          urgent_order: input.urgent?.flag ?? '0',
          ondc_bap: input.ondcBap ?? '',
        },
      },
      OrderItem: order.items.map((item) => ({
        id: item.productPetpoojaId,
        name: item.name,
        tax_inclusive: '1',
        item_tax: { tax_percentage: money(item.taxRate) },
        AddonItem: item.modifiers.map((m) => ({
          id: m.optionPetpoojaId,
          name: m.optionName,
          group_name: m.groupName,
          price: money(m.priceDelta),
        })),
      })),
      Tax: taxLines,
      Discount: discountLines,
    },
  };
}

function extractTaxes(order: OrderEntity) {
  const snap = order.taxSnapshot;
  if (!snap || !Array.isArray((snap as { lines?: unknown[] }).lines)) {
    if (Number(order.taxes) > 0) {
      return [
        {
          id: 'TAX_TOTAL',
          title: 'GST',
          type: 'percentage',
          price: money(order.taxes),
          tax: money(order.taxes),
        },
      ];
    }
    return [];
  }
  const lines = (snap as { lines: Array<Record<string, unknown>> }).lines;
  return lines.map((l, i) => ({
    id: String(l.id ?? `TAX_${i}`),
    title: String(l.title ?? l.name ?? 'Tax'),
    type: String(l.type ?? 'percentage'),
    price: money((l.amount ?? l.price) as string | number | null | undefined),
    tax: money((l.rate ?? l.tax) as string | number | null | undefined),
  }));
}

function extractDiscounts(order: OrderEntity) {
  const lines: Array<{ id: string; title: string; type: string; price: string }> = [];
  if (Number(order.offerDiscount) > 0) {
    lines.push({
      id: 'OFFER_DISCOUNT',
      title: 'Offer',
      type: 'flat',
      price: money(order.offerDiscount),
    });
  }
  if (Number(order.couponDiscount) > 0) {
    lines.push({
      id: order.couponCode ?? 'COUPON',
      title: order.couponCode ?? 'Coupon',
      type: 'flat',
      price: money(order.couponDiscount),
    });
  }
  if (Number(order.itemDiscount) > 0) {
    lines.push({
      id: 'ITEM_DISCOUNT',
      title: 'Item discount',
      type: 'flat',
      price: money(order.itemDiscount),
    });
  }
  return lines;
}
