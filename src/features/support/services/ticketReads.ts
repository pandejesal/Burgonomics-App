/**
 * Customer ticket reads.
 *
 * There is NO HTTP route for a customer's ticket list: backend
 * functions/src/index.ts registers 52 routes and none of them reads tickets
 * (`/tickets/create`, `/tickets/message`, `/tickets/resolve`, `/tickets/escalate`,
 * `/tickets/resolveNote` are all writes). The old `GET /v1/support/tickets` call
 * in supportService hit no handler at all.
 *
 * Tickets are therefore read the way the security model already intends: the
 * owner reads their own docs straight from Firestore. backend/firestore.rules
 * (support_tickets match block) allows
 *   read: isBrandOwner() || (isBranchOwner() && ownsBranch(...))
 *         || (isAuthenticated() && resource.data.customerId == request.auth.uid)
 * so a signed-in customer may read only rows carrying their own uid, and the
 * composite index {customerId ASC, createdAt DESC} is already declared in
 * firestore.indexes.json.
 *
 * This is a READ of server-written documents — it never writes, and it does not
 * invent a parallel ticket contract: the field names below are exactly the ones
 * tickets.service.ts stores (createTicket, lines 364-387).
 */
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "@/core/config/firebase";
import { fail, ok, type ApiResult } from "@/core/network/http";

/** Max rows returned to the app; the UI shows the newest tickets. */
const MAX_TICKETS = 50;

/** A ticket row as the customer UI needs it (see useCustomerTickets). */
export interface TicketReadRow {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "ESCALATED";
  category: string;
  priority: "normal" | "urgent";
  orderId?: string;
  branchId?: string;
  attachments: string[];
  managerResponse?: string;
  /** ISO string — always normalised so the UI never formats a raw Timestamp. */
  createdAt: string;
  resolvedAt?: string;
}

function toIso(value: unknown): string | null {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  // Firestore Timestamp (Admin SDK writes a serverTimestamp; the client SDK
  // surfaces it with toDate()).
  if (value && typeof value === "object" && "toDate" in value) {
    try {
      const d = (value as { toDate: () => Date }).toDate();
      if (d instanceof Date && Number.isFinite(d.getTime())) return d.toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeStatus(raw: unknown): TicketReadRow["status"] {
  const s = typeof raw === "string" ? raw.toLowerCase() : "open";
  if (s === "resolved" || s === "closed" || s === "done") return "RESOLVED";
  if (s === "in_progress" || s === "in-progress" || s === "progress") return "IN_PROGRESS";
  if (s === "escalated") return "ESCALATED";
  return "OPEN";
}

/** Trusted evidence URLs only — same host allowlist as the partner viewer. */
function attachmentUrls(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  return list.filter(
    (u): u is string =>
      typeof u === "string" && /^https:\/\/[a-z0-9.-]*firebasestorage\.googleapis\.com\//i.test(u),
  );
}

/** Maps one stored support_tickets document to a UI row. */
export function mapTicketDoc(id: string, data: Record<string, unknown>): TicketReadRow | null {
  // A stored ticket always has an id; anything else is not a ticket row.
  const ticketId = typeof data.id === "string" && data.id ? data.id : id;
  if (!ticketId) return null;

  const description =
    typeof data.description === "string"
      ? data.description
      : typeof data.message === "string"
        ? data.message
        : "";
  const subject =
    typeof data.subject === "string"
      ? data.subject
      : typeof data.title === "string"
        ? data.title
        : description.slice(0, 70);

  return {
    id: ticketId,
    ticketNumber:
      typeof data.ticketNumber === "string" && data.ticketNumber
        ? data.ticketNumber
        : ticketId.toUpperCase(),
    subject,
    description,
    status: normalizeStatus(data.status),
    category: typeof data.category === "string" ? data.category : "general_inquiry",
    priority: data.priority === "urgent" || data.priority === "high" ? "urgent" : "normal",
    orderId: typeof data.orderId === "string" ? data.orderId : undefined,
    branchId: typeof data.branchId === "string" ? data.branchId : undefined,
    attachments: attachmentUrls(data.attachments),
    managerResponse: resolutionText(data.resolution),
    createdAt: toIso(data.createdAt) ?? new Date(0).toISOString(),
    resolvedAt:
      toIso(data.resolvedAt ?? data.closedAt) ?? resolutionResolvedAt(data.resolution),
  };
}

/**
 * `resolution` is stored in TWO shapes depending on which staff route closed
 * the ticket (backend modules/tickets/tickets.service.ts):
 *  - resolveTicket(): an OBJECT { action, amount, couponCode, notes,
 *    refundResult, resolvedBy, resolvedByName, resolvedAt } (line 828-837)
 *  - resolveNote():   a plain STRING note
 * Reading only the string form meant a customer never saw why a refunded ticket
 * closed. Returns the human-readable reason, or undefined when there is none.
 */
export function resolutionText(raw: unknown): string | undefined {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed ? trimmed : undefined;
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const notes = (raw as { notes?: unknown }).notes;
    if (typeof notes === "string" && notes.trim()) return notes.trim();
    // Fall back to a coupon/action description rather than surfacing an object
    // as "[object Object]" — but never invent a reason that was not recorded.
    const coupon = (raw as { couponCode?: unknown }).couponCode;
    if (typeof coupon === "string" && coupon.trim()) return `Coupon issued: ${coupon.trim()}`;
  }
  return undefined;
}

/** `resolvedAt` may live on the document or inside the resolution object. */
function resolutionResolvedAt(raw: unknown): string | undefined {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return toIso((raw as { resolvedAt?: unknown }).resolvedAt) ?? undefined;
  }
  return undefined;
}

/**
 * Reads the signed-in customer's own tickets, newest first.
 *
 * Fails closed: a read error is a FAILURE (retryable), never an empty list —
 * an empty list would tell the customer they have no tickets when the load
 * actually failed.
 */
export async function fetchMyTickets(uid: string): Promise<ApiResult<TicketReadRow[]>> {
  if (!uid || typeof uid !== "string") {
    // No uid means no scoped query is possible. Refuse rather than read the
    // whole collection.
    return fail("TICKETS_LOAD_FAILED", "Sign in to see your support tickets.", false);
  }

  try {
    const q = query(
      collection(db, "support_tickets"),
      where("customerId", "==", uid),
      orderBy("createdAt", "desc"),
      limit(MAX_TICKETS),
    );
    const snap = await getDocs(q);

    const rows: TicketReadRow[] = [];
    for (const doc of snap.docs) {
      const data = (doc.data?.() ?? {}) as Record<string, unknown>;
      // Defence in depth: never render a row that is not ours even if the
      // backend or rules regress.
      if (typeof data.customerId === "string" && data.customerId && data.customerId !== uid) {
        continue;
      }
      const row = mapTicketDoc(doc.id, data);
      if (row) rows.push(row);
    }
    return ok(rows);
  } catch (err) {
    if (import.meta.env?.DEV) {
      console.warn("[support] ticket read failed", err);
    }
    return fail("TICKETS_LOAD_FAILED", "Could not load your tickets. Please try again.", true);
  }
}
