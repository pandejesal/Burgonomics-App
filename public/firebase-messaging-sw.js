// Firebase Cloud Messaging Service Worker (Stub)
// Loaded in background when FCM is enabled via VITE_FCM_VAPID_KEY and FCM_ENABLED=true.

/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js");

// Initialize Firebase in the service worker with dummy/injected config
try {
  self.addEventListener("install", () => {
    self.skipWaiting();
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
  });

  // Handle background messages
  self.addEventListener("push", (event) => {
    if (!event.data) return;
    try {
      const payload = event.data.json();
      const title = payload.notification?.title || "Burgonomics";
      const options = {
        body: payload.notification?.body || "Order update available",
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-72.png",
        data: payload.data || {},
      };
      event.waitUntil(self.registration.showNotification(title, options));
    } catch {
      // Ignored in stub mode
    }
  });

  self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const targetUrl = event.notification.data?.url || "/";
    event.waitUntil(
      self.clients.matchAll({ type: "window" }).then((clientList) => {
        for (const client of clientList) {
          if (client.url === targetUrl && "focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      }),
    );
  });
} catch (e) {
  // Service worker initialization safe-fallback
}
