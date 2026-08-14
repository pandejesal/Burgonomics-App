# Burgonomics Mobile & Backend Platform — Engineering Effort & Price Breakdown

**Project**: Burgonomics Food Ordering & Restaurant Integration Platform  
**Target Platforms**: Android (Capacitor), iOS (Capacitor), Web / PWA, NestJS API, Firebase Cloud Infrastructure  
**Baseline Repository State**: Verified Commit `9c4c2a3` (Triple-Green CI, Hardened Security, POS & Payment Integration)  
**Standard Blended Engineering Rate**: ₹750 / hour (Indian Senior Full-Stack & Mobile Engineering)  

---

## 1. Full Scope Inventory & Engineering Effort Breakdown

The inventory below reflects the verified codebase architecture across frontend, native containers, backend microservices, and cloud infrastructure.

```
+-----------------------------------------------------------------------------+
| MODULE / COMPONENT                   | SCOPE SUMMARY        | EFFORT | COST |
+-----------------------------------------------------------------------------+
| 1. Mobile App (React 19 + TanStack)  | Auth, Menu, Cart,    | 52 hrs | ₹39k |
|                                      | Orders, Push, UI/UX  |        |      |
| 2. Backend Engine (NestJS)           | APIs, Auth, Guards,  | 24 hrs | ₹18k |
|                                      | DTOs, CORS, Roles    |        |      |
| 3. Cloud Functions & POS Bridge      | /payments Router,    | 32 hrs | ₹24k |
|                                      | Razorpay & Petpooja  |        |      |
| 4. Native Container Engineering      | Android Gradle +     | 22 hrs | ₹16.5k
|                                      | iOS SwiftPM Patches  |        |      |
| 5. Multi-Platform CI/CD Automation   | 3 GitHub Workflows,  | 14 hrs | ₹10.5k
|                                      | Keystore & SPM CI    |        |      |
| 6. App Store & Play Store Packaging  | AAB, Privacy/Terms,  | 12 hrs | ₹9k  |
|                                      | Listing Assets & IAP |        |      |
| 7. Security Hardening & DPDP Audit   | 20+ Vulnerabilities, | 18 hrs | ₹13.5k
|                                      | Replay Locks, RBAC   |        |      |
| 8. Hosting, App Links & Verification | Netlify, SHA-256,    |  8 hrs | ₹6k  |
|                                      | Endpoints & Catalog  |        |      |
+-----------------------------------------------------------------------------+
| TOTAL ENGINEERING EFFORT             | 182 Hours            | 182 hrs| ₹136.5k
+-----------------------------------------------------------------------------+
```

---

### Detailed Module Scope & Task Breakdown

#### Module 1: Mobile Client Application (React 19 + TanStack Router + TailwindCSS)
- **Authentication & User State (10 hrs)**:
  - Phone OTP authentication via Firebase Auth with passwordless SMS flow.
  - User session persistence, secure storage bridging, profile management.
  - Multi-address book (Home, Office, Other) with default address selection.
  - DPDP Act compliant account deletion request workflow.
- **Menu & Catalog Engine (14 hrs)**:
  - 13 distinct food categories with tabbed horizontal navigation.
  - 63 vegetarian items with high-resolution imagery and veg classification badges.
  - Dynamic customization modal: priced add-on groups (Extra Cheese, Double Patty, Seasoning, Dips) with min/max selection constraints.
  - Real-time catalog search, dietary filter tags, and favorites state store.
- **Cart, Server Price Validation & Checkout (14 hrs)**:
  - Client cart snapshot generation with modifier option pairing.
  - Strict catalog price calculation preventing client-side price tampering.
  - Delivery mode selection (Delivery, Dine-In, Store Takeaway) and store selector.
  - Cart item increment/decrement, notes for kitchen, promo code hook.
- **Order Lifecycle & Real-Time Tracking (10 hrs)**:
  - Visual tracking step progression (Confirmed $\to$ Preparing $\to$ Out for Delivery $\to$ Delivered).
  - Historical order list with itemized receipts and one-tap reordering.
  - Push notification device token registration upon login.
- **Settings, Legal & UX Polish (4 hrs)**:
  - Glassmorphic theme system, smooth page transitions, tactile haptic feedback.
  - Embedded Privacy Policy and Terms of Service views.

*Subtotal Effort*: **52 hours** · *Market Valuation*: **₹39,000**

---

#### Module 2: Enterprise Backend Microservices (NestJS + TypeScript)
- **API Core & Architecture (8 hrs)**:
  - Modular architecture (Auth, Mobile POS, Admin, Orders, Realtime).
  - Class-validator DTOs with strict input sanitization.
- **Security, Auth Guards & CORS (10 hrs)**:
  - Passport JWT authentication guards on mobile endpoints.
  - User ownership verification (ensuring user ID in token matches request).
  - Strict CORS origin allowlist configuration.
- **Automated Testing Suite (6 hrs)**:
  - 25 Jest test suites validating controllers, guards, filters, and interceptors.

*Subtotal Effort*: **24 hours** · *Market Valuation*: **₹18,000**

---

#### Module 3: Firebase Cloud Infrastructure & POS Bridge (Node 20 + Express)
- **Cloud Functions Payments Router (12 hrs)**:
  - Express app mounted on `/payments` handling `/createPaymentOrder`, `/verifyPayment`, and `/razorpayWebhook`.
  - Authoritative catalog lookup computing exact item + addon sums.
  - Dual-layer payment verification: HMAC-SHA256 signature check + server-side Razorpay API amount validation.
- **Petpooja POS Integration Bridge (12 hrs)**:
  - Sandbox & live environment bridging (`petpooja.env`).
  - Menu push webhook handler (`/petpooja-pushMenu`) and store status webhook.
  - Order dispatch handler formatting orders into Petpooja Save-Order JSON.
- **Firestore Schema Hardening & Webhook Security (8 hrs)**:
  - Production `firestore.rules` locking down direct client writes to orders and payment docs.
  - 5-minute replay-window timestamp verification on incoming webhooks.

*Subtotal Effort*: **32 hours** · *Market Valuation*: **₹24,000**

---

#### Module 4: Native Container Engineering (Capacitor 8 + Android + iOS)
- **Android Native Container (8 hrs)**:
  - Gradle multi-module setup with Android SDK 34 / 35.
  - Native release keystore generation and signing configuration.
  - Digital Asset Links (`assetlinks.json`) SHA-256 fingerprint binding.
- **iOS Native Container & SwiftPM Architecture (14 hrs)**:
  - Xcode workspace setup and CocoaPods to Swift Package Manager migration.
  - Custom SwiftPM bridge patch script resolving Capacitor 8 Swift 5 API overloads.
  - Universal Links (`apple-app-site-association`) integration.
  - Free personal Apple ID local signing configuration.

*Subtotal Effort*: **22 hours** · *Market Valuation*: **₹16,500**

---

#### Module 5: Automated CI/CD Pipelines (GitHub Actions)
- **Android Release Pipeline (5 hrs)**:
  - Automated build script producing signed APK and Google Play AAB bundles.
- **iOS Simulator Pipeline (5 hrs)**:
  - Automated macOS Xcode build pipeline with automated SwiftPM patching.
- **Backend Test Automation (4 hrs)**:
  - NestJS test runner executing 25 test suites per commit.

*Subtotal Effort*: **14 hours** · *Market Valuation*: **₹10,500**

---

#### Module 6: App Store & Google Play Store Submission Packaging
- **Production Asset Preparation (6 hrs)**:
  - Android App Bundle (`.aab`) packaging and signing verification.
  - Visual asset dimension specifications for iPhone (6.7", 6.5", 5.5", iPad) and Android.
  - Store listing copy, keywords, promotional short/long descriptions.
- **Compliance & Privacy Label Disclosures (6 hrs)**:
  - Google Play Data Safety questionnaire draft (account, contact, payments).
  - Apple App Privacy label mapping.
  - In-App Purchase (IAP) physical goods exemption legal audit.

*Subtotal Effort*: **12 hours** · *Market Valuation*: **₹9,000**

---

#### Module 7: Security Audit Remediation & Hardening
- **Remediation of 20+ Audit Vulnerabilities (18 hrs)**:
  - Elimination of client-supplied payment amount overrides.
  - Blocking unauthenticated payment order creation and verification.
  - Removal of hardcoded seed admin credentials and Swagger example passwords.
  - Fail-closed webhook security with HMAC validation.
  - DPDP Act compliant privacy controls and data segregation.

*Subtotal Effort*: **18 hours** · *Market Valuation*: **₹13,500**

---

#### Module 8: Web Hosting, Verification & Catalog Tooling
- **Netlify & Edge Routing (4 hrs)**:
  - `netlify.toml` SPA rewrites and `public/_headers` configuration.
  - Static fallback pages for `/privacy` and `/terms`.
- **QA Acceptance Probes & Catalog Seed Script (4 hrs)**:
  - End-to-end endpoint probing scripts and Firestore seed script.

*Subtotal Effort*: **8 hours** · *Market Valuation*: **₹6,000**

---

## 2. Commercial Summary & Founder Discount Analysis

```
================================================================================
COMMERCIAL SUMMARY & DISCOUNT COMPUTATION  (INTERNAL — NOT FOR CLIENT PRINT)
================================================================================
Total Engineering Effort:               182 Hours (internal baseline)
Standard Market Engineering Rate:       ₹750 / hr (internal baseline)
--------------------------------------------------------------------------------
Client-Facing Market Value:             ₹1,00,000  (anchored list price)
Contracted Founder Tier Quote:          ₹40,000  ALL-IN
                                        (build + payments + POS bridge
                                         + multi-store support, 17 outlets)
--------------------------------------------------------------------------------
TOTAL DISCOUNT APPLIED:                 -₹60,000  (60% OFF MARKET VALUE)
Foundation Story: "Introductory founder rate for our first reference client."
Hour-by-hour math (182 hrs / ₹750 / ₹1,36,500) is INTERNAL ONLY — never printed.
================================================================================
```

> [!NOTE]
> **Primary Cost Drivers**:
> 1. **Payments & Security Architecture**: Catalog-authoritative pricing, anti-tamper verification, and audit remediation.
> 2. **Petpooja POS Cloud Bridge**: Bi-directional webhooks and KOT dispatch.
> 3. **Native iOS SwiftPM Engineering**: Swift container patches and Universal Links.
> 4. **Store Packaging & DPDP Compliance**: AAB build, privacy filings, and static legal pages.
>
> **Multi-Store economics (accepted at ₹40k all-in)**: 17 outlets ≈ ₹2,353/outlet. Deemed acceptable because rollout is config-driven automation (~10-15 hrs), not 25-35 hrs of bespoke work. Additional outlets beyond 17 bill at ₹2,500 each — ~10x marginal cost.

---

## 3. Complexity Escalation Clause (Scope Add-Ons)

The contracted rate of **₹40,000** covers the complete repository scope documented above **plus multi-store support for 17 outlets**. Any operational or feature expansion beyond this baseline is priced under the schedule below:

| # | Escalation Trigger | Scope Description | Estimated Effort | Additional Cost | Paid By |
|---|---|---|---|---|---|
| **1** | **Live Petpooja Production Setup** | Transitioning from sandbox to production merchant credentials, store ID mapping, and live KOT testing. | 10–12 hrs | **₹8,000** | Client pays dev fee; Petpooja API subscription direct. |
| **2** | **Apple Developer Account & Submission** | Apple Developer enrollment assistance ($99/yr paid to Apple), TestFlight setup, App Store upload, and review response cycle. | 12–16 hrs | **₹10,000** | Dev fee to engineer; $99 Apple fee paid directly by client. |
| **3** | **Google Play Console Submission** | Play Console registration ($25 one-time paid to Google), Store listing submission, and review cycle. | 8–10 hrs | **₹6,000** | Dev fee to engineer; $25 Google fee paid directly by client. |
| **4** | **Production Push Notifications** | Generating Apple APNs `.p8` keys, FCM production credentials, and live multi-device push verification. | 8–10 hrs | **₹6,000** | Developer fee. |
| **5** | **Live Kitchen Display System (KDS)** | Dedicated web/tablet dashboard for kitchen staff with live sound alerts, ticket bumping, and prep time tracking. | 25–30 hrs | **₹20,000** | Developer fee. |
| **6** | **Additional Outlets (beyond 17)** | Per-outlet configuration: store registry registration, menu mapping, per-store Petpooja credentials and webhook routing, availability/pricing, rollout. First 17 outlets are included in the all-in quote. | 2–4 hrs / outlet | **₹2,500 / outlet** | Dev fee; per-outlet Petpooja API subscriptions paid directly by client. |
| **7** | **Advanced Admin Marketing & CRM** | Dynamic discount coupon engine, customer loyalty points, and automated SMS marketing triggers. | 20–25 hrs | **₹16,000** | Developer fee. |
| **8** | **Post-Launch Maintenance & Support Retainer** | Best-effort bug fixes, security patches, dependency updates, and uptime monitoring.<br>• **SLA**: 48-hr response for non-critical; critical issues (app down / payment failure) acknowledged within 12 hrs and best-effort same-day fix (no 24/7 commitment).<br>• **Limits**: Up to **2 hours** of engineering work/month included; additional hours at standard rate (₹750/hr). | Retainer | **₹6,000 / 6 mo** (₹1,000/mo) | Developer fee (Semi-annual billing). |
| **9** | **New Custom Features / 3rd Party APIs** | Any new feature not in Section 1 (e.g. Dunzo/Shadowfax delivery logistics, WhatsApp bot). | Hourly | **₹750 / hr** (Quoted per feature) | Developer fee. |

---

## 4. Payment Terms — No Advance, Paid Before Go-Live

No advance deposit is required to start work. Payment structure:

```
Live demo → Client acceptance → FULL PAYMENT (₹40,000) → Go-live & key configuration
```

- **₹0** up front; work begins on acceptance of this proposal.
- **Full payment of ₹40,000** due upon demo acceptance, **before** go-live, store submission, and configuration of client-owned keys (Petpooja merchant credentials, Razorpay live keys, push certificates).
- Source code is never shown or transferred pre-settlement; the client receives working applications only.
- Escalation items and the maintenance retainer (₹6,000/6mo) are billed separately on delivery/agreement.
- If the client declines to pay after the demo, the applications are withheld and no code, keys, or configuration are handed over. No partial-delivery exposure beyond time already invested.

---

## 5. Exclusions & Client Responsibilities

1. **Third-Party Developer Account Fees**:
   - Apple Developer Program annual membership ($99/year).
   - Google Play Console one-time registration fee ($25).
2. **Infrastructure & SaaS Subscriptions**:
   - Firebase Blaze usage charges (billed directly by Google Cloud if free tiers of 2M invocations/month are exceeded).
   - SMS gateway credits for phone OTPs (e.g. Twilio, MSG91, Firebase Auth SMS quotas).
   - Petpooja API integration subscription fees.
3. **Marketing & Media Production**:
   - Commercial food photography, video rendering, and advertising campaigns.
4. **Pass-Through Costs & Billing Policy**:
   - All third-party fees and usage costs are billed to the client at cost: Apple Developer Program ($99/yr), Google Play Console ($25 one-time), SMS/OTP credits, Firebase Blaze usage beyond Google's free tier, and Netlify/domain renewals.
5. **Deployment Scope Note**:
   - The all-in baseline covers multi-store deployment for the client's first 17 outlets (store registry, per-store data model, per-store Petpooja credentials, per-store webhook routing). Additional outlets beyond 17 are priced at ₹2,500 each under the escalation clause (see Additional Outlets row).
6. **SMS/OTP Optimization**:
   - Delivered as goodwill within the all-in quote: MSG91/Fast2SMS provider routing with per-phone and per-IP rate limiting, ~65% SMS cost reduction vs default at 17-outlet volume.


