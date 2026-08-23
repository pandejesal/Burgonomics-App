# BURGONOMICS — Deployment Strategy (Layer 3 Constraint)

> **Factory Configuration**: Build pipelines, Capacitor compilation, Netlify serverless functions, and release verification.

---

## 1. 🏗️ Build Pipelines

### Customer App (`burgonomics-foundation-core`)
```bash
# Vite Production Build
npm run build

# Capacitor Sync & Android Build
npx cap sync android
cd android && ./gradlew assembleDebug
```

### Partner App (`burgonomics-partner`)
```bash
# Vite Production Build
npm run build

# Capacitor Sync & Android Build
npx cap sync android
cd android && ./gradlew assembleDebug
```

---

## 2. ⚡ Serverless Functions (Netlify)
All backend API bridges live under `/netlify/functions/`:
- `sync-menu.ts`: Hourly menu ingestion & transform from Petpooja POS
- `push-order-to-petpooja.ts`: Order submission to Petpooja KOT queue
- `petpooja-callback.ts`: Webhook receiver for real-time kitchen status changes
- `porter-delivery.ts`: Porter dispatch & rider assignment API
- `send-notification.ts`: FCM push notifications for order status updates

### Local Invocation & Testing
```bash
netlify dev
netlify functions:call push-order-to-petpooja
```

---

## 3. 📱 Release Gates
1. `CAPACITOR_DEBUG=false` in production APK builds.
2. Zero build warnings on TypeScript typechecking (`tsc --noEmit`).
3. Security rules deployed via Firebase CLI (`firebase deploy --only firestore:rules`).
