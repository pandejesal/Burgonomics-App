# Stage 12: Settings, FCM Notifications & Direct Messaging (DMs)

> **Layer 2 Stage Contract**: System settings, FCM notification triggers, background service worker, and 1:1 Branch Operator ↔ Brand Owner Direct Messaging inbox.
> **Locked Grill Directives (Q3, Q4, Q7, Q8)**: Pair-scoped 1:1 DMs (`branchId_Yash`, `branchId_Nehh`), `onSnapshot` real-time messages + FCM `chat_{pairId}` background push, optional orderId/ticketId chips, zero typing/presence overhead.

---

## 1. ## Inputs
- **Layer 3 (Reference)**: `../../references/firestore_schema.md` (`chats/{pairId}/messages`)
- **Layer 3 (Reference)**: `../../references/rbac.md` (`isChatParticipant`)
- **Layer 3 (Reference)**: `../../references/push_notifications.md` (`chat_{pairId}` topic, sw.js, notify.ts)
- **Layer 3 (Reference)**: `../../_config/design_system.md`
- **Layer 4 (Working)**: `../11_users/output/stage_summary.md`

---

## 2. ## Process
1. **Direct Messaging (1:1 DMs) System**:
   - Host 1:1 communication between Branch Operators and Brand Owners (Yash and Nehh).
   - Maximum 2 chat rooms per branch (`${branchId}_Yash` and `${branchId}_Nehh`).
   - Listen to `chats/{pairId}/messages` via Firestore `onSnapshot`.
   - Dispatch background FCM push to `chat_{pairId}` topic on message send via `notify.ts`.
   - Support optional reference chips for linking specific `orderId` or `ticketId`.
   - **Lean Invariant**: Zero typing indicators, zero presence tracking, zero read receipts (prevents Firestore write amplification).
2. **Settings & Preferences**:
   - Theme toggle (Dark Mode / Light Mode with 60-30-10 palette).
   - Audible alert toggle for incoming orders.
   - FCM notification permissions toggle & service worker registration (`firebase-messaging-sw.js`).

---

## 3. ## Outputs
- `burgonomics-partner/src/pages/Settings.tsx`
- `burgonomics-partner/src/services/chatsService.ts`
- `burgonomics-partner/src/components/chat/ChatInbox.tsx`
- `burgonomics-partner/src/components/chat/ChatThread.tsx`
- `burgonomics-partner/src/components/settings/NotificationSettings.tsx`
- `burgonomics-partner/src/components/settings/ThemeToggle.tsx`
- `output/stage_summary.md` -> Stage verification summary

---

## 4. ## Verify
```bash
cd burgonomics-partner && npx tsc --noEmit && vite build
```
- Verify chat queries restrict access strictly to participants of `pairId`.
- Assert no external WebSocket/presence dependencies are introduced.
