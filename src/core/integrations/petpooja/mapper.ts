import type { Order } from "@/features/orders/models";

export interface PetpoojaAddonItem {
  id: string;
  name: string;
  group_name: string;
  price: string;
}

export interface PetpoojaOrderItem {
  id: string;
  name: string;
  price: string;
  qty: string;
  tax_inclusive: "1" | "0";
  addonitem: PetpoojaAddonItem[];
}

export interface PetpoojaTax {
  id: string;
  title: string;
  type: string;
  price: string;
  tax: string;
}

export interface PetpoojaDiscount {
  id: string;
  title: string;
  type: string;
  price: string;
}

export interface PetpoojaSaveOrderPayload {
  app_key: string;
  app_secret: string;
  access_token: string;
  res_name: string;
  address: string;
  Contact_information: string;
  restID: string;
  OrderInfo: {
    Customer: {
      name: string;
      email: string;
      address: string;
      phone: string;
    };
    Order: {
      orderID: string;
      preorder_date: string;
      minimum_prep_time: string;
      collect_cash: "1" | "0";
      otp?: string;
      details?: string;
      ondc_bap?: string;
      urgent_order?: "0" | "1";
      urgent_time?: string;
    };
    OrderItem: PetpoojaOrderItem[];
    Tax: PetpoojaTax[];
    Discount: PetpoojaDiscount[];
  };
  device_type: "Web" | "Mobile";
  udid: string;
}

/**
 * Maps our frontend Order entity to the official Petpooja Online Ordering V2.1.0 Save Order request structure.
 */
export function mapOrderToPetpoojaSaveOrder(
  order: Order,
  options?: {
    appKey?: string;
    appSecret?: string;
    accessToken?: string;
    customerPhone?: string;
    customerEmail?: string;
    customerName?: string;
    deviceType?: "Web" | "Mobile";
  },
): PetpoojaSaveOrderPayload {
  // Secrets are NEVER hardcoded here. The server proxy injects live
  // credentials; empty strings mean "fill in server-side".
  const app_key = options?.appKey || "";
  const app_secret = options?.appSecret || "";
  const access_token = options?.accessToken || "";

  // Customer information — checkout requires login, so a phone must exist.
  // Never invent one: a fake number books riders/KOTs nobody can contact.
  const customerPhone =
    options?.customerPhone || order.address?.phone || order.address?.contactPhone;
  if (!customerPhone) {
    throw new Error("Customer phone is required to push the order to Petpooja");
  }
  const customerName =
    options?.customerName || order.address?.name || order.address?.contactName || "Customer";
  const customerEmail = options?.customerEmail || "customer@burgonomics.com";
  const customerAddress = order.address
    ? `${order.address.line1}, ${order.address.line2 || ""}, ${order.address.city}, ${order.address.state} - ${order.address.pincode}`
    : "Dine-in / Takeaway at Store";

  // Map order items and addons/modifiers
  const OrderItem: PetpoojaOrderItem[] = order.items.map((item) => {
    const unitPrice = typeof item.unitPrice === "number" ? item.unitPrice : (item.price ?? 0);
    const addonitem: PetpoojaAddonItem[] = (item.modifiers ?? []).map((mod) => ({
      id: mod.optionId,
      name: mod.name,
      group_name: mod.groupName || "Extras",
      price: (mod.priceDelta ?? 0).toFixed(2),
    }));

    return {
      id: item.productId,
      name: item.name,
      price: unitPrice.toFixed(2),
      qty: item.quantity.toString(),
      tax_inclusive: "1", // standard setup
      addonitem,
    };
  });

  // Map taxes (Standard GST setup)
  const Tax: PetpoojaTax[] = [];
  if ((order.totals?.taxes || 0) > 0) {
    Tax.push({
      id: "tax_gst",
      title: "GST (5%)",
      type: "percentage",
      price: (order.totals?.taxes || 0).toFixed(2),
      tax: "5.00",
    });
  }

  // Map discounts
  const Discount: PetpoojaDiscount[] = [];
  const totalDiscount = (order.totals?.itemDiscount || 0) + (order.totals?.promoDiscount || 0);
  if (totalDiscount > 0) {
    Discount.push({
      id: order.promo?.code || "discount_applied",
      title: order.promo?.description || "Discount Applied",
      type: "fixed",
      price: totalDiscount.toFixed(2),
    });
  }

  return {
    app_key,
    app_secret,
    access_token,
    res_name: order.store.name,
    address: order.store.addressLine1 || "Burgonomics Store Address",
    Contact_information: order.store.phone || "079 1234 5678",
    restID: order.store.petpoojaRestId || order.store.id,
    OrderInfo: {
      Customer: {
        name: customerName,
        email: customerEmail,
        address: customerAddress,
        phone: customerPhone,
      },
      Order: {
        orderID: order.id,
        preorder_date: "", // blank for immediate fulfillment
        minimum_prep_time: "20",
        collect_cash: order.payment.method === "cash" ? "1" : "0",
        details: order.notes || order.fulfillmentInstructions || "Please make it extra fresh!",
        ondc_bap: "",
        otp: "",
      },
      OrderItem,
      Tax,
      Discount,
    },
    device_type: options?.deviceType || "Web",
    udid: typeof window !== "undefined" ? window.navigator.userAgent.slice(0, 40) : "ServerNode",
  };
}
