import * as admin from "firebase-admin";

export type NotificationTopic =
  | `order_${string}`
  | `branch_${string}`
  | "brand"
  | `chat_${string}`
  | `upcoming_${string}`;

export interface NotificationPayload {
  notification: {
    title: string;
    body: string;
    imageUrl?: string;
  };
  data?: Record<string, string>;
}

export interface SendNotificationResult {
  sent?: boolean;
  skipped?: boolean;
  reason?: string;
  topic: string;
  messageId?: string;
  error?: string;
}

/**
 * Sends push notification to an FCM topic.
 * Gated by process.env.FCM_ENABLED === "true".
 * Returns skipped if FCM is not enabled or credentials are not configured.
 */
export async function sendTopicNotification(
  topic: NotificationTopic | string,
  payload: NotificationPayload,
): Promise<SendNotificationResult> {
  const isEnabled = process.env.FCM_ENABLED === "true";
  if (!isEnabled) {
    return { skipped: true, reason: "fcm_disabled", topic };
  }

  try {
    if (!admin.apps.length) {
      return { skipped: true, reason: "firebase_not_initialized", topic };
    }

    const messaging = admin.messaging();
    if (!messaging) {
      return { skipped: true, reason: "fcm_unavailable", topic };
    }

    const response = await messaging.send({
      topic,
      notification: {
        title: payload.notification.title,
        body: payload.notification.body,
        imageUrl: payload.notification.imageUrl,
      },
      data: payload.data || {},
    });

    return { sent: true, topic, messageId: response };
  } catch (err: any) {
    console.warn(`[notify] Failed to send notification to topic ${topic}:`, err?.message);
    return { skipped: true, reason: "send_error", topic, error: err?.message };
  }
}

/**
 * 1. Order Status Updates -> order_{orderId} & branch_{branchId}
 */
export async function notifyOrderUpdate(
  orderId: string,
  branchId: string,
  statusLabel: string,
): Promise<{ orderTopic: SendNotificationResult; branchTopic: SendNotificationResult }> {
  const payload: NotificationPayload = {
    notification: {
      title: "Order Update",
      body: `Your order #${orderId.slice(-6).toUpperCase()} is now ${statusLabel}.`,
    },
    data: {
      type: "order_update",
      orderId,
      branchId,
      status: statusLabel,
    },
  };

  const [orderTopic, branchTopic] = await Promise.all([
    sendTopicNotification(`order_${orderId}`, payload),
    sendTopicNotification(`branch_${branchId}`, {
      ...payload,
      notification: {
        title: "Store Order Update",
        body: `Order #${orderId.slice(-6).toUpperCase()} updated to ${statusLabel}.`,
      },
    }),
  ]);

  return { orderTopic, branchTopic };
}

/**
 * 2. Brand Owner Broadcasts -> brand
 */
export async function notifyBrandEvent(
  title: string,
  body: string,
  data: Record<string, string> = {},
): Promise<SendNotificationResult> {
  return sendTopicNotification("brand", {
    notification: { title, body },
    data: { type: "brand_event", ...data },
  });
}

/**
 * 3. Chat Messages -> chat_{pairId}
 */
export async function notifyChatMessage(
  pairId: string,
  senderName: string,
  previewText: string,
): Promise<SendNotificationResult> {
  return sendTopicNotification(`chat_${pairId}`, {
    notification: {
      title: `Message from ${senderName}`,
      body: previewText.slice(0, 100),
    },
    data: {
      type: "chat_message",
      pairId,
    },
  });
}

/**
 * 4. Upcoming Store Launch Subscriptions -> upcoming_{branchId}
 */
export async function notifyUpcomingBranch(
  branchId: string,
  branchName: string,
): Promise<SendNotificationResult> {
  return sendTopicNotification(`upcoming_${branchId}`, {
    notification: {
      title: "Store Opening Soon!",
      body: `Burgonomics ${branchName} is opening soon in your area.`,
    },
    data: {
      type: "upcoming_branch",
      branchId,
    },
  });
}
