# Burgonomics Physical Device Installation & Deployment Guide

This document provides exact instructions for building, signing, and installing the Burgonomics app on physical Android and iOS devices, along with the configuration needed to switch from demo sandbox mode to live production.

---

## 1. Android Physical Device Installation (Release APK)

### Prerequisites
- Android device with USB Debugging enabled (or file transfer capability)
- Java 17+ and Android SDK

### Step 1: Keystore Verification
The release keystore is located at `android/release.keystore` (ignored by Git) with SHA-256 fingerprint matching `public/.well-known/assetlinks.json`:
`C8:70:5A:38:DA:BA:C8:A6:2A:AF:0B:89:6A:EF:7E:DB:8A:A8:AA:E9:33:E7:4F:48:A4:24:5E:EA:44:93:6D:70`

To generate a new keystore with your secure credentials:
```bash
keytool -genkeypair -v -keystore android/release.keystore -alias burgonomics -keyalg RSA -keysize 2048 -validity 10000 -storepass "$RELEASE_STORE_PASSWORD" -keypass "$RELEASE_KEY_PASSWORD" -dname "CN=Burgonomics, OU=Mobile, O=GlassdoorsStudio, L=Ahmedabad, ST=Gujarat, C=IN"
```

### Step 2: Build Signed Release APK
```bash
# 1. Export required signing environment variables (passwords must be provided via environment)
export RELEASE_STORE_FILE="../release.keystore"
export RELEASE_STORE_PASSWORD="<YOUR_ROTATED_KEYSTORE_PASSWORD>"
export RELEASE_KEY_ALIAS="burgonomics"
export RELEASE_KEY_PASSWORD="<YOUR_ROTATED_KEY_PASSWORD>"

# For Windows PowerShell:
# $env:RELEASE_STORE_FILE="../release.keystore"
# $env:RELEASE_STORE_PASSWORD="<YOUR_ROTATED_KEYSTORE_PASSWORD>"
# $env:RELEASE_KEY_ALIAS="burgonomics"
# $env:RELEASE_KEY_PASSWORD="<YOUR_ROTATED_KEY_PASSWORD>"

# 2. Build web assets and sync Capacitor
npm run build:mobile
npx cap sync android

# 3. Assemble Release APK
cd android
./gradlew assembleRelease
```
The output APK is generated at:
`android/app/build/outputs/apk/release/app-release.apk`

### Step 3: Install onto Physical Phone
Connect your phone via USB and run:
```bash
adb install -r app/build/outputs/apk/release/app-release.apk
```
*(Or transfer `app-release.apk` via Google Drive / WhatsApp / direct download and tap to install).*

---

## 2. iOS Device & Simulator Installation (Mac + Xcode)

### Prerequisites
- macOS machine with Xcode 16+
- iPhone connected via USB with Developer Mode enabled (iOS 16+: Settings → Privacy & Security → Developer Mode)
- Apple ID (Free Personal Team or Paid Apple Developer Account)

### Step 1: Sync Assets & Open Xcode Project
```bash
npm run build:mobile
npx cap sync ios
npx cap open ios
```

### Step 2: Configure Signing & Device Target
1. In Xcode, select the **App** project in the navigator.
2. Go to **Signing & Capabilities**.
3. Check **Automatically manage signing** and choose your **Team** (Free Personal Apple ID or Paid Organization).
4. Select your connected **iPhone** in the device destination bar (or select an **iOS Simulator** like iPhone 16 Pro).

### Step 3: Run & Certificate Trust
1. Press `Cmd + R` (or the **Play** button) to compile and install on your device.
2. **Free Apple ID Note**: Free developer certificates are valid for 7 days. On first launch on a physical device, trust the developer certificate:
   **Settings → General → VPN & Device Management → Tap Developer App → Trust**.
3. **APNs Push Note**: Background APNs push notifications require a paid Apple Developer Account. The demo app operates with foreground toast messaging and live order state polling when built with a free Apple ID.

---

## 3. Post-Demo Production Transition (Flip to Live)

When moving from demo sandbox mode to live production with real Petpooja and Razorpay accounts, set the following production environment variables with zero code changes required:

### 1. Razorpay Live Configuration
```bash
# Frontend / Client Runtime (.env.production)
VITE_RAZORPAY_KEY_ID="rzp_live_..."

# Backend Cloud Functions Environment
firebase functions:config:set \
  razorpay.key_id="rzp_live_..." \
  razorpay.key_secret="YOUR_LIVE_RAZORPAY_SECRET" \
  razorpay.webhook_secret="YOUR_LIVE_WEBHOOK_SECRET"
```

### 2. Petpooja POS Live Configuration
```bash
# Backend Cloud Functions Environment
firebase functions:config:set \
  petpooja.env="production" \
  petpooja.app_key="YOUR_LIVE_PETPOOJA_APP_KEY" \
  petpooja.app_secret="YOUR_LIVE_PETPOOJA_APP_SECRET" \
  petpooja.access_token="YOUR_LIVE_PETPOOJA_ACCESS_TOKEN" \
  petpooja.save_order_url="https://api.petpooja.com/V1/save_order"
```

### 3. Deploy Functions & Rules
```bash
npm --prefix functions run build
firebase deploy --only functions,firestore:rules
```

---

## 4. End-to-End Demo Smoke Test Chain

1. **Menu Loading**: `petpooja_products` loads canonical burgers and prices (read-only for clients).
2. **Cart & Pricing**: Customer adds items; `createPaymentOrder` calculates subtotal, 5% GST, and delivery fees server-side and locks amount in `payment_orders/{orderId}`.
3. **Razorpay Checkout**: Test modal appears with `RAZORPAY TEST MODE` banner.
4. **Verification**: `verifyPayment` validates the cryptographic signature and amount integrity, updating `payment_orders` to `PAID` and `orders/{orderId}` to `Paid`.
5. **POS Sandbox Sync**: `pushOrderToPetpooja` triggers, compiles valid V2.1.0 payload with header credentials, outputs `KOT-...`, advances order to `"CONFIRMED"`, and updates live tracking.
6. **Rule Protection**: Any direct attempt by client SDK to write `paymentStatus: "Paid"` is rejected by Firestore security rules.
