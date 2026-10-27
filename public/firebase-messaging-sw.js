/* Firebase Cloud Messaging service worker (live).
 * Serves web-push background notifications. Firebase web config below is
 * browser-public by design (same values as src/core/config/firebase.ts).
 * Registered by the app only after the user grants notification permission.
 *
 * C-06 audit (2026-10-25): the previous copy was a proven defect, not just
 * style drift.
 *  1. Duplicate display: the Firebase SDK already calls
 *     `self.registration.showNotification()` for a payload with a
 *     `notification` block (@firebase/messaging dist/index.sw.cjs `onPush`:
 *     `if (!!internalPayload.notification) await showNotification(...)`) and
 *     THEN invokes `onBackgroundMessage`. The old handler displayed a second
 *     notification from the same payload.
 *  2. Targetless tap / root fallback: the SDK owns `notificationclick` for
 *     notifications it displayed and stops propagation; the old handler also
 *     resolved `deeplink -> ticketId -> orderId -> "/"`. Account payloads no
 *     longer carry those ids, so taps could land on `/` or do nothing.
 *  3. Privacy: the old handler copied raw `payload.data` into the notification
 *     and routed from it. Routing now derives only from `ref`; public
 *     offers/announcements get public routes.
 * Fix: no custom showNotification, no payload id routing, and our click
 * listener is registered BEFORE `firebase.messaging()` so it owns the tap and
 * opens the real notification-centre route.
 */
/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js");

/**
 * Server-controlled push payloads are untrusted input. Only same-origin
 * absolute paths are ever opened.
 */
function sanitizeSameOriginPath(raw) {
  if (typeof raw !== "string" || raw.length === 0) return "";
  // Exactly one leading slash: "//host" and "/\host" are protocol-relative.
  if (raw.charAt(0) !== "/") return "";
  if (raw.charAt(1) === "/" || raw.charAt(1) === "\\") return "";
  // Reject control characters and raw whitespace (header/URL splitting tricks).
  if (/[\u0000-\u001f\u007f\s]/.test(raw)) return "";
  return raw;
}

function refIdFrom(data) {
  var raw = data && typeof data.ref === "string" ? data.ref : "";
  return /^[\w-]{1,128}$/.test(raw) ? raw : "";
}

function purposeFrom(data) {
  return data && typeof data.purpose === "string" ? data.purpose : "";
}

/**
 * Account notifications open the inbox route with the document id; the app
 * resolves the real order/ticket target after auth. Public broadcasts keep
 * public destinations. The terminal fallback is the notification centre —
 * never "/".
 */
function resolveNotificationTarget(data) {
  var ref = refIdFrom(data);
  if (ref) return "/profile/notifications?ref=" + encodeURIComponent(ref);
  var purpose = purposeFrom(data);
  if (purpose === "offers") return "/offers";
  if (purpose === "announcements") return "/home";
  return "/profile/notifications";
}

/**
 * The SDK displays a notification with `data = { FCM_MSG: payload }`; a
 * notification we show ourselves (or one from another sender) carries its own
 * data object. Read our fields in both shapes without ever using private
 * deeplink/order/ticket ids.
 */
function payloadDataFrom(notification) {
  var raw = notification && notification.data;
  if (!raw || typeof raw !== "object") return {};
  var fcm = raw.FCM_MSG;
  if (fcm && typeof fcm === "object" && fcm.data && typeof fcm.data === "object") {
    return fcm.data;
  }
  return raw;
}

/** Absolute URL for a same-origin path; "" when it cannot be built. */
function absoluteUrlFor(path, origin) {
  try {
    var url = new URL(path, origin);
    return url.origin === origin ? url.href : "";
  } catch (e) {
    return "";
  }
}

/**
 * `Client.url` is always ABSOLUTE (https://host/path) while the resolved
 * target is a relative path. Comparing them directly never matched, so every
 * tap opened a duplicate tab. Normalise both to origin-stripped path+query.
 * Non-same-origin windows never match (never focus some other app's tab).
 */
function normalizedPath(url, origin) {
  try {
    var parsed = new URL(url, origin);
    if (parsed.origin !== origin) return "";
    return parsed.pathname + parsed.search + parsed.hash;
  } catch (e) {
    return "";
  }
}

function findMatchingClient(clientList, targetPath, origin) {
  var wanted = normalizedPath(targetPath, origin);
  if (!wanted) return null;
  for (var i = 0; i < clientList.length; i++) {
    var client = clientList[i];
    if (!client || typeof client.url !== "string") continue;
    if (normalizedPath(client.url, origin) === wanted && "focus" in client) {
      return client;
    }
  }
  return null;
}

/**
 * Registered BEFORE `firebase.messaging()` so this handler runs first. It
 * stops the SDK's own click handler (which would otherwise stop propagation
 * and open a targetless link) and opens the resolved route instead.
 */
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  try {
    event.stopImmediatePropagation();
  } catch (e) {
    // Older workers may not expose it; the URL still opens below.
  }

  var data = payloadDataFrom(event.notification);
  var targetPath = sanitizeSameOriginPath(resolveNotificationTarget(data));
  if (!targetPath) return;

  var origin = self.location.origin;
  var targetUrl = absoluteUrlFor(targetPath, origin);
  if (!targetUrl) return;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      var match = findMatchingClient(clientList || [], targetPath, origin);
      if (match) {
        return match.focus();
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

try {
  firebase.initializeApp({
    apiKey: "AIzaSyAuoa6yU-S8bNR3QDI3DjTUvbKNyBu3_Fs",
    authDomain: "burgonomics-7faa8.firebaseapp.com",
    projectId: "burgonomics-7faa8",
    storageBucket: "burgonomics-7faa8.firebasestorage.app",
    messagingSenderId: "738930066637",
    appId: "1:738930066637:web:fc1aa0f0e2a52a19df9584",
  });

  // Initializes the SDK's push handler. The SDK displays the generic
  // notification payload exactly once; we intentionally do NOT register an
  // onBackgroundMessage handler that would display it a second time.
  firebase.messaging();
} catch (e) {
  // Service worker must never throw at install time.
}
