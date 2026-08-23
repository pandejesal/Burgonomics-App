# BURGONOMICS — Push Notifications Architecture (Layer 3 Constraint)

> **Reference Specification**: Firebase Cloud Messaging (FCM) topic hierarchy, service worker integration, and notification trigger functions.
> **Locked Grill Directives (Q6, Q8, Grill 12)**: Native & web FCM topics, background service worker, and serverless notification dispatcher.

---

## 1. 📢 Complete FCM Topic Hierarchy

| Topic Pattern | Target Audience | Trigger Event | Payload Content |
|---|---|---|---|
| `order_{orderId}` | Specific Customer | Order status transition (`accepted`, `preparing`, `ready`, `out_for_delivery`, `delivered`) | `{ title: "Order Update", body: "Burger on the way!", data: { orderId, status } }` |
| `branch_{branchId}` | Branch Operator(s) | New incoming order, No Porter rider alert, New ticket | `{ title: "New Order", body: "₹450 order received", sound: "order_alert" }` |
| `brand` | Brand Owners (Yash & Nehh) | 24h SLA ticket breach, daily summary, emergency alert | `{ title: "SLA Warning", body: "Ticket #402 breached SLA" }` |
| `chat_{pairId}` | Chat Room Participant (Branch or Brand) | New direct message in `chats/{pairId}/messages` (Q8) | `{ title: "New Message", body: senderText, data: { pairId, messageId } }` |
| `upcoming_{branchId}` | Subscribed Customers (Q6/Q10) | Upcoming branch launched / Grand opening | `{ title: "Grand Opening!", body: "Navrangpura branch is now open!", data: { branchId } }` |

---

## 2. 🌐 Service Worker (`public/firebase-messaging-sw.js`)

Web push notifications require a service worker registered at web root:
```javascript
// public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "...",
  projectId: "...",
  messagingSenderId: "...",
  appId: "..."
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icon-192.png',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
```

---

## 3. ⚡ Cloud Notification Trigger (`netlify/functions/notify.ts`)

Server-side FCM dispatcher called whenever orders mutate, direct messages are posted, or upcoming branches open:
```typescript
// netlify/functions/notify.ts
import { getMessaging } from 'firebase-admin/messaging';

export async function sendTopicNotification(topic: string, title: string, body: string, data?: Record<string, string>) {
  const message = {
    topic,
    notification: { title, body },
    data: data || {},
    android: {
      priority: 'high' as const,
      notification: { sound: 'default' }
    }
  };

  return await getMessaging().send(message);
}
```
