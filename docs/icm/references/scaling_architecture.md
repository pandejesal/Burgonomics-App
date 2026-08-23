# BURGONOMICS — Scaling & Multi-Branch Architecture (Layer 3 Constraint)

> **Reference Specification**: Dynamic branch provisioning, multi-city franchising, and zero-downtime scaling without client app redeployment.

---

## 1. 🏢 Dynamic Branch Provisioning
- **Zero App Updates**: Adding a new franchise branch requires creating a document in Firestore `/branches/{newBranchId}` with its `petpoojaCredentials` and geocoordinates.
- **Client Geo-Resolution**: Customer app automatically calculates Haversine distance to nearest active branch and serves local menu & delivery radius.

---

## 2. 🏙️ Multi-City Partitioning
- **Regional Sharding**: Regional managers are assigned array of `cityIds` (e.g. `['ahmedabad', 'surat', 'vadodara']`).
- **Composite Indexing**: Queries on orders and tickets partition by `branchId + status + createdAt` ensuring O(1) query performance as order volume scales.
