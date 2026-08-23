# Stage 07: Hierarchical Support Ticketing System

> **Layer 2 Stage Contract**: Unified support ticketing for customer disputes and branch operations, photo attachment review, resolution workflows, and 24h SLA timer trackers.
> **Locked Grill Directives (Q5, Q9)**: Unified single `tickets` collection (`Ticket.raisedBy: 'customer' | 'branch_owner'`), first-assign ownership (no auto-split), 24h SLA badge. (Note: 1:1 direct messaging is hosted separately in Stage 12).

---

## 1. ## Inputs
- **Layer 3 (Reference)**: `../../references/ticketing.md`
- **Layer 3 (Reference)**: `../../references/rbac.md`
- **Layer 3 (Reference)**: `../../_config/design_system.md`
- **Layer 4 (Working)**: `../06_customers/output/stage_summary.md`

---

## 2. ## Process
1. Build Unified Support Ticketing queue in Partner App with status filters (`open`, `in_progress`, `resolved`, `closed`).
2. Implement **First-Assign Resolution Model** (Q9): Tickets are picked up by branch operator or brand owner without automated round-robin splitting.
3. Display prominent **24h SLA Badge** with live visual timer countdown on each ticket card.
4. Add Ticket Detail modal with customer photo attachments, linked order context, and resolution note field.
5. Provide escalation trigger allowing branch operator to reassign complex disputes to Brand Owner.

---

## 3. ## Outputs
- `burgonomics-partner/src/pages/Tickets.tsx`
- `burgonomics-partner/src/components/tickets/TicketCard.tsx`
- `burgonomics-partner/src/components/tickets/TicketDetailModal.tsx`
- `burgonomics-partner/src/components/tickets/SLATimer.tsx`
- `output/stage_summary.md` -> Stage verification summary

---

## 4. ## Verify
```bash
cd burgonomics-partner && npx tsc --noEmit && vite build
```
- Assert that tickets use the single unified `tickets` collection.
- Confirm SLA timers correctly compute against `createdAt` timestamps.
