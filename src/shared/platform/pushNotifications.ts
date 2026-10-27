/**
 * Native + web push notifications.
 *
 * Contract C-03/§11 rules implemented here:
 * - Payloads carry only `{ purpose, category, recipientUid, ref }`.
 * - A payload whose `recipientUid` is not the signed-in uid is dropped before
 *   the inbox, toast, or navigation.
 * - Routing resolves `users/{uid}/notifications/{ref}` after auth; it never
 *   reads `deeplink`/`ticketId`/`orderId` from the wire and never falls back
 *   to `/`.
 * - The web permission prompt is only issued from an explicit toggle ON;
 *   "boot listener attached" and "permission decided" are separate states.
 */
import { isNative, getPlatform } from "./platform";
import { logger } from "@/core/logging/logger";
import { appConfig } from "@/core/config/env";
import { toast } from "@/shared/components/feedback/AppToaster";
import { sanitizeRedirectUrl } from "@/features/auth/utils/routeUtils";
import {
  normalizeNotificationCategory,
  useNotificationsStore,
} from "@/features/notifications/state/notificationsStore";
import { notificationsService } from "@/features/notifications/services/notificationsService";
import {
  readInboxNotification,
  currentAuthUid,
} from "@/features/notifications/services/notificationInbox";
import { reconcilePendingUnlinkOnRegistration } from "@/features/notifications/services/pendingUnlink";
import {
  NOTIFICATION_CENTRE_PATH,
  parsePushPayload,
  resolveInboxTarget,
  resolvePublicTarget,
} from "@/features/notifications/utils/notificationRouting";

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
 * Removes the operational token cache. Called only after the retry-only
 * secure copy has been written (F3/B2); normal success keeps the token.
 */
export function clearCachedDeviceToken(): void {
  setCachedDeviceToken(null);
}

function navigateToTarget(url: string): void {
  // Targets are built from the routing allowlist, but sanitize anyway: a
  // future caller must not be able to turn this into an open redirect.
  const safe = sanitizeRedirectUrl(url, NOTIFICATION_CENTRE_PATH);
  if (!safe) return;
  window.history.pushState({}, "", safe);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

interface PushDisplay {
  target: string;
  category: ReturnType<typeof normalizeNotificationCategory>;
  id: string;
}

/**
 * Applies the ownership gate and resolves the real target. Returns null when
 * the payload must be dropped before any UI side effect.
 */
async function resolvePushDisplay(
  data: Record<string, unknown>,
): Promise<PushDisplay | null> {
  const parsed = parsePushPayload(data);
  const uid = await currentAuthUid();

  if (parsed.recipientUid) {
    if (!uid || parsed.recipientUid !== uid) {
      logger.info("push.droppedForeignRecipient");
      return null;
    }
  } else if (parsed.purpose === "orderUpdates" || parsed.purpose === "supportReplies") {
    // Account purposes can never be displayed without an ownership claim.
    logger.warn("push.droppedUnverifiedAccountPurpose", { purpose: parsed.purpose });
    return null;
  }

  let target = NOTIFICATION_CENTRE_PATH;
  if (parsed.ref) {
    if (!uid) {
      logger.info("push.droppedUnresolvedRefSignedOut");
      return null;
    }
    const inboxDoc = await readInboxNotification(uid, parsed.ref);
    target = resolveInboxTarget(inboxDoc?.purpose, inboxDoc?.targetId);
  } else if (!parsed.recipientUid) {
    target = resolvePublicTarget(parsed.purpose, parsed.category);
  }

  const messageId = typeof data.messageId === "string" ? data.messageId : null;
  return {
    target,
    category: normalizeNotificationCategory(parsed.rawCategory ?? parsed.purpose),
    id: parsed.ref ?? messageId ?? `notif_${Date.now()}`,
  };
}

/** Shared foreground handler for web `onMessage` and native received events. */
export async function handleForegroundPush(
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<void> {
  const display = await resolvePushDisplay(data);
  if (!display) return;

  // Only the signed-in account's tray receives the row (uid-scoped store);
  // a public broadcast with no account shown while signed out stays a toast.
  const uid = await currentAuthUid();
  if (uid) {
    useNotificationsStore.getState().push({
      id: display.id,
      category: display.category,
      title: title || "Burgonomics",
      body: body || "",
      createdAt: Date.now(),
      read: false,
      deeplink: display.target,
      ctaLabel:
        display.category === "support"
          ? "View ticket"
          : display.category === "order"
            ? "Track order"
            : display.category === "offer"
              ? "View offers"
              : "View",
    });
  }

  toast(title || "Burgonomics", {
    description: body,
    action: {
      label:
        display.category === "support"
          ? "View ticket"
          : display.category === "order"
            ? "Track order"
            : "View",
      onClick: () => {
        navigateToTarget(display.target);
      },
    },
  });
}

async function handleNotificationTap(data: Record<string, unknown>): Promise<void> {
  const display = await resolvePushDisplay(data);
  if (!display) return;
  navigateToTarget(display.target);
}

function vapidKey(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  return env.VITE_FCM_VAPID_KEY || env.VITE_PUSH_VAPID_PUBLIC_KEY || "";
}

let webPushBootAttempted = false;
let webPushListenerAttached = false;

type PushPermission = "granted" | "denied" | "default" | "unsupported";

let nativePermission: PushPermission = "default";

export interface PushStatusSnapshot {
  enabled: boolean;
  permission: PushPermission;
  listenerAttached: boolean;
}

let cachedPushStatus: PushStatusSnapshot | null = null;
const pushStatusListeners = new Set<() => void>();

function readPermission(): PushPermission {
  if (isNative()) return nativePermission;
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  const permission = Notification.permission;
  return permission === "granted" || permission === "denied" ? permission : "default";
}

/** Stable snapshot for useSyncExternalStore/consumers (new object only on change). */
export function getPushStatusSnapshot(): PushStatusSnapshot {
  const next: PushStatusSnapshot = {
    enabled: appConfig.push.enabled,
    permission: readPermission(),
    listenerAttached: isNative() ? initialized : webPushListenerAttached,
  };
  if (
    !cachedPushStatus ||
    cachedPushStatus.enabled !== next.enabled ||
    cachedPushStatus.permission !== next.permission ||
    cachedPushStatus.listenerAttached !== next.listenerAttached
  ) {
    cachedPushStatus = next;
  }
  return cachedPushStatus;
}

export function subscribePushStatus(listener: () => void): () => void {
  pushStatusListeners.add(listener);
  return () => {
    pushStatusListeners.delete(listener);
  };
}

function notifyPushStatus(): void {
  cachedPushStatus = null;
  for (const listener of pushStatusListeners) {
    try {
      listener();
    } catch {
      // A consumer must never break push setup.
    }
  }
}

function mapNativePermission(value: unknown): PushPermission {
  return value === "granted" || value === "denied" ? value : "default";
}

/** True once the browser/native permission is no longer "default". */
export function isPushPermissionDecided(): boolean {
  const permission = getPushStatusSnapshot().permission;
  return permission === "granted" || permission === "denied";
}

/** True only when the foreground listener is live (not a boot attempt). */
export function isPushListenerAttached(): boolean {
  return getPushStatusSnapshot().listenerAttached;
}

async function reconcileTokenBeforeRegister(token: string): Promise<boolean> {
  const outcome = await reconcilePendingUnlinkOnRegistration(token);
  if (outcome === "failed") {
    logger.warn("push.registrationDeferredForPendingUnlink");
    return false;
  }
  return true;
}

/**
 * Initializes native listeners for incoming pushes and token registrations.
 * Safe to call on app startup; never prompts.
 */
export async function initPushNotifications(): Promise<void> {
  // Documented kill-switch: VITE_PUSH_ENABLED=false (default) disables all
  // push registration paths; no token is ever minted while disabled.
  if (!appConfig.push.enabled) return;
  if (!isNative() || initialized) return;
  initialized = true;
  notifyPushStatus();

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
      logger.info("push.registered", { tokenLength: token.value.length });
      setCachedDeviceToken(token.value);
      const canRegister = await reconcileTokenBeforeRegister(token.value);
      if (!canRegister) return;
      await notificationsService.registerDeviceToken(token.value);
    });

    // 2b. Listen for registration errors
    PushNotifications.addListener("registrationError", (err: any) => {
      logger.warn("push.registrationError", err);
    });

    // 3. Foreground Push Received — ownership-gated toast & inbox row
    PushNotifications.addListener("pushNotificationReceived", (notification: any) => {
      logger.info("push.receivedForeground", {
        title: notification?.title,
      });
      const data = (notification?.data as Record<string, unknown>) || {};
      void handleForegroundPush(
        notification?.title || "Burgonomics",
        notification?.body || "",
        data,
      );
    });

    // 4. Notification Action Performed (Tapped from system tray)
    PushNotifications.addListener("pushNotificationActionPerformed", (action: any) => {
      const data = (action?.notification?.data as Record<string, unknown>) || {};
      logger.info("push.actionPerformed", { actionId: action?.actionId });
      void (async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        await handleNotificationTap(data);
      })();
    });

    // Check existing permission state without prompting
    const permStatus = await PushNotifications.checkPermissions();
    nativePermission = mapNativePermission(permStatus?.receive);
    notifyPushStatus();
    if (permStatus?.receive === "granted") {
      await PushNotifications.register();
    }
  } catch (err: any) {
    logger.warn("push.initFailed", { message: err?.message || String(err) });
  }
}

/** Registers the SW, mints the token, attaches one foreground listener, and
 * associates the token. Caller decides whether permission may be prompted. */
async function setupWebPush(): Promise<string | null> {
  if (typeof window === "undefined" || !("Notification" in window)) return null;
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
  const canRegister = await reconcileTokenBeforeRegister(token);
  if (canRegister) {
    await notificationsService.registerDeviceToken(token);
  }

  if (!webPushListenerAttached) {
    onMessage(messaging, (payload) => {
      logger.info("push.receivedForegroundWeb", { title: payload.notification?.title });
      void handleForegroundPush(
        payload.notification?.title || "Burgonomics",
        payload.notification?.body || "",
        (payload.data as Record<string, unknown>) || {},
      );
    });
    webPushListenerAttached = true;
    notifyPushStatus();
  }
  return token;
}

/**
 * Web push for browsers. Safe to call on boot: only resumes when permission
 * was already granted (never auto-prompts).
 */
export async function initWebPush(): Promise<string | null> {
  if (!appConfig.push.enabled) return null;
  if (isNative()) return getCachedDeviceToken();
  if (webPushBootAttempted) return getCachedDeviceToken();
  webPushBootAttempted = true;

  try {
    if (typeof window === "undefined" || !("Notification" in window)) return null;
    notifyPushStatus();
    if (Notification.permission !== "granted") return null;
    return await setupWebPush();
  } catch (err: any) {
    logger.warn("push.webInitFailed", { message: err?.message || String(err) });
    return null;
  }
}

/**
 * Contextually requests push notification permissions and registers. This is
 * the ONLY path allowed to show a browser permission prompt, and it is called
 * only from an explicit settings toggle ON.
 */
export async function requestPushPermissions(): Promise<boolean> {
  if (!appConfig.push.enabled) return false;
  if (!isNative()) {
    try {
      if (typeof window === "undefined" || !("Notification" in window)) return false;
      if (webPushListenerAttached) return !!getCachedDeviceToken();
      if (Notification.permission === "denied") {
        notifyPushStatus();
        return false;
      }
      if (Notification.permission === "default") {
        const permission = await Notification.requestPermission();
        notifyPushStatus();
        if (permission !== "granted") return false;
      } else {
        notifyPushStatus();
      }
      return !!(await setupWebPush());
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

    nativePermission = mapNativePermission(permStatus?.receive);
    notifyPushStatus();

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
