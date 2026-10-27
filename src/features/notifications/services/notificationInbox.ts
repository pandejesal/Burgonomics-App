/**
 * Resolves the inbox document referenced by a push/tap.
 *
 * The account payload only carries `ref`; the app reads
 * `users/{uid}/notifications/{ref}` AFTER auth and derives the route from the
 * server-written `purpose` + `targetId`. A missing/denied/offline document
 * resolves to the notification centre — never `/`, and never an
 * unauthenticated navigation into an order or ticket id taken from the wire.
 */
import { auth } from "@/core/config/firebase";
import {
  resolveInboxNavigation,
  resolveInboxTarget,
  safeNotificationId,
  type NotificationNavigation,
} from "@/features/notifications/utils/notificationRouting";

export interface InboxNotificationDoc {
  id: string;
  purpose: string | null;
  targetId: string | null;
  read: boolean;
}

export async function currentAuthUid(): Promise<string | null> {
  try {
    await auth.authStateReady?.();
  } catch {
    // Auth readiness is best-effort; fall through to currentUser.
  }
  return auth.currentUser?.uid ?? null;
}

export async function readInboxNotification(
  uid: string,
  ref: string,
): Promise<InboxNotificationDoc | null> {
  const safeRef = safeNotificationId(ref);
  if (!uid || !safeRef) return null;
  try {
    const [{ db }, { doc, getDoc }] = await Promise.all([
      import("@/core/config/firebase"),
      import("firebase/firestore"),
    ]);
    const snapshot = await getDoc(doc(db, "users", uid, "notifications", safeRef));
    if (!snapshot.exists()) return null;
    const data = snapshot.data() as Record<string, unknown> | undefined;
    return {
      id: safeRef,
      purpose: typeof data?.purpose === "string" ? data.purpose : null,
      targetId: typeof data?.targetId === "string" ? data.targetId : null,
      read: data?.read === true,
    };
  } catch {
    // Denied/offline: the caller keeps the customer on the notification
    // centre rather than guessing a private route.
    return null;
  }
}

/** Route for a `ref` belonging to the signed-in account. */
export async function resolveNotificationRefTarget(ref: string): Promise<string> {
  const uid = await currentAuthUid();
  if (!uid) return "/profile/notifications";
  const doc = await readInboxNotification(uid, ref);
  if (!doc) return "/profile/notifications";
  return resolveInboxTarget(doc.purpose, doc.targetId);
}

/** Structured route for TanStack `navigate` (search/params, no query in `to`). */
export async function resolveNotificationRefNavigation(
  ref: string,
): Promise<NotificationNavigation> {
  const uid = await currentAuthUid();
  if (!uid) return { to: "/profile/notifications" };
  const doc = await readInboxNotification(uid, ref);
  if (!doc) return { to: "/profile/notifications" };
  return resolveInboxNavigation(doc.purpose, doc.targetId);
}
