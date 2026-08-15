# Burgonomics Food Ordering & Restaurant Platform — Commercial Proposal

**Client**: Burgonomics (Glassdoors Studio)
**Deliverables**: Cross-Platform Mobile Applications (Android & iOS), Cloud Backend, Payments & POS Integration, Multi-Store Support (17 outlets)
**Agreement Status**: Baseline Repository Complete (Verified Commit `9c4c2a3`)

---

## 1. Project Scope

| Module | Scope & Key Features Included |
|---|---|
| **1. Mobile Application (Android & iOS)** | • Phone OTP authentication & secure user profile<br>• 13 food categories, 63 vegetarian items with customization add-on groups<br>• Delivery / Takeaway / Dine-In selection with address book<br>• Real-time order tracking & visual kitchen progression<br>• Push notification registration & in-app legal views |
| **2. Backend Services (Cloud Functions)** | • Secure payment order creation & dual-layer verification (Razorpay)<br>• Server-side price calculation preventing cart amount tampering<br>• Petpooja POS bridge (Save-Order dispatch & push webhooks)<br>• Production Firestore database security rules |
| **3. Payments Integration** | • Razorpay checkout (test & live keys)<br>• HMAC signature verification + server-side amount validation<br>• Webhook handling (payment authorized/captured/failed, refunds) |
| **4. Native Mobile Containers** | • Android container with release signing & App Links<br>• iOS container with Swift Package Manager (SPM) architecture, Universal Links & personal signing support |
| **5. Automated CI/CD Pipelines** | • Automated GitHub Actions workflows for Android (APK + AAB), iOS build verification, and backend test suites |
| **6. Store Submission Preparation** | • Google Play Android App Bundle (`.aab`) packaging<br>• Store listing copy, keywords, and screenshot specifications<br>• Google Play Data Safety answers & Apple Privacy Labels<br>• In-App Purchase (IAP) physical goods exemption compliance |
| **7. Security & Compliance Hardening** | • Remediation of 20+ security audit findings<br>• Replay-window timestamp protection on all webhooks<br>• Digital Personal Data Protection (DPDP) Act account deletion flow |
| **8. Web Hosting & Domain Routing** | • Netlify hosting configuration (`netlify.toml`, SPA rewrites)<br>• JSON headers for Android Asset Links & Apple Universal Links<br>• Static Privacy Policy and Terms of Service web pages |
| **9. Multi-Store Support (17 outlets)** | • Multi-outlet data model: per-store categories, products, orders<br>• Store registry & in-app store/location picker<br>• Per-store Petpooja credentials, webhook routing, pricing/availability |

---

## 2. Investment Summary — Founder Tier Pricing

The standard market value of this platform is **₹1,00,000**.

To support the launch and nationwide rollout of Burgonomics, this project is delivered under a **Special Founder Tier Introductory Rate** — extended only to our first reference client:

```
===============================================================================
INVESTMENT SUMMARY
===============================================================================
Standard Market Value:                  ₹1,00,000
Founder Tier Discount Applied:          -₹60,000   (60% Introductory Discount)
-------------------------------------------------------------------------------
TOTAL CONTRACTED INVESTMENT:            ₹40,000 (INR) — ALL-IN
(includes: build + payments + POS bridge + multi-store support for 17 outlets)
===============================================================================
```

The **₹40,000 all-in** figure covers everything in Section 1, including multi-store support for the current 17 outlets. Additional outlets beyond 17 are priced at **₹2,500 per outlet** (config, menu, and rollout).

Included at no extra charge: Phone OTP sign-in via Firebase Auth — free within Google's free tier (10,000 verifications/month); any overage is covered by the existing usage pass-through (no Blaze plan required).

---

## 3. Payment Terms

**Payment is due in full before go-live.**

```
Demo & acceptance  →  Payment of ₹40,000  →  Go-live & key configuration
```

1. **Live demo** of the working application (menu, cart, payments, order flow).
2. **Client acceptance** of the demo.
3. **Full payment** of ₹40,000.
4. **Go-live**: deployment, store submission, and configuration of client-owned keys (Petpooja merchant credentials, Razorpay live keys, push notification certificates).

No advance payment is required to start. The working application is delivered only after acceptance; source code remains with the developer until full settlement.

---

## 4. Post-Launch Maintenance & Support

| Service | Terms |
|---|---|
| **Maintenance Retainer** | **₹6,000 / 6 months** (₹1,000/month, semi-annual billing) |
| **Included work** | Up to **2 hours of engineering per month** (bug fixes, security patches, dependency updates, uptime monitoring) |
| **SLA** | 48-hr response for non-critical issues; critical issues (app down / payment failure) acknowledged within 12 hrs with best-effort same-day fix (no 24/7 commitment) |
| **Overflow** | Additional hours beyond 2/mo billed at ₹750/hr |

---

## 5. Future Add-On Services (Rate Card)

Should additional features or external operational services be requested, they will be billed according to the fixed rate card below:

| # | Add-On Service | Scope & Deliverables | Price (INR) | Fee Responsibility |
|---|---|---|---|---|
| **1** | **Live Petpooja Merchant Onboarding** | Transition from sandbox to live store merchant keys, physical POS terminal mapping, and live KOT print testing. | **₹8,000** | Dev fee to engineer; Petpooja API subscription paid directly by client. |
| **2** | **Apple App Store Submission & Review** | Apple Developer enrollment guidance, TestFlight build rollout, App Store listing submission, and review fix cycle. | **₹10,000** | Dev fee to engineer; $99/yr Apple fee paid directly by client. |
| **3** | **Google Play Store Submission & Review** | Play Console listing creation, AAB upload, Data Safety questionnaire filing, and Google review management. | **₹6,000** | Dev fee to engineer; $25 Google fee paid directly by client. |
| **4** | **Production Push Notification Pipeline** | Apple APNs `.p8` certificate setup, Firebase production push configuration, and automated campaign alerts. | **₹6,000** | Dev fee to engineer. |
| **5** | **Live Kitchen Display System (KDS)** | Dedicated web/tablet interface for kitchen display with live sound alerts, ticket bumping, and prep timers. | **₹20,000** | Dev fee to engineer. |
| **6** | **Additional Outlets (beyond 17)** | Per-outlet configuration: store registry, menu mapping, Petpooja credentials, rollout. | **₹2,500 / outlet** | Dev fee; per-outlet Petpooja API subscriptions paid directly by client. |
| **7** | **Advanced Marketing & Coupon Engine** | Dynamic coupon code engine (percentage/flat off), minimum order rules, customer loyalty points, and CRM. | **₹16,000** | Dev fee to engineer. |
| **8** | **Custom Feature Additions** | Any new integration (e.g. Dunzo/Shadowfax 3rd-party delivery logistics, WhatsApp order updates). | **₹750 / hr** | Quoted per feature. |

---

## 6. Exclusions & Notes

1. **Third-Party Account & Store Registration Fees**:
   - Apple Developer Program fee ($99 USD/year) is paid directly by the client to Apple Inc.
   - Google Play Console registration fee ($25 USD one-time) is paid directly by the client to Google LLC.
2. **Cloud Infrastructure Quotas**:
   - Google Cloud & Firebase Spark plan (covered under Google's and Netlify's free tiers; no Firebase Blaze plan required).
   - Phone OTP verifications beyond Google's free tier (10,000 verifications/month included free via Firebase Auth).
3. **Marketing & Media Assets**:
   - Photography, graphic design for promotional social banners, and digital advertising campaigns.
4. **Third-Party & Usage Cost Pass-Through**:
   - All third-party fees and usage costs are billed to the client at cost: Apple Developer Program ($99/yr), Google Play Console ($25 one-time), usage beyond Google's and Netlify's free tiers, billed at cost (no Blaze plan required), and Netlify/domain renewals.
5. **Petpooja API Subscription**:
   - Per-store Petpooja API subscription fees are paid directly by the client.
