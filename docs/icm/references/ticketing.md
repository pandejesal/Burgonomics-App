# BURGONOMICS — Hierarchical Ticketing System (Layer 3 Constraint)

> **Reference Specification**: Customer -> Branch Operator -> Brand Owner dispute escalation, SLA parameters, and automated breach notifications.

---

## 1. 🎫 Ticket Classifications
- **Customer Issues**: `wrong_item`, `late_delivery`, `quality`, `payment`, `other`
- **Franchise / Branch Operations**: `maintenance`, `supply`, `equipment`, `other`

---

## 2. 🪜 Escalation Tree

```
1. Customer initiates ticket in Customer App (attached to Order ID + Photos)
   │
   ▼
2. Real-time alert dispatched to Branch Owner in Partner App
   ├── Response SLA: 30-60 mins
   ├── Resolution SLA: 4-24 hrs
   │
   ├─► [Resolved]: Resolution note written, Customer notified, Ticket Closed.
   │
   └─► [SLA Breached / Unresolved]:
       │
       ▼
3. Auto-Escalation to Brand Owner / Regional Manager
       └── High-priority arbitration (Refund issuance, vendor escalations)
```

---

## 3. ⏱️ SLA Benchmarks

| Type | Target Response | Target Resolution |
|---|---|---|
| `late_delivery` / `payment` | < 30 minutes | < 4 hours |
| `wrong_item` / `quality` | < 1 hour | < 24 hours |
| `maintenance` / `supply` | < 4 hours | < 24-48 hours |
