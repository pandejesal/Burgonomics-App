/**
 * Native Push Notifications Manager.
 *
 * Wraps @capacitor/push-notifications with dynamic imports so SSR / Web builds
 * are never burdened by native dependencies. Integrates foreground in-app toasts,
 * deep-link action routing, and device token syncing with Firestore.
 */
import { isNative, getPlatform } from "./platform";
import { logger } from "@/core/logging/logger";
import { toast } from "@/shared/components/feedback/AppToaster";
import { sanitizeRedirectUrl } from "@/features/auth/utils/routeUtils";
import { useNotificationsStore } from "@/features/notifications/state/notificationsStore";
import { notificationsService } from "@/features/notifications/services/notificationsService";

let currentToken: string | null = null;
let initialized = false;

export function getCachedDeviceToken(): string | null {
  if (currentToken) return currentToken;
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage.getItem("burg.device_token");
  }
  return null;
}

function setCachedDeviceToken(token: string | null) {
  currentToken = token;
  if (typeof window !== "undefined" && window.localStorage) {
    if (token) {
      window.localStorage.setItem("burg.device_token", token);
    } else {
      window.localStorage.removeItem("burg.device_token");
    }
  }
}

/**
 * Ticket deeplink binding (MOP-S2, B5-S1 follow-up 4 core half).
 * Ticket detail fetches by `data.ticketId` — the push payload no longer
 * carries a subject, so NEVER read `data.subject` here (PII discipline:
 * free-text subjects stay out of notification bodies AND out of routing).
 * Ticket ids become URL query values — accept the id alphabet only.
 */
function ticketIdFrom(data: Record<string, any>): string {
  const raw = typeof data.ticketId === "string" ? data.ticketId : "";
  return /^[\w-]{1,64}$/.test(raw) ? raw : "";
}

function resolvePushDeeplink(
  data: Record<string, any>,
  fallbackCta: { orderId: string },
): string | undefined {
  const sanitized =
    typeof data.deeplink === "string" && sanitizeRedirectUrl(data.deeplink, "")
      ? sanitizeRedirectUrl(data.deeplink, "")
      : "";
  if (sanitized) return sanitized;
  const ticketId = ticketIdFrom(data);
  if (ticketId) return `/support?ticketId=${encodeURIComponent(ticketId)}`;
  const rawOrderId = typeof fallbackCta.orderId === "string" ? fallbackCta.orderId : "";
  const safeOrderId = /^[\w-]+$/.test(rawOrderId) ? rawOrderId : "";
  return safeOrderId ? `/orders/${safeOrderId}/track` : undefined;
}
function navigateToDeeplink(url: string): void {
  // Server-controlled deeplinks are untrusted input: sanitize to same-origin
  // paths only. The old code fell back to location.href on ANY value — a
  // forged FCM payload meant an open redirect off-app.
  const safe = sanitizeRedirectUrl(url, "");
  if (!safe) return;
  window.history.pushState({}, "", safe);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function handleForegroundPush(title: string, body: string, data: Record<string, any>) {
  const category = (data.category as "order" | "offer" | "general") || "general";
  const deeplink = resolvePushDeeplink(data, {
    orderId: typeof data.orderId === "string" ? data.orderId : "",
  });
  const ticketId = ticketIdFrom(data);

  useNotificationsStore.getState().push({
    id: (data.messageId as string) || `notif_${Date.now()}`,
    category,
    title: title || "Burgonomics",
    body: body || "",
    createdAt: Date.now(),
    read: false,
    deeplink,
    ctaLabel:
      (data.ctaLabel as string) ||
      (ticketId ? "View ticket" : data.orderId ? "Track order" : undefined),
  });

  toast(title || "Burgonomics", {
    description: body,
    action: deeplink
      ? {
          label: ticketId ? "View ticket" : "View",
          onClick: () => {
            navigateToDeeplink(deeplink);
          },
        }
      : undefined,
  });
}

function vapidKey(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  return env.VITE_FCM_VAPID_KEY || env.VITE_PUSH_VAPID_PUBLIC_KEY || "";
}

let webPushInitialized = false;

/**
 * Initializes listeners for incoming pushes and token registrations.
 * Safe to call on app startup.
 */
export async function initPushNotifications(): Promise<void> {
  if (!isNative() || initialized) return;
  initialized = true;

  try {
    const pushModule: any = await import(/* @vite-ignore */ "@capacitor/push-notifications").catch(
      () => null,
    );
    if (!pushModule || !pushModule.PushNotifications) return;
    const PushNotifications = pushModule.PushNotifications;

    // 1. Create the Android channel the server targets (burgonomics_updates_channel).
    // Without this, status-update pushes are silently dropped on Android.
    if (getPlatform() === "android") {
      try {
        await PushNotifications.createChannel({
          id: "burgonomics_updates_channel",
          name: "Order Updates",
          description: "Order status changes and offers",
          importance: 4,
          visibility: 1,
          sound: "default",
          vibration: true,
        });
      } catch (err: any) {
        logger.warn("push.channelCreationWarning", { message: err?.message || String(err) });
      }
    }

    // 2. Listen for successful registration & device token
    PushNotifications.addListener("registration", async (token: { value: string }) => {
      if (!token?.value) return;
      logger.info("push.registered", { token: token.value.slice(0, 10) + "..." });
      setCachedDeviceToken(token.value);
      await notificationsService.registerDeviceToken(token.value);
    });

    // 2. Listen for registration errors
    PushNotifications.addListener("registrationError", (err: any) => {
      logger.warn("push.registrationError", err);
    });

    // 3. Foreground Push Received — Show animated toast & push to notification store
    PushNotifications.addListener("pushNotificationReceived", (notification: any) => {
      logger.info("push.receivedForeground", {
        id: notification?.id,
        title: notification?.title,
      });

      const data = notification?.data || {};
      const category = (data.category as "order" | "offer" | "general") || "general";
      // Same hardened resolution as the web path: sanitized deeplink first,
      // then data.ticketId, then orderId. Never data.subject.
      const deeplink = resolvePushDeeplink(data, {
        orderId: typeof data.orderId === "string" ? data.orderId : "",
      });
      const ticketId = ticketIdFrom(data);

      // Add to notifications store
      useNotificationsStore.getState().push({
        id: notification?.id || `notif_${Date.now()}`,
        category,
        title: notification?.title || "Burgonomics",
        body: notification?.body || "",
        createdAt: Date.now(),
        read: false,
        deeplink,
        ctaLabel:
          data.ctaLabel || (ticketId ? "View ticket" : data.orderId ? "Track order" : undefined),
      });

      // Display in-app toast
      toast(notification?.title || "Burgonomics", {
        description: notification?.body,
        action: deeplink
          ? {
              label: ticketId ? "View ticket" : "View",
              onClick: () => {
                navigateToDeeplink(deeplink);
              },
            }
          : undefined,
      });
    });

    // 4. Notification Action Performed (Tapped from system tray)
    PushNotifications.addListener("pushNotificationActionPerformed", (action: any) => {
      const data = action?.notification?.data || {};
      const deeplink = resolvePushDeeplink(data, {
        orderId: typeof data.orderId === "string" ? data.orderId : "",
      });

      logger.info("push.actionPerformed", { actionId: action?.actionId, deeplink });

      if (deeplink) {
        setTimeout(() => {
          navigateToDeeplink(deeplink);
        }, 100);
      }
    });

    // Check existing permission state without prompting
    const permStatus = await PushNotifications.checkPermissions();
    if (permStatus?.receive === "granted") {
      await PushNotifications.register();
    }
  } catch (err: any) {
    logger.warn("push.initFailed", { message: err?.message || String(err) });
  }
}

/**
 * Web push (FCM) for browsers. Safe to call on boot: only resumes when
 * permission was already granted (never auto-prompts). Returns the token or null.
 */
export async function initWebPush(): Promise<string | null> {
  if (isNative() || webPushInitialized) return getCachedDeviceToken();
  webPushInitialized = true;

  try {
    if (typeof window === "undefined" || !("Notification" in window)) return null;
    if (Notification.permission !== "granted") return null;
    const key = vapidKey();
    if (!key) {
      logger.warn("push.webPushNoVapidKey");
      return null;
    }
    const [{ getMessaging, getToken, isSupported, onMessage }, { app }] = await Promise.all([
      import("firebase/messaging"),
      import("@/core/config/firebase"),
    ]);
    if (!(await isSupported())) return null;

    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: key,
      serviceWorkerRegistration: registration,
    });
    if (!token) return null;
    setCachedDeviceToken(token);
    await notificationsService.registerDeviceToken(token);

    onMessage(messaging, (payload) => {
      logger.info("push.receivedForegroundWeb", { title: payload.notification?.title });
      handleForegroundPush(
        payload.notification?.title || "Burgonomics",
        payload.notification?.body || "",
        (payload.data as Record<string, any>) || {}
      );
    });
    return token;
  } catch (err: any) {
    logger.warn("push.webInitFailed", { message: err?.message || String(err) });
    return null;
  }
}

/**
 * Contextually requests push notification permissions and registers with APNs/FCM.
 */
export async function requestPushPermissions(): Promise<boolean> {
  if (!isNative()) {
    // Web: explicit user gesture path (e.g. settings toggle) — may prompt.
    // Singleton guard: initWebPush already registered an onMessage handler;
    // a second registration double-toasts and double-pushes to the store.
    if (webPushInitialized) return !!getCachedDeviceToken();
    try {
      if (typeof window === "undefined" || !("Notification" in window)) return false;
      const key = vapidKey();
      if (!key) {
        logger.warn("push.webPushNoVapidKey");
        return false;
      }
      const [{ getMessaging, getToken, isSupported, onMessage }, { app }] = await Promise.all([
        import("firebase/messaging"),
        import("@/core/config/firebase"),
      ]);
      if (!(await isSupported())) return false;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return false;
      webPushInitialized = true;
      const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
      const messaging = getMessaging(app);
      const token = await getToken(messaging, {
        vapidKey: key,
        serviceWorkerRegistration: registration,
      });
      if (!token) return false;
      setCachedDeviceToken(token);
      await notificationsService.registerDeviceToken(token);
      onMessage(messaging, (payload) => {
        handleForegroundPush(
          payload.notification?.title || "Burgonomics",
          payload.notification?.body || "",
          (payload.data as Record<string, any>) || {}
        );
      });
      return true;
    } catch (err: any) {
      logger.warn("push.webRequestFailed", { message: err?.message || String(err) });
      return false;
    }
  }

  try {
    const pushModule: any = await import(/* @vite-ignore */ "@capacitor/push-notifications").catch(
      () => null,
    );
    if (!pushModule || !pushModule.PushNotifications) return false;
    const PushNotifications = pushModule.PushNotifications;

    let permStatus = await PushNotifications.checkPermissions();

    if (permStatus?.receive === "prompt" || permStatus?.receive === "prompt-with-rationale") {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus?.receive === "granted") {
      await PushNotifications.register();
      return true;
    }

    return false;
  } catch (err: any) {
    logger.error("push.requestPermissionsError", { message: err?.message || String(err) });
    return false;
  }
}
