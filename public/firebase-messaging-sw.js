/* Firebase Cloud Messaging service worker (live).
 * Serves web-push background notifications. Firebase web config below is
 * browser-public by design (same values as src/core/config/firebase.ts).
 * Registered by the app only after the user grants notification permission.
 */
/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js");

/**
 * Server-controlled push payloads are untrusted input. This is the service-
 * worker copy of the app's allowlist (src/features/auth/utils/routeUtils.ts
 * sanitizeRedirectUrl + shared/platform/pushNotifications.ts
 * resolvePushDeeplink): only same-origin absolute paths are ever opened.
 * Previously the SW handed `data.deeplink` straight to clients.openWindow,
 * so a forged FCM payload could open any origin inside the app window.
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

function ticketIdFrom(data) {
  var raw = data && typeof data.ticketId === "string" ? data.ticketId : "";
  return /^[\w-]{1,64}$/.test(raw) ? raw : "";
}

function orderIdFrom(data) {
  var raw = data && typeof data.orderId === "string" ? data.orderId : "";
  return /^[\w-]+$/.test(raw) ? raw : "";
}

/** Same precedence as resolvePushDeeplink: deeplink -> ticket -> order -> "/". */
function resolveNotificationTarget(data) {
  var safe = sanitizeSameOriginPath(data && data.deeplink);
  if (safe) return safe;
  var ticketId = ticketIdFrom(data);
  if (ticketId) return "/support?ticketId=" + encodeURIComponent(ticketId);
  var orderId = orderIdFrom(data);
  return orderId ? "/orders/" + orderId + "/track" : "/";
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

try {
  firebase.initializeApp({
    apiKey: "AIzaSyAuoa6yU-S8bNR3QDI3DjTUvbKNyBu3_Fs",
    authDomain: "burgonomics-7faa8.firebaseapp.com",
    projectId: "burgonomics-7faa8",
    storageBucket: "burgonomics-7faa8.firebasestorage.app",
    messagingSenderId: "738930066637",
    appId: "1:738930066637:web:fc1aa0f0e2a52a19df9584",
  });

  var messaging = firebase.messaging();

  messaging.onBackgroundMessage(function (payload) {
    var title = (payload.notification && payload.notification.title) || "Burgonomics";
    var options = {
      body: (payload.notification && payload.notification.body) || "Order update available",
      icon: "/burgonomics-logo.png",
      badge: "/favicon.ico",
      data: payload.data || {},
    };
    return self.registration.showNotification(title, options);
  });

  self.addEventListener("notificationclick", function (event) {
    event.notification.close();
    var data = event.notification.data || {};
    var origin = self.location.origin;
    var targetPath = resolveNotificationTarget(data);
    var targetUrl = absoluteUrlFor(targetPath, origin) || origin + "/";

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
} catch (e) {
  // Service worker must never throw at install time.
}
