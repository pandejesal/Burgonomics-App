/* Firebase Cloud Messaging service worker (live).
 * Serves web-push background notifications. Firebase web config below is
 * browser-public by design (same values as src/core/config/firebase.ts).
 * Registered by the app only after the user grants notification permission.
 */
/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js");

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
    var targetUrl = data.deeplink || (data.orderId ? "/orders/" + data.orderId + "/track" : "/");
    event.waitUntil(
      self.clients.matchAll({ type: "window" }).then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
          if (clientList[i].url === targetUrl && "focus" in clientList[i]) {
            return clientList[i].focus();
          }
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
