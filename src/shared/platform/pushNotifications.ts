/**
 * Native Push Notifications Manager.
 *
 * Wraps @capacitor/push-notifications with dynamic imports so SSR / Web builds
 * are never burdened by native dependencies. Integrates foreground in-app toasts,
 * deep-link action routing, and device token syncing with Firestore.
 */
import { isNative } from "./platform";
import { logger } from "@/core/logging/logger";
import { toast } from "@/shared/components/feedback/AppToaster";
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

function navigateToDeeplink(url: string): void {
  try {
    window.history.pushState({}, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  } catch {
    window.location.href = url;
  }
}

function handleForegroundPush(title: string, body: string, data: Record<string, any>) {
  const category = (data.category as "order" | "offer" | "general") || "general";
  const deeplink =
    data.deeplink || (data.orderId ? `/orders/${data.orderId}/track` : undefined);

  useNotificationsStore.getState().push({
    id: (data.messageId as string) || `notif_${Date.now()}`,
    category,
    title: title || "Burgonomics",
    body: body || "",
    createdAt: Date.now(),
    read: false,
    deeplink,
    ctaLabel: (data.ctaLabel as string) || (data.orderId ? "Track order" : undefined),
  });

  toast(title || "Burgonomics", {
    description: body,
    action: deeplink
      ? {
          label: "View",
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

    // 1. Listen for successful registration & device token
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
      const deeplink =
        data.deeplink || (data.orderId ? `/orders/${data.orderId}/track` : undefined);

      // Add to notifications store
      useNotificationsStore.getState().push({
        id: notification?.id || `notif_${Date.now()}`,
        category,
        title: notification?.title || "Burgonomics",
        body: notification?.body || "",
        createdAt: Date.now(),
        read: false,
        deeplink,
        ctaLabel: data.ctaLabel || (data.orderId ? "Track order" : undefined),
      });

      // Display in-app toast
      toast(notification?.title || "Burgonomics", {
        description: notification?.body,
        action: deeplink
          ? {
              label: "View",
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
      const deeplink =
        data.deeplink || (data.orderId ? `/orders/${data.orderId}/track` : undefined);

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
