import * as functions from "firebase-functions";
import axios from "axios";


const PETPOOJA_SAVE_ORDER_URL = "https://47pfzh5sf2.execute-api.ap-southeast-1.amazonaws.com/V1/save_order";

export const pushOrderToPetpooja = functions.firestore
  .document("orders/{orderId}")
  .onUpdate(async (change: any, context: any) => {
    const orderBefore = change.before.data();
    const orderAfter = change.after.data();
    const orderId = context.params.orderId;

    if (!orderAfter) return null;

    // We only trigger when the paymentStatus flips to "Paid"
    const wasPaid = orderBefore.paymentStatus === "Paid" || orderBefore?.payment?.status === "paid";
    const isPaid = orderAfter.paymentStatus === "Paid" || orderAfter?.payment?.status === "paid";

    // Cash orders might skip "Paid" status initially, but let's assume they are marked properly or we handle them.
    // Let's also check if it's cash and just got placed.
    const isCashOrderPlacing = orderAfter.payment?.method === "cash" && 
                              orderBefore.status?.current !== "placed" && 
                              orderAfter.status?.current === "placed";

    if ((wasPaid && isPaid) && !isCashOrderPlacing) {
      // Already pushed or not relevant
      return null;
    }
    
    if (!isPaid && !isCashOrderPlacing) {
      // Not yet ready to push
      return null;
    }

    // Skip if Petpooja is already synced
    if (orderAfter.petpoojaStatus === "Synced" || orderAfter.petpoojaStatus === "Processing") {
      functions.logger.info(`Order ${orderId} already pushed or processing. Skipping.`);
      return null;
    }

    try {
      // Mark as processing
      await change.after.ref.update({ petpoojaStatus: "Processing" });

      functions.logger.info(`Pushing order ${orderId} to Petpooja...`, {
        storeId: orderAfter.store?.id
      });

      const appKey = process.env.PETPOOJA_APP_KEY || functions.config().petpooja?.app_key;
      const appSecret = process.env.PETPOOJA_APP_SECRET || functions.config().petpooja?.app_secret;
      const accessToken =
        process.env.PETPOOJA_ACCESS_TOKEN || functions.config().petpooja?.access_token;

      if (!appKey || !appSecret || !accessToken) {
        functions.logger.error(`Petpooja credentials not configured; skipping order ${orderId}`);
        await change.after.ref.update({
          petpoojaStatus: "Failed",
          petpoojaDetails: {
            syncError: "Petpooja credentials not configured",
            lastAttemptAt: new Date().toISOString()
          }
        });
        return null;
      }

      // Map Order to Petpooja Payload
      const storeName = orderAfter.store?.name || "Burgonomics";
      const restID = orderAfter.store?.petpoojaRestId || orderAfter.store?.id;
      
      const customerName = orderAfter.address?.name || "Customer";
      const customerPhone = orderAfter.address?.phone || "9876543210";
      const customerAddress = orderAfter.address 
        ? `${orderAfter.address.line1}, ${orderAfter.address.line2 || ""}, ${orderAfter.address.city}`
        : "Store Order";

      const OrderItem = (orderAfter.items || []).map((item: any) => {
        const unitPrice = typeof item.unitPrice === "number" ? item.unitPrice : (item.price ?? 0);
        const addonitem = (item.modifiers || []).map((mod: any) => ({
          id: mod.optionId,
          name: mod.name,
          group_name: mod.groupName || "Extras",
          price: (mod.priceDelta ?? 0).toFixed(2)
        }));

        return {
          id: item.productId,
          name: item.name,
          price: unitPrice.toFixed(2),
          qty: (item.quantity || 1).toString(),
          tax_inclusive: "1",
          addonitem
        };
      });

      const Tax = [];
      if (orderAfter.totals?.taxes > 0) {
        Tax.push({
          id: "tax_gst",
          title: "GST",
          type: "percentage",
          price: orderAfter.totals.taxes.toFixed(2),
          tax: "5.00"
        });
      }

      const Discount = [];
      const totalDiscount = (orderAfter.totals?.itemDiscount || 0) + (orderAfter.totals?.promoDiscount || 0);
      if (totalDiscount > 0) {
        Discount.push({
          id: orderAfter.promo?.code || "discount",
          title: "Discount",
          type: "fixed",
          price: totalDiscount.toFixed(2)
        });
      }

      const payload = {
        app_key: appKey,
        app_secret: appSecret,
        access_token: accessToken,
        res_name: storeName,
        address: orderAfter.store?.addressLine1 || "",
        Contact_information: orderAfter.store?.phone || "",
        restID: restID,
        OrderInfo: {
          Customer: {
            name: customerName,
            email: "customer@example.com",
            address: customerAddress,
            phone: customerPhone
          },
          Order: {
            orderID: orderId,
            preorder_date: "",
            minimum_prep_time: "20",
            collect_cash: orderAfter.payment?.method === "cash" ? "1" : "0",
            details: orderAfter.notes || orderAfter.fulfillmentInstructions || "",
            ondc_bap: "",
            otp: ""
          },
          OrderItem,
          Tax,
          Discount
        },
        device_type: "Mobile",
        udid: "ServerNode"
      };

      const response = await axios.post(PETPOOJA_SAVE_ORDER_URL, payload, {
        headers: { "Content-Type": "application/json" }
      });

      functions.logger.info(`Petpooja Response for ${orderId}:`, response.data);
      const petpoojaResponse = response.data;

      // Successfully synced
      await change.after.ref.update({
        petpoojaStatus: "Synced",
        petpoojaDetails: {
          kotId: petpoojaResponse.clientOrderID || petpoojaResponse.orderID || null,
          posOrderId: petpoojaResponse.orderID || null,
          lastAttemptAt: new Date().toISOString()
        }
      });

      return true;

    } catch (error: any) {
      functions.logger.error(`Error pushing order ${orderId} to Petpooja:`, error.message);
      
      await change.after.ref.update({
        petpoojaStatus: "Failed",
        petpoojaDetails: {
          syncError: error.message,
          lastAttemptAt: new Date().toISOString()
        }
      });

      return null;
    }
  });
