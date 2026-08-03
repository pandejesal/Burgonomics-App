import {
  Order,
  OrderStoreSnapshot,
  OrderAddressSnapshot,
  CartLine,
} from "@/features/orders/models";

export interface RichOrder extends Omit<Order, "status"> {
  // We'll keep our own flexible status for admin state but match features/orders/models
  customerEmail?: string;
  customerCohort?: string;
  orderStatus:
    | "New"
    | "Accepted"
    | "Preparing"
    | "Ready"
    | "Out for Delivery"
    | "Completed"
    | "Cancelled"
    | "Refunded";
  paymentStatus: "Paid" | "Pending" | "Failed" | "Refunded";
  petpoojaStatus: "Synced" | "Pending" | "Failed" | "Bypassed";
  petpoojaDetails?: {
    kotId?: string;
    posOrderId?: string;
    syncError?: string;
    lastAttemptAt?: string;
  };
  kitchenNotes?: string;
  timeline: Array<{
    title: string;
    timestamp: string;
    actor: string;
    description: string;
  }>;
}

export const INITIAL_RICH_ORDERS: RichOrder[] = [
  {
    id: "BUR-8201",
    shortCode: "BG-8201",
    fulfillment: "delivery",
    placedAt: new Date(Date.now() - 4 * 60 * 1000).toISOString(), // 4 mins ago
    estimatedAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    customerEmail: "aarav.mehta@gmail.com",
    customerCohort: "Gold Tier (12 orders)",
    orderStatus: "New",
    paymentStatus: "Paid",
    petpoojaStatus: "Pending",
    notes: "Please make it extra spicy! Avoid onions if possible.",
    fulfillmentInstructions: "Deliver to 4th floor, dial 402 on intercom.",
    kitchenNotes: "Burger patty medium-well",
    deliveryPartner: {
      name: "Ramesh Kumar",
      phone: "+91 98112 00392",
      vehicleNumber: "DL 3S CQ 8920",
      etaMinutes: 15,
    },
    store: {
      id: "st_cp_delhi",
      name: "Connaught Place, Delhi",
      address: "G-24, Connaught Circle, New Delhi",
      area: "Connaught Place",
      city: "Delhi",
      phone: "+91 11 4356 7890",
    },
    address: {
      label: "Home",
      contactName: "Aarav Mehta",
      contactPhone: "+91 98765 43210",
      line1: "B-402, Shivam Apartments",
      line2: "Outer Ring Road, Pitampura",
      landmark: "Near Pitampura Metro Station",
      city: "New Delhi",
      state: "Delhi",
      pincode: "110034",
    },
    items: [
      {
        lineId: "it_veg_cheese",
        id: "it_veg_cheese",
        productId: "it_veg_cheese",
        storeId: "st_cp_delhi",
        unitPrice: 180,
        modifiers: [],
        availability: "available",
        name: "Classic Veg Cheese Burger",
        price: 180,
        quantity: 1,
        customizations: [
          { name: "Extra Cheese Slice", price: 25 },
          { name: "Gluten-Free Bun", price: 40 },
        ],
      },
      {
        lineId: "it_peri_peri",
        id: "it_peri_peri",
        productId: "it_peri_peri",
        storeId: "st_cp_delhi",
        unitPrice: 120,
        modifiers: [],
        availability: "available",
        name: "Peri Peri Fries",
        price: 120,
        quantity: 1,
        customizations: [],
      },
    ],
    totals: {
      subtotal: 365,
      itemDiscount: 0,
      promoDiscount: 0,
      taxes: 21,
      deliveryFee: 40,
      packingFee: 15,
      currency: "INR",
      deliveryCharge: 40,
      packagingCharge: 15,
      tax: 21,
      discount: 0,
      grandTotal: 441,
    },
    payment: {
      method: "upi",
      label: "UPI · GooglePay",
      status: "paid",
      transactionId: "pay_Rzp1829a39fbc8",
      paidAt: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    },
    timeline: [
      {
        title: "Order Placed",
        timestamp: new Date(Date.now() - 4 * 60 * 1000).toLocaleTimeString(),
        actor: "Customer",
        description: "Placed via Burgonomics Web",
      },
    ],
  },
  {
    id: "BUR-8202",
    shortCode: "BG-8202",
    fulfillment: "takeaway",
    placedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 mins ago
    estimatedAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    customerEmail: "priya.sharma@yahoo.com",
    customerCohort: "Silver Tier (5 orders)",
    orderStatus: "Preparing",
    paymentStatus: "Paid",
    petpoojaStatus: "Synced",
    petpoojaDetails: {
      kotId: "KOT-294021",
      posOrderId: "PP-DEL-8202",
      lastAttemptAt: new Date(Date.now() - 14 * 60 * 1000).toLocaleTimeString(),
    },
    notes: "Keep cold shakes separate from burgers.",
    store: {
      id: "st_andheri_mumbai",
      name: "Andheri West, Mumbai",
      address: "Shop 5, Link Plaza, Andheri West, Mumbai",
      area: "Andheri West",
      city: "Mumbai",
      phone: "+91 22 2634 5678",
    },
    items: [
      {
        lineId: "it_crunchy_aloo",
        id: "it_crunchy_aloo",
        productId: "it_crunchy_aloo",
        storeId: "st_andheri_mumbai",
        unitPrice: 130,
        modifiers: [],
        availability: "available",
        name: "Crunchy Aloo Tikki Burger",
        price: 130,
        quantity: 2,
        customizations: [],
      },
      {
        lineId: "it_choc_shake",
        id: "it_choc_shake",
        productId: "it_choc_shake",
        storeId: "st_andheri_mumbai",
        unitPrice: 150,
        modifiers: [],
        availability: "available",
        name: "Chocolate Milkshake",
        price: 150,
        quantity: 2,
        customizations: [{ name: "Extra Whipped Cream", price: 20 }],
      },
    ],
    totals: {
      subtotal: 600,
      itemDiscount: 0,
      promoDiscount: 100,
      taxes: 31,
      deliveryFee: 0,
      packingFee: 20,
      currency: "INR",
      deliveryCharge: 0,
      packagingCharge: 20,
      tax: 31,
      discount: 100, // Coupon applied
      grandTotal: 551,
    },
    payment: {
      method: "card",
      label: "Card · Visa ****4021",
      status: "paid",
      transactionId: "pay_Rzp90281bda741",
      paidAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    },
    timeline: [
      {
        title: "Order Placed",
        timestamp: new Date(Date.now() - 15 * 60 * 1000).toLocaleTimeString(),
        actor: "Customer",
        description: "Placed via Burgonomics iOS App",
      },
      {
        title: "Accepted & Synced to POS",
        timestamp: new Date(Date.now() - 14 * 60 * 1000).toLocaleTimeString(),
        actor: "Store Manager (Rajesh)",
        description: "Order pushed to Petpooja API. KOT-294021 generated.",
      },
      {
        title: "Began Preparation",
        timestamp: new Date(Date.now() - 12 * 60 * 1000).toLocaleTimeString(),
        actor: "Chef Sanjay",
        description: "Cooking initiated in Kitchen 1",
      },
    ],
  },
  {
    id: "BUR-8203",
    shortCode: "BG-8203",
    fulfillment: "dinein",
    placedAt: new Date(Date.now() - 32 * 60 * 1000).toISOString(), // 32 mins ago
    customerEmail: "rohan.v@gmail.com",
    customerCohort: "New Customer",
    orderStatus: "Completed",
    paymentStatus: "Paid",
    petpoojaStatus: "Synced",
    petpoojaDetails: {
      kotId: "KOT-293910",
      posOrderId: "PP-DEL-8203",
      lastAttemptAt: new Date(Date.now() - 31 * 60 * 1000).toLocaleTimeString(),
    },
    notes: "Table No. 12. Deliver altogether.",
    store: {
      id: "st_cp_delhi",
      name: "Connaught Place, Delhi",
      address: "G-24, Connaught Circle, New Delhi",
      area: "Connaught Place",
      city: "Delhi",
      phone: "+91 11 4356 7890",
    },
    items: [
      {
        lineId: "it_double_veg",
        id: "it_double_veg",
        productId: "it_double_veg",
        storeId: "st_cp_delhi",
        unitPrice: 210,
        modifiers: [],
        availability: "available",
        name: "Double Veg Supreme Burger",
        price: 210,
        quantity: 1,
        customizations: [{ name: "Extra Cheese Slice", price: 25 }],
      },
      {
        lineId: "it_fries_salted",
        id: "it_fries_salted",
        productId: "it_fries_salted",
        storeId: "st_cp_delhi",
        unitPrice: 90,
        modifiers: [],
        availability: "available",
        name: "Salted Fries (Regular)",
        price: 90,
        quantity: 1,
        customizations: [],
      },
    ],
    totals: {
      subtotal: 325,
      itemDiscount: 0,
      promoDiscount: 50,
      taxes: 16.25,
      deliveryFee: 0,
      packingFee: 0,
      currency: "INR",
      deliveryCharge: 0,
      packagingCharge: 0,
      tax: 16.25,
      discount: 50,
      grandTotal: 291.25,
    },
    payment: {
      method: "upi",
      label: "UPI · PhonePe",
      status: "paid",
      transactionId: "pay_Rzp129381adc77",
      paidAt: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
    },
    timeline: [
      {
        title: "Order Placed",
        timestamp: new Date(Date.now() - 32 * 60 * 1000).toLocaleTimeString(),
        actor: "Customer",
        description: "QR Code Dine-In Table 12",
      },
      {
        title: "Accepted & POS Synced",
        timestamp: new Date(Date.now() - 31 * 60 * 1000).toLocaleTimeString(),
        actor: "Store Manager (Rajesh)",
        description: "POS verified and sent to KOT printer",
      },
      {
        title: "Began Preparation",
        timestamp: new Date(Date.now() - 28 * 60 * 1000).toLocaleTimeString(),
        actor: "Chef Sanjay",
        description: "Patty on grill",
      },
      {
        title: "Served Table",
        timestamp: new Date(Date.now() - 12 * 60 * 1000).toLocaleTimeString(),
        actor: "Waiter Vikram",
        description: "Hot burger and salted fries served at Table 12",
      },
      {
        title: "Settled & Completed",
        timestamp: new Date(Date.now() - 5 * 60 * 1000).toLocaleTimeString(),
        actor: "System",
        description: "Table settled. Transaction marked Complete.",
      },
    ],
  },
  {
    id: "BUR-8204",
    shortCode: "BG-8204",
    fulfillment: "delivery",
    placedAt: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
    estimatedAt: new Date(Date.now() + 13 * 60 * 1000).toISOString(),
    customerEmail: "ananya.iyer@outlook.com",
    customerCohort: "Platinum Tier (38 orders)",
    orderStatus: "Out for Delivery",
    paymentStatus: "Paid",
    petpoojaStatus: "Synced",
    petpoojaDetails: {
      kotId: "KOT-294001",
      posOrderId: "PP-BLR-8204",
      lastAttemptAt: new Date(Date.now() - 21 * 60 * 1000).toLocaleTimeString(),
    },
    notes: "No mayonnaise.",
    fulfillmentInstructions: "Leave with guard if flat door locked.",
    store: {
      id: "st_koramangala_blr",
      name: "Koramangala, Bangalore",
      address: "80 Feet Road, Koramangala 4th Block, Bangalore",
      area: "Koramangala",
      city: "Bangalore",
      phone: "+91 80 4125 6789",
    },
    address: {
      label: "Office",
      contactName: "Ananya Iyer",
      contactPhone: "+91 95678 90123",
      line1: "9th Floor, Tech Park Alpha",
      line2: "100 Feet Ring Road, Koramangala",
      landmark: "Next to Sony Signal",
      city: "Bangalore",
      state: "Karnataka",
      pincode: "560034",
    },
    items: [
      {
        lineId: "it_maharaja_veg",
        id: "it_maharaja_veg",
        productId: "it_maharaja_veg",
        storeId: "st_koramangala_blr",
        unitPrice: 220,
        modifiers: [],
        availability: "available",
        name: "Maharaja Veg Burger",
        price: 220,
        quantity: 1,
        customizations: [{ name: "Extra Cheese Slice", price: 25 }],
      },
      {
        lineId: "it_paneer_fries",
        id: "it_paneer_fries",
        productId: "it_paneer_fries",
        storeId: "st_koramangala_blr",
        unitPrice: 160,
        modifiers: [],
        availability: "available",
        name: "Peri Peri Paneer Fries",
        price: 160,
        quantity: 1,
        customizations: [],
      },
    ],
    totals: {
      subtotal: 405,
      itemDiscount: 0,
      promoDiscount: 0,
      taxes: 22.75,
      deliveryFee: 35,
      packingFee: 15,
      currency: "INR",
      deliveryCharge: 35,
      packagingCharge: 15,
      tax: 22.75,
      discount: 0,
      grandTotal: 477.75,
    },
    payment: {
      method: "upi",
      label: "UPI · Paytm",
      status: "paid",
      transactionId: "pay_Rzp90283bda123",
      paidAt: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
    },
    timeline: [
      {
        title: "Order Placed",
        timestamp: new Date(Date.now() - 22 * 60 * 1000).toLocaleTimeString(),
        actor: "Customer",
        description: "Placed via Burgonomics Android App",
      },
      {
        title: "POS Synced",
        timestamp: new Date(Date.now() - 21 * 60 * 1000).toLocaleTimeString(),
        actor: "Manager (Karan)",
        description: "Auto-accepted and printed in BLR-Kora kitchen",
      },
      {
        title: "Completed Cooking",
        timestamp: new Date(Date.now() - 10 * 60 * 1000).toLocaleTimeString(),
        actor: "Chef Deep",
        description: "Packed and ready at dispatch table",
      },
      {
        title: "Dispatched with Courier",
        timestamp: new Date(Date.now() - 4 * 60 * 1000).toLocaleTimeString(),
        actor: "Runner Sandeep",
        description: "Assigned to Sandeep (+91 98321 00412). Out for delivery.",
      },
    ],
  },
  {
    id: "BUR-8205",
    shortCode: "BG-8205",
    fulfillment: "delivery",
    placedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    customerEmail: "kabir.singh@yahoo.com",
    customerCohort: "Gold Tier (15 orders)",
    orderStatus: "Cancelled",
    paymentStatus: "Refunded",
    petpoojaStatus: "Synced",
    petpoojaDetails: {
      kotId: "KOT-293880",
      posOrderId: "PP-NOI-8205",
      lastAttemptAt: new Date(Date.now() - 44 * 60 * 1000).toLocaleTimeString(),
    },
    notes: "Please add tissue papers.",
    store: {
      id: "st_sec62_noida",
      name: "Sector 62, Noida",
      address: "B-Block, Stellar IT Park, Sector 62, Noida",
      area: "Sector 62",
      city: "Noida",
      phone: "+91 120 4567 890",
    },
    address: {
      label: "Home",
      contactName: "Kabir Singh",
      contactPhone: "+91 97890 12345",
      line1: "Flat 103, Tower C, Stellar Apartments",
      line2: "Sector 62",
      landmark: "Opposite Fortis Hospital",
      city: "Noida",
      state: "Uttar Pradesh",
      pincode: "201301",
    },
    items: [
      {
        lineId: "it_pizza_burger",
        id: "it_pizza_burger",
        productId: "it_pizza_burger",
        storeId: "st_sec62_noida",
        unitPrice: 240,
        modifiers: [],
        availability: "available",
        name: "Pizza Burger Special",
        price: 240,
        quantity: 1,
        customizations: [],
      },
    ],
    totals: {
      subtotal: 240,
      itemDiscount: 0,
      promoDiscount: 0,
      taxes: 14.75,
      deliveryFee: 40,
      packingFee: 15,
      currency: "INR",
      deliveryCharge: 40,
      packagingCharge: 15,
      tax: 14.75,
      discount: 0,
      grandTotal: 309.75,
    },
    payment: {
      method: "online",
      label: "Net Banking · HDFC",
      status: "refunded",
      transactionId: "pay_Rzp110294da189",
      paidAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    },
    timeline: [
      {
        title: "Order Placed",
        timestamp: new Date(Date.now() - 45 * 60 * 1000).toLocaleTimeString(),
        actor: "Customer",
        description: "Placed via Web UI",
      },
      {
        title: "POS Synced",
        timestamp: new Date(Date.now() - 44 * 60 * 1000).toLocaleTimeString(),
        actor: "Manager (Gaurav)",
        description: "Acknowledged and pushed to kitchen",
      },
      {
        title: "Cancelled by Manager",
        timestamp: new Date(Date.now() - 40 * 60 * 1000).toLocaleTimeString(),
        actor: "Manager (Gaurav)",
        description: "Customer requested cancellation due to incorrect address. Refund initiated.",
      },
      {
        title: "Refund Dispatched",
        timestamp: new Date(Date.now() - 39 * 60 * 1000).toLocaleTimeString(),
        actor: "Razorpay Gateway",
        description: "Automatic full refund of ₹309.75 settled successfully.",
      },
    ],
  },
];

export function getThermalReceiptText(
  order: RichOrder,
  type: "KOT" | "INVOICE" | "TAX_RECEIPT",
): string {
  const lineSeparator = "------------------------------------------";
  const doubleLineSeparator = "==========================================";
  const nowStr = new Date().toLocaleString();

  let text = "";

  if (type === "KOT") {
    text += "           KITCHEN ORDER TICKET           \n";
    text += `ORDER ID: ${order.id}    (${order.fulfillment.toUpperCase()})\n`;
    text += `KOT NO  : ${order.petpoojaDetails?.kotId || "KOT-PENDING"}\n`;
    text += `STORE   : ${order.store.name}\n`;
    text += `TIME    : ${order.placedAt ? new Date(order.placedAt).toLocaleTimeString() : nowStr}\n`;
    text += doubleLineSeparator + "\n";
    text += "QTY   ITEM NAME / MODIFIERS\n";
    text += lineSeparator + "\n";

    order.items.forEach((item) => {
      text += `${item.quantity.toString().padEnd(5)} ${item.name.toUpperCase()}\n`;
      if (item.customizations && item.customizations.length > 0) {
        item.customizations.forEach((cust: any) => {
          const custTitle = (cust.name || cust.optionName || "").toUpperCase();
          text += `      >> ${custTitle}\n`;
        });
      }
    });

    text += lineSeparator + "\n";
    if (order.notes) {
      text += `SPECIAL NOTES:\n${order.notes.toUpperCase()}\n`;
      text += lineSeparator + "\n";
    }
    text += "         BURGONOMICS KITCHEN CORE         \n";
  } else if (type === "INVOICE" || type === "TAX_RECEIPT") {
    text += "               BURGONOMICS                \n";
    text += "         CRISP BURGERS & SIDES            \n";
    text += `STORE   : ${order.store.name}\n`;
    text += `ADDRESS : ${order.store.address}\n`;
    text += `PHONE   : ${order.store.phone}\n`;
    text += `GSTIN   : 07AAACB2940D1Z2\n`;
    text += lineSeparator + "\n";
    text += `INVOICE : ${order.id}\n`;
    text += `DATE    : ${order.placedAt ? new Date(order.placedAt).toLocaleString() : nowStr}\n`;
    text += `CUST    : ${order.address?.contactName || order.id}\n`;
    text += `PHONE   : ${order.address?.contactPhone || "N/A"}\n`;
    text += `TYPE    : ${order.fulfillment.toUpperCase()}\n`;
    text += doubleLineSeparator + "\n";
    text += "ITEM DESCRIPTION          QTY      PRICE  \n";
    text += lineSeparator + "\n";

    order.items.forEach((item) => {
      const namePart = item.name.length > 22 ? item.name.substring(0, 22) : item.name.padEnd(22);
      const qtyPart = item.quantity.toString().padStart(4);
      const itemPx = (item.price ?? item.unitPrice ?? 0) as number;
      const pricePart = `₹${(itemPx * item.quantity).toFixed(2)}`.padStart(11);
      text += `${namePart}${qtyPart}${pricePart}\n`;

      if (item.customizations && item.customizations.length > 0) {
        item.customizations.forEach((cust: any) => {
          const custLabel = cust.name || cust.optionName || "";
          const custPx = (cust.price || cust.priceDelta || 0) as number;
          const custName = `+ ${custLabel}`;
          const custNamePart =
            custName.length > 22 ? custName.substring(0, 22) : custName.padEnd(22);
          const custPricePart = `₹${(custPx * item.quantity).toFixed(2)}`.padStart(11);
          text += `${custNamePart}    ${custPricePart}\n`;
        });
      }
    });

    text += lineSeparator + "\n";
    text += `SUBTOTAL                : ₹${order.totals.subtotal.toFixed(2).padStart(12)}\n`;
    const discountVal = order.totals.discount ?? 0;
    if (discountVal > 0) {
      text += `DISCOUNT                : ₹-${discountVal.toFixed(2).padStart(12)}\n`;
    }
    const delVal = order.totals.deliveryCharge ?? order.totals.deliveryFee ?? 0;
    if (delVal > 0) {
      text += `DELIVERY CHARGE         : ₹${delVal.toFixed(2).padStart(12)}\n`;
    }
    const packVal = order.totals.packagingCharge ?? order.totals.packingFee ?? 0;
    if (packVal > 0) {
      text += `PACKAGING CHARGE        : ₹${packVal.toFixed(2).padStart(12)}\n`;
    }
    const taxVal = order.totals.tax ?? order.totals.taxes ?? 0;
    text += `CGST (2.5%)             : ₹${(taxVal / 2).toFixed(2).padStart(12)}\n`;
    text += `SGST (2.5%)             : ₹${(taxVal / 2).toFixed(2).padStart(12)}\n`;
    text += doubleLineSeparator + "\n";
    text += `GRAND TOTAL             : ₹${order.totals.grandTotal.toFixed(2).padStart(12)}\n`;
    text += doubleLineSeparator + "\n";
    text += `PAYMENT METHOD          : ${order.payment.label.toUpperCase()}\n`;
    text += `TXN ID                  : ${order.payment.transactionId || "CASH_SETTLED"}\n`;
    text += `STATUS                  : ${order.paymentStatus.toUpperCase()}\n`;
    text += lineSeparator + "\n";
    text += "       Thank you for your business!       \n";
    text += "          BURGONOMICS DELIVERS            \n";
  }

  return text;
}
