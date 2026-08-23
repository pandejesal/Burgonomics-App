# BURGONOMICS — Petpooja POS Integration (Layer 3 Constraint)

> **Reference Specification**: Single source of truth for Petpooja POS API interaction, menu ingestion, order push, status mapping, and webhooks.

---

## 1. 🌐 API Endpoints & Auth
- **Menu Catalog Base**: `https://qle1yy2ydc.execute-api.ap-southeast-1.amazonaws.com/V1`
- **Orders Base (KOT)**: `https://47pfzh5sf2.execute-api.ap-southeast-1.amazonaws.com/V1`
- **Authentication Headers**:
  - `Content_key`: `appKey`
  - `Authorization`: `Bearer {accessToken}`
  - `rest_id`: `restId` (Branch specific)

---

## 2. 🔄 Menu Sync & Transformation Logic
- **Hourly Netlify Job**: `sync-menu.ts` iterates active branches, queries `/menu`, and batch writes categories & items to `/menu/{branchId}/categories` and `/menu/{branchId}/items`.
- **Staleness Tolerance**: Menu is read exclusively from Firestore cache. Max cache staleness is 60 minutes.

---

## 3. 📦 Order Push & Status Mapping
- **Order Types**:
  - `delivery` -> Petpooja Code `1`
  - `takeaway` -> Petpooja Code `2`
  - `dinein` -> Petpooja Code `3`
- **Status Callback Codes**:
  - `1` -> `accepted`
  - `2` -> `preparing`
  - `3` -> `ready`
  - `4` -> `cancelled`

---

## 4. 🛡️ Resilience & Retries
- Exponential backoff with up to 3 retries on network failures.
- If Petpooja order push fails permanently, order remains in `pending` and flags an urgent branch alert.
