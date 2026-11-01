/**
 * Pure push-payload routing rules (contract C-03/§11).
 *
 * Account payloads carry only `{ purpose, category, recipientUid, ref }`.
 * Routing never reads `deeplink`, `ticketId` or `orderId`: after auth the app
 * resolves `users/{uid}/notifications/{ref}` and derives the real target from
 * the server-written `purpose` + `targetId`. The terminal fallback is always
 * the notification centre — never `/`.
 */
import {
  normalizeNotificationCategory,
  type NotificationCategory,
} from "@/features/notifications/state/notificationsStore";

export const SAFE_NOTIFICATION_ID = /^[\w-]{1,128}$/;
export const SAFE_RECIPIENT_UID = /^[A-Za-z0-9_-]{1,128}$/;

export const NOTIFICATION_CENTRE_PATH = "/profile/notifications";
export const PUBLIC_OFFERS_PATH = "/offers";
export const PUBLIC_ANNOUNCEMENTS_PATH = "/home";

export type PushPurpose =
  | "orderUpdates"
  | "supportReplies"
  | "offers"
  | "announcements"
  | "system"
  | "operational";

const PURPOSES: ReadonlySet<string> = new Set<PushPurpose>([
  "orderUpdates",
  "supportReplies",
  "offers",
  "announcements",
  "system",
  "operational",
]);

export interface ParsedPushPayload {
  purpose: PushPurpose | null;
  category: NotificationCategory;
  rawCategory: string | null;
  recipientUid: string | null;
  ref: string | null;
}

export function safeNotificationId(value: unknown): string | null {
  return typeof value === "string" && SAFE_NOTIFICATION_ID.test(value) ? value : null;
}

export function safeRecipientUid(value: unknown): string | null {
  return typeof value === "string" && SAFE_RECIPIENT_UID.test(value) ? value : null;
}

export function parsePushPayload(
  data: Record<string, unknown> | null | undefined,
): ParsedPushPayload {
  const source = data ?? {};
  const purpose =
    typeof source.purpose === "string" && PURPOSES.has(source.purpose)
      ? (source.purpose as PushPurpose)
      : null;
  const rawCategory = typeof source.category === "string" ? source.category : null;
  return {
    purpose,
    category: normalizeNotificationCategory(rawCategory ?? purpose),
    rawCategory,
    recipientUid: safeRecipientUid(source.recipientUid),
    ref: safeNotificationId(source.ref),
  };
}

export type NotificationNavigation =
  | { to: "/support"; search: { ticketId: string } }
  | { to: "/orders/$orderId/track"; params: { orderId: string } }
  | { to: typeof NOTIFICATION_CENTRE_PATH };

/**
 * Structured target for TanStack navigation. `navigate({ to: "/support?..." })`
 * puts a query string in a pathname; passing `search`/`params` structurally is
 * the supported API and avoids a transient not-found match.
 */
export function resolveInboxNavigation(
  purpose: string | null | undefined,
  targetId: unknown,
): NotificationNavigation {
  const id = safeNotificationId(targetId);
  if (purpose === "supportReplies" && id) {
    return { to: "/support", search: { ticketId: id } };
  }
  if (purpose === "orderUpdates" && id) {
    return { to: "/orders/$orderId/track", params: { orderId: id } };
  }
  return { to: NOTIFICATION_CENTRE_PATH };
}

/**
 * String target used for the in-app inbox row/toast. Missing/denied documents
 * land on the notification centre, never `/`.
 */
export function resolveInboxTarget(
  purpose: string | null | undefined,
  targetId: unknown,
): string {
  const navigation = resolveInboxNavigation(purpose, targetId);
  if (navigation.to === "/support") {
    return `/support?ticketId=${encodeURIComponent(navigation.search.ticketId)}`;
  }
  if (navigation.to === "/orders/$orderId/track") {
    return `/orders/${encodeURIComponent(navigation.params.orderId)}/track`;
  }
  return NOTIFICATION_CENTRE_PATH;
}

/**
 * Public broadcasts (`offers`/`announcements`) have no per-user inbox ref.
 * They keep public destinations instead of becoming targetless.
 */
export function resolvePublicTarget(
  purpose: string | null | undefined,
  category: NotificationCategory,
): string {
  if (purpose === "offers" || category === "offer") return PUBLIC_OFFERS_PATH;
  if (purpose === "announcements" || category === "general") {
    return PUBLIC_ANNOUNCEMENTS_PATH;
  }
  return NOTIFICATION_CENTRE_PATH;
}

/** `?ref=` is an inbox document id — accept the id alphabet only. */
export function parseNotificationRefSearch(search: Record<string, unknown>): {
  ref?: string;
} {
  const ref = safeNotificationId(search.ref);
  return ref ? { ref } : {};
}

export type TrayNavigation =
  | NotificationNavigation
  | { to: "/offers" }
  | { to: "/home" };

const STORED_TARGET_ORIGIN = "https://stored.invalid";

/**
 * Parses a stored in-app notification deeplink into a structured TanStack
 * target. Support ticket ids move to `search.ticketId`; order ids move to
 * route params. Unknown/unsafe strings return null instead of becoming a raw
 * `to` path with a query string.
 */
export function parseStoredNotificationTarget(target: string): TrayNavigation | null {
  if (
    typeof target !== "string" ||
    !target.startsWith("/") ||
    target.startsWith("//") ||
    target.startsWith("/\\")
  ) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(target, STORED_TARGET_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== STORED_TARGET_ORIGIN) return null;

  if (url.pathname === "/support") {
    const ticketId = safeNotificationId(url.searchParams.get("ticketId"));
    return ticketId ? { to: "/support", search: { ticketId } } : null;
  }
  if (url.pathname === "/profile/notifications") {
    return { to: NOTIFICATION_CENTRE_PATH };
  }
  if (url.pathname === "/offers") return { to: "/offers" };
  if (url.pathname === "/home") return { to: "/home" };

  const orderMatch = /^\/orders\/([^/]+)\/track$/.exec(url.pathname);
  if (orderMatch) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(orderMatch[1]);
    } catch {
      return null;
    }
    const orderId = safeNotificationId(decoded);
    return orderId ? { to: "/orders/$orderId/track", params: { orderId } } : null;
  }
  return null;
}
