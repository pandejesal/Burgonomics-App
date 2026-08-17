# Burgonomics — App Store & Google Play Store Listing Assets & Metadata

This document contains production-ready store listing copy, specifications, privacy questionnaires, and data safety disclosures for submitting the Burgonomics mobile application to the Apple App Store and Google Play Store.

---

## 1. Store Listing Metadata

### Basic Information

- **App Name**: `Burgonomics — Burgers & Dining` (Google Play: 30 chars max, Apple App Store: 30 chars max)
- **Subtitle (iOS)**: `Gourmet Burgers, Fast Delivery` (30 chars max)
- **Short Description (Google Play)**: `Order gourmet burgers, fries, shakes & combos for delivery or dine-in.` (80 chars max)
- **Primary Category**: Food & Drink
- **Secondary Category (iOS)**: Shopping / Lifestyle
- **Content Rating**: Everyone / 4+ (No mature content, no alcohol/gambling)
- **Default Language**: English (India) — `en-IN`

### Promotional & Search Keywords

- **Google Play Tags**: Food Delivery, Restaurant, Gourmet Burgers, Takeaway, Online Ordering, Fast Food
- **Apple App Store Keywords (100 chars max)**: `burgers,food delivery,restaurant,burgonomics,dine-in,fries,shakes,combos,fast food,takeaway,meals`

---

## 2. Full Store Description (Markdown & Plain Text)

```text
Welcome to Burgonomics — India's home for irresistible gourmet burgers, hand-spun shakes, loaded fries, and chef-crafted comfort food.

Whether you're craving a quick lunch, planning a dinner feast with friends, or ordering take-away on your way home, Burgonomics delivers hot, fresh, restaurant-quality food straight to your doorstep or table.

🍔 WHAT MAKES BURGONOMICS SPECIAL?

• Handcrafted Gourmet Burgers: From our signature Classic Burgers to the 5-inch Big Bang Burgers and Sizzling Specialties, every burger is made fresh with premium ingredients.
• Loaded Sides & Sizzlers: Crispy Peri Peri Fries, Cheesy Garlic Bread, Steamed & Fried Momos, and Gourmet Pastas.
• Thick Shakes & Refreshing Coolers: Indulgent Chocolate & Berry Shakes, Fresh Mocktails, and Iced Brews.
• Fast & Reliable Delivery: Real-time order tracking from kitchen preparation to doorstep delivery.
• Dine-In & Takeaway Ordering: Skip the queue at the restaurant — order and pay directly from your table.
• Safe & Seamless Payments: Instant UPI, Credit/Debit Cards, Net Banking, and Pay at Counter/Cash options powered by RBI-authorized secure gateways.
• Exclusive Offers & Combos: Save more on every meal with daily combo deals and promotional discounts.

📱 APP FEATURES:

1. Dynamic Menu & Customization: Customize your burgers with extra cheese, custom sauces, and meal upgrades.
2. Live Kitchen Tracking: Watch your order status progress in real time (Confirmed → Preparing → Out for Delivery).
3. Saved Addresses & Quick Reorder: Save your home, office, and favorite locations for one-tap checkout.
4. Instant OTP Sign-In: Quick, passwordless mobile verification.
5. Strict Privacy & Security: Your data is protected in full compliance with the Digital Personal Data Protection (DPDP) Act.

Craving a real burger? Download Burgonomics today and taste the difference!

Support & Inquiries: support@burgonomics.com
Website: https://burgonomics.com
```

---

## 3. Visual Assets Specifications

### Google Play Store Specifications

| Asset                          | Dimensions                      | Format                    | Requirements                                                           |
| ------------------------------ | ------------------------------- | ------------------------- | ---------------------------------------------------------------------- |
| **App Icon**                   | 512 x 512 px                    | PNG (32-bit, no alpha)    | High-res logo with rounded square mask applied by Google               |
| **Feature Graphic**            | 1024 x 500 px                   | JPEG / 24-bit PNG         | Bold hero branding banner with burger imagery and logo                 |
| **Phone Screenshots**          | 1080 x 2400 px (or 1080 x 1920) | PNG / JPEG (16:9 or 18:9) | Min 4 screenshots: Home, Menu Customizer, Cart/Checkout, Live Tracking |
| **7-Inch Tablet Screenshots**  | 1200 x 1920 px                  | PNG / JPEG                | Optional / Recommended                                                 |
| **10-Inch Tablet Screenshots** | 1600 x 2560 px                  | PNG / JPEG                | Optional / Recommended                                                 |

### Apple App Store Specifications

| Device Category              | Display Size                   | Dimensions     | Format                        |
| ---------------------------- | ------------------------------ | -------------- | ----------------------------- |
| **iPhone 6.7" Display**      | iPhone 15 Pro Max / 16 Pro Max | 1290 x 2796 px | PNG / Flat JPEG (No alpha)    |
| **iPhone 6.5" Display**      | iPhone 11 Pro Max / XS Max     | 1242 x 2688 px | PNG / Flat JPEG               |
| **iPhone 5.5" Display**      | iPhone 8 Plus                  | 1242 x 2208 px | PNG / Flat JPEG               |
| **iPad Pro (6th Gen) 12.9"** | iPad Pro 12.9"                 | 2048 x 2732 px | PNG / Flat JPEG               |
| **App Store Icon**           | Universal                      | 1024 x 1024 px | PNG (No alpha / transparency) |

---

## 4. Google Play Data Safety Questionnaire Draft

### 1. Data Collection & Purpose

| Data Type                     | Collected?         | Shared with 3rd Parties? | Required / Optional      | Purpose                                                        |
| ----------------------------- | ------------------ | ------------------------ | ------------------------ | -------------------------------------------------------------- |
| **Name**                      | Yes                | No                       | Required                 | Order fulfillment & customer support                           |
| **Phone Number**              | Yes                | No                       | Required                 | Account sign-in (OTP) & delivery SMS alerts                    |
| **Physical Address**          | Yes                | No                       | Optional (Delivery only) | Food delivery routing                                          |
| **Purchase History**          | Yes                | No                       | Required                 | Order history, receipts & refunds                              |
| **Payment Info**              | Handled by Gateway | Shared with Razorpay     | Required for online pay  | Payment processing (PCI-DSS compliant)                         |
| **Precise / Approx Location** | Yes                | No                       | Optional                 | Finding nearby restaurant branches & delivery address autofill |
| **Device / Push Token**       | Yes                | No                       | Required                 | Transactional order status notifications                       |

### 2. Security Practices

- **Data Encrypted in Transit**: Yes (HTTPS / TLS 1.3 for all client-to-server communications).
- **Data Deletion Mechanism**: Yes — users can delete their account and associated data directly within the app (**Profile → Settings → Delete Account**) or by emailing `privacy@burgonomics.com`.
- **Target Audience**: General public (Ages 13+).

---

## 5. Apple App Store Privacy Details (App Privacy Labels)

### "Data Used to Track You"

- **None** — Burgonomics does not track users across apps and websites owned by other companies for advertising.

### "Data Linked to You"

- **Contact Info**: Phone Number, Name, Physical Address.
- **Financial Info**: Payment Information (Razorpay transaction token ID; no raw card/banking numbers stored).
- **Purchases**: Purchase History.
- **Identifiers**: User ID (Firebase UID), Device ID (Push Notification Token).
- **Location**: Coarse / Precise Location (for delivery address detection).

### "Data Not Linked to You"

- **Diagnostics**: Crash logs and performance diagnostics.

---

## 6. In-App Purchase (IAP) Exemption Verdict

> [!NOTE]
> **IAP Exemption Ruling**:
>
> - Under **Apple App Store Review Guideline 3.1.3(e)** (_"Goods and Services Outside of the App"_) and **Google Play Payments Policy** (_"Physical goods or services"_), applications that sell physical goods or services consumed in the physical world (such as restaurant food, grocery items, physical delivery) **MUST NOT** use In-App Purchase / Google Play In-App Billing.
> - Burgonomics processes transactions for physical restaurant meals, delivery, and takeaway.
> - Third-party payment gateways (Razorpay, UPI, Cash on Delivery) are fully permitted and required by platform guidelines. Digital IAP entitlements do not apply.
