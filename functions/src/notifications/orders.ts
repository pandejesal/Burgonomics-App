import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

const STATUS_MESSAGES: Record<string, { title: string; body: string }> = {
  CONFIRMED: {
    title: "Order Confirmed! 🎉",
    body: "Your order has been received and confirmed by the kitchen.",
  },
  PREPARING: {
    title: "Chefs are on it! 🍔",
    body: "Your delicious meal is now sizzling and being prepared fresh.",
  },
  READY_FOR_PICKUP: {
    title: "Ready for Pickup! 🛍️",
    body: "Your order is packed and waiting for you at the counter.",
  },
  OUT_FOR_DELIVERY: {
    title: "Out for Delivery! 🛵",
    body: "Your rider is on the way with your hot meal.",
  },
  DELIVERED: {
    title: "Delivered! 😋",
    body: "Enjoy your Burgonomics meal! Thanks for choosing us.",
  },
  CANCELLED: {
    title: "Order Cancelled",
    body: "Your order has been cancelled. Any payment made will be refunded.",
  },
};

/**
 * Firestore trigger to send native push notifications on order status transitions.
 */
export const onOrderStatusChanged = functions.firestore
  .document("orders/{orderId}")
  .onUpdate(async (change: any, context: any) => {
    const orderBefore = change.before.data();
    const orderAfter = change.after.data();
    const orderId = context.params.orderId;

    if (!orderBefore || !orderAfter) return null;

    const oldStatusCode = orderBefore.status?.code || orderBefore.statusCode;
    const newStatusCode = orderAfter.status?.code || orderAfter.statusCode;

    // Trigger only on real status progression
    if (!newStatusCode || oldStatusCode === newStatusCode) {
      return null;
    }

    const messageTemplate = STATUS_MESSAGES[newStatusCode];
    if (!messageTemplate) {
      return null;
    }

    const userId = orderAfter.userId;
    if (!userId) {
      functions.logger.info(`No userId on order ${orderId}; skipping push notification.`);
      return null;
    }

    try {
      // Find all active device tokens for this user
      const tokensSnap = await db
        .collection("device_tokens")
        .where("userId", "==", userId)
        .get();

      if (tokensSnap.empty) {
        functions.logger.info(`No device tokens found for user ${userId}`);
        return null;
      }

      const validTokens: string[] = [];
      const tokenDocRefs: admin.firestore.DocumentReference[] = [];

      tokensSnap.forEach((doc) => {
        const data = doc.data();
        if (data.pushEnabled !== false && data.preferences?.orders !== false && data.token) {
          validTokens.push(data.token);
          tokenDocRefs.push(doc.ref);
        }
      });

      if (validTokens.length === 0) {
        return null;
      }

      functions.logger.info(
        `Sending FCM push notification for order ${orderId} (${newStatusCode}) to ${validTokens.length} device(s)`,
      );

      const payload: admin.messaging.MulticastMessage = {
        tokens: validTokens,
        notification: {
          title: messageTemplate.title,
          body: messageTemplate.body,
        },
        data: {
          orderId,
          statusCode: newStatusCode,
          category: "order",
          deeplink: `/orders/${orderId}/track`,
        },
        android: {
          priority: "high",
          notification: {
            sound: "default",
            clickAction: "FLUTTER_NOTIFICATION_CLICK",
            channelId: "burgonomics_orders",
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().sendEachForMulticast(payload);
      functions.logger.info(
        `FCM delivery result: ${response.successCount} succeeded, ${response.failureCount} failed`,
      );

      // Clean up stale or invalid device tokens
      if (response.failureCount > 0) {
        const cleanupPromises: Promise<any>[] = [];
        response.responses.forEach((res, idx) => {
          if (!res.success) {
            const errCode = res.error?.code;
            if (
              errCode === "messaging/registration-token-not-registered" ||
              errCode === "messaging/invalid-registration-token"
            ) {
              cleanupPromises.push(tokenDocRefs[idx].delete());
            }
          }
        });
        await Promise.all(cleanupPromises);
      }

      return true;
    } catch (err: any) {
      functions.logger.error(`Error sending push notification for order ${orderId}:`, err);
      return null;
    }
  });
