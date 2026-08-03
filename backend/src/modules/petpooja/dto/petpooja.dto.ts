import { z } from 'zod';
import { PETPOOJA_CALLBACK_STATUS, PETPOOJA_RIDER_STATUS } from '../constants';

// ═══════════════════════════════════════════════════════════════
// Outbound request DTOs (Our backend → PETPOOJA)
// ═══════════════════════════════════════════════════════════════

/** POST /mapped_restaurant_menus */
export const FetchMenuRequestSchema = z.object({
  restID: z.string().min(1),
});
export type FetchMenuRequest = z.infer<typeof FetchMenuRequestSchema>;

/** Shared PETPOOJA credentials block, injected by the credential provider. */
export const CredentialBlockSchema = z.object({
  app_key: z.string().min(1),
  app_secret: z.string().min(1),
  access_token: z.string().min(1),
});
export type CredentialBlock = z.infer<typeof CredentialBlockSchema>;

/** POST /save_order — customer sub-payload. */
export const SaveOrderCustomerSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  address: z.string(),
});

export const SaveOrderMetaSchema = z
  .object({
    orderID: z.string().min(1).optional(),
    clientorderID: z.string().optional(),
    preorder_date: z.string().optional(),
    pre_order: z.string().optional(),
    order_type: z.string().optional(),
    payment_type: z.string().optional(),
    collect_cash: z.string().optional(),
    min_prep_time: z.string().optional(),
    otp: z.string().optional(),
    total_amount: z.string().optional(),
    tax_amount: z.string().optional(),
    discount_amount: z.string().optional(),
    delivery_charges: z.string().optional(),
    packing_charges: z.string().optional(),
    dc_tax_percentage: z.string().optional(),
    pc_tax_percentage: z.string().optional(),
    urgent_order: z.string().optional(),
    urgent_time: z.string().optional(),
    ondc_bap: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const SaveOrderAddonItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  group_name: z.string(),
  price: z.string(),
});

export const SaveOrderItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  tax_inclusive: z.string(),
  item_tax: z.object({ tax_percentage: z.string() }).optional(),
  AddonItem: z.array(SaveOrderAddonItemSchema).default([]),
});

export const SaveOrderTaxSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string(),
  price: z.string(),
  tax: z.string(),
});

export const SaveOrderDiscountSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string(),
  price: z.string(),
});

export const SaveOrderRequestSchema = CredentialBlockSchema.extend({
  res_name: z.string(),
  address: z.string(),
  Contact_information: z.string(),
  restID: z.string(),
  udid: z.string(),
  device_type: z.string(),
  OrderInfo: z.object({
    Customer: SaveOrderCustomerSchema,
    Order: SaveOrderMetaSchema,
    OrderItem: z.array(SaveOrderItemSchema),
    Tax: z.array(SaveOrderTaxSchema).default([]),
    Discount: z.array(SaveOrderDiscountSchema).default([]),
  }),
});
export type SaveOrderRequest = z.infer<typeof SaveOrderRequestSchema>;

/** POST /update_order_status. */
export const UpdateOrderStatusRequestSchema = CredentialBlockSchema.extend({
  restID: z.string(),
  orderID: z.string().default(''),
  clientorderID: z.string().min(1),
  cancelReason: z.string().default(''),
  status: z.string().min(1),
});
export type UpdateOrderStatusRequest = z.infer<typeof UpdateOrderStatusRequestSchema>;

/** POST /rider_status_update. */
export const RiderStatusUpdateRequestSchema = CredentialBlockSchema.extend({
  status: z.enum([
    PETPOOJA_RIDER_STATUS.ASSIGNED,
    PETPOOJA_RIDER_STATUS.ARRIVED,
    PETPOOJA_RIDER_STATUS.PICKED_UP,
    PETPOOJA_RIDER_STATUS.DELIVERED,
  ]),
  order_id: z.string().min(1),
  external_order_id: z.string().default(''),
  rider_data: z.object({
    rider_name: z.string(),
    rider_phone_number: z.string(),
  }),
});
export type RiderStatusUpdateRequest = z.infer<typeof RiderStatusUpdateRequestSchema>;

// ═══════════════════════════════════════════════════════════════
// Outbound response DTOs (PETPOOJA → Our backend)
// ═══════════════════════════════════════════════════════════════

/** PETPOOJA responses are loosely typed; the two well-known fields are
 *  `success` (string, "1"/"0") and `message`. Additional fields vary. */
export const PetpoojaAckSchema = z
  .object({
    success: z.union([z.string(), z.number(), z.boolean()]).optional(),
    message: z.string().optional(),
    http_code: z.union([z.string(), z.number()]).optional(),
    orderID: z.string().optional(),
    restID: z.string().optional(),
    clientOrderID: z.string().optional(),
  })
  .passthrough();
export type PetpoojaAck = z.infer<typeof PetpoojaAckSchema>;

/** Response of POST /mapped_restaurant_menus. Same envelope as push_menu. */
export const PetpoojaMenuResponseSchema = z
  .object({
    success: z.union([z.string(), z.number(), z.boolean()]).optional(),
    message: z.string().optional(),
    restaurants: z.array(z.record(z.string(), z.unknown())).optional(),
    ordertypes: z.array(z.record(z.string(), z.unknown())).optional(),
    categories: z.array(z.record(z.string(), z.unknown())).optional(),
    parentcategories: z.array(z.record(z.string(), z.unknown())).optional(),
    group_categories: z.array(z.record(z.string(), z.unknown())).optional(),
    items: z.array(z.record(z.string(), z.unknown())).optional(),
    attributes: z.array(z.record(z.string(), z.unknown())).optional(),
    taxes: z.array(z.record(z.string(), z.unknown())).optional(),
    discounts: z.array(z.record(z.string(), z.unknown())).optional(),
    addongroups: z.array(z.record(z.string(), z.unknown())).optional(),
    addongroupitems: z.array(z.record(z.string(), z.unknown())).optional(),
    variations: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .passthrough();
export type PetpoojaMenuResponse = z.infer<typeof PetpoojaMenuResponseSchema>;

// ═══════════════════════════════════════════════════════════════
// Inbound webhook DTOs (PETPOOJA → Our webhook endpoints)
// ═══════════════════════════════════════════════════════════════

/** PETPOOJA push_menu payload. All top-level arrays default to []. */
export const PushMenuWebhookSchema = z
  .object({
    restaurants: z.array(z.record(z.string(), z.unknown())).default([]),
    ordertypes: z.array(z.record(z.string(), z.unknown())).default([]),
    categories: z.array(z.record(z.string(), z.unknown())).default([]),
    parentcategories: z.array(z.record(z.string(), z.unknown())).default([]),
    group_categories: z.array(z.record(z.string(), z.unknown())).default([]),
    items: z.array(z.record(z.string(), z.unknown())).default([]),
    attributes: z.array(z.record(z.string(), z.unknown())).default([]),
    taxes: z.array(z.record(z.string(), z.unknown())).default([]),
    discounts: z.array(z.record(z.string(), z.unknown())).default([]),
    addongroups: z.array(z.record(z.string(), z.unknown())).default([]),
    addongroupitems: z.array(z.record(z.string(), z.unknown())).default([]),
    variations: z.array(z.record(z.string(), z.unknown())).default([]),
  })
  .passthrough();
export type PushMenuWebhook = z.infer<typeof PushMenuWebhookSchema>;

/** PETPOOJA order-callback payload. */
export const OrderCallbackWebhookSchema = z.object({
  restID: z.string(),
  orderID: z.string(),
  status: z.enum([
    PETPOOJA_CALLBACK_STATUS.CANCELLED,
    PETPOOJA_CALLBACK_STATUS.ACCEPTED_1,
    PETPOOJA_CALLBACK_STATUS.ACCEPTED_2,
    PETPOOJA_CALLBACK_STATUS.ACCEPTED_3,
    PETPOOJA_CALLBACK_STATUS.DISPATCHED,
    PETPOOJA_CALLBACK_STATUS.FOOD_READY,
    PETPOOJA_CALLBACK_STATUS.DELIVERED,
  ]),
  cancel_reason: z.string().nullish(),
  minimum_prep_time: z.string().nullish(),
  minimum_delivery_time: z.string().nullish(),
  rider_name: z.string().nullish(),
  rider_phone_number: z.string().nullish(),
  is_modified: z.union([z.boolean(), z.string()]).nullish(),
});
export type OrderCallbackWebhook = z.infer<typeof OrderCallbackWebhookSchema>;

/** PETPOOJA stock-update webhook. `itemID` is an array of item/addon IDs. */
export const StockUpdateWebhookSchema = z.object({
  restID: z.string(),
  inStock: z.union([z.boolean(), z.literal('true'), z.literal('false')]),
  type: z.enum(['item', 'addon']).default('item'),
  itemID: z.array(z.string()).min(1),
  autoTurnOnTime: z.enum(['custom', 'auto', 'off']).nullish(),
  customTurnOnTime: z.string().nullish(),
});
export type StockUpdateWebhook = z.infer<typeof StockUpdateWebhookSchema>;

/** PETPOOJA update-store-status webhook (merchant closes/opens store). */
export const StoreStatusWebhookSchema = z.object({
  restID: z.string(),
  status: z.string(),
  store_status: z.enum(['0', '1']),
  turn_on_time: z.string().nullish(),
  reason: z.string().nullish(),
  message: z.string().nullish(),
});
export type StoreStatusWebhook = z.infer<typeof StoreStatusWebhookSchema>;

/** PETPOOJA get_store_status probe (returns our current store status). */
export const GetStoreStatusWebhookSchema = z.object({
  restID: z.string(),
});
export type GetStoreStatusWebhook = z.infer<typeof GetStoreStatusWebhookSchema>;

/** Response shape for `get_store_status` — we produce this. */
export interface GetStoreStatusResponse {
  restID: string;
  status: 'success' | 'error';
  store_status: '0' | '1';
  http_code: '200' | '500';
  message: string;
}
