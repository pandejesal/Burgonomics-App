/**
 * SupportService — live-backend implementation of the REAL routes.
 *
 * ROUTE AUDIT (backend functions/src/index.ts registers 52 routes):
 *   LIVE  POST /tickets/create    (requireAuth, createTicketSchema) index.ts:1105
 *         → submitTicketToLiveBackend below. Response is the stored
 *           support_tickets document (tickets.service.ts createTicket 364-392).
 *   LIVE  reads of support_tickets for the owner → Firestore, not HTTP
 *         (services/ticketReads.ts); no GET ticket route exists.
 *   DEAD  GET  /v1/support/faqs | channels | issue-categories
 *   DEAD  POST /v1/support/tickets
 *   DEAD  POST /v1/support/feedback
 *         None of the /v1/support/* paths exist. They used to 404 into an
 *         empty list or a locally fabricated success; each now fails honestly.
 *
 * Honesty contract (H-R4/H-R6/H-R7, M12/M13):
 * - No mock FAQs, channels, or categories, and no fake "empty" success either:
 *   a missing route is a reported failure the UI renders with Retry.
 * - SLA/response-time copy is NEVER invented here. Ticket responses may
 *   carry a backend SLA field (`slaMinutes`); callers gate all SLA wording
 *   on its presence.
 * - Photo evidence is uploaded to Firebase Storage (storage-backed URLs).
 *   Base64 data-URLs are never produced or persisted by this module.
 */
import { fail, ok, type ApiResult } from "@/core/network/http";
import { auth } from "@/core/config/firebase";
import { fetchMyTickets, type TicketReadRow } from "@/features/support/services/ticketReads";
import type {
  BackendTicket,
  FaqItem,
  FeedbackInput,
  FeedbackRecord,
  IssueCategory,
  SupportChannel,
  SupportTicket,
  SupportTicketInput,
} from "@/features/support/models";

/** Raw ticket shape returned by POST/GET /v1/support/tickets (B5-S1 contract). */
export interface BackendTicketResponse {
  ticket?: BackendTicket;
  id?: string;
  ticketNumber?: string;
  ticket_number?: string;
  status?: string;
  createdAt?: string | number;
  created_at?: string | number;
  slaMinutes?: number;
  sla_minutes?: number;
  responseSlaMinutes?: number;
}

/** Backend SLA in minutes, or null when the backend did not provide one. */
export function extractSlaMinutes(raw: BackendTicketResponse | null | undefined): number | null {
  if (!raw) return null;
  const nested = raw.ticket;
  const candidates = [
    raw.slaMinutes,
    raw.sla_minutes,
    raw.responseSlaMinutes,
    nested?.slaMinutes,
    nested?.sla_minutes,
  ];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c) && c > 0) return c;
  }
  return null;
}

function normalizeTicketId(raw: BackendTicketResponse, fallback: string): string {
  const nested = raw.ticket;
  const id =
    nested?.id ??
    (typeof raw.id === "string" ? raw.id : undefined) ??
    (typeof nested?.id === "string" ? nested.id : undefined);
  return id || fallback;
}

function normalizeTicketNumber(raw: BackendTicketResponse, fallback: string): string {
  const nested = raw.ticket;
  return (
    nested?.ticketNumber ??
    raw.ticketNumber ??
    raw.ticket_number ??
    nested?.ticket_number ??
    fallback
  );
}

function normalizeStatus(raw: BackendTicketResponse): SupportTicket["status"] {
  const nested = raw.ticket;
  const s = (nested?.status ?? raw.status ?? "open").toLowerCase();
  if (s === "in_progress" || s === "in-progress" || s === "progress") return "in_progress";
  if (s === "resolved" || s === "closed" || s === "done") return "resolved";
  return "open";
}

function normalizeCreatedAt(raw: BackendTicketResponse): number {
  const nested = raw.ticket;
  const v = nested?.createdAt ?? raw.createdAt ?? raw.created_at;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    if (Number.isFinite(t)) return t;
  }
  return Date.now();
}

function isChannel(v: unknown): v is SupportChannel {
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  return typeof c.id === "string" && typeof c.label === "string" && typeof c.kind === "string";
}

function isFaq(v: unknown): v is FaqItem {
  if (!v || typeof v !== "object") return false;
  const f = v as Record<string, unknown>;
  return typeof f.id === "string" && typeof f.question === "string" && typeof f.answer === "string";
}

function isIssueCategory(v: unknown): v is IssueCategory {
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  return typeof c.id === "string" && typeof c.label === "string";
}

/** Best-effort Firebase ID token for authenticated support calls. */
async function authHeaders(): Promise<Record<string, string>> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) return { Authorization: `Bearer ${token}` };
  } catch {
    // Offline / token fetch failed — server decides as unauthenticated.
  }
  return {};
}

/**
 * Base URL of the live Cloud Functions backend (same resolution as the
 * Petpooja gateway — env override, then the canonical project URL).
 */
function liveFunctionsBase(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  if (env.VITE_FUNCTIONS_API_URL) return env.VITE_FUNCTIONS_API_URL.replace(/\/$/, "");
  const projectId = env.VITE_FIREBASE_PROJECT_ID || "burgonomics-7faa8";
  return `https://asia-south1-${projectId}.cloudfunctions.net/api`;
}

/**
 * Auth + App Check headers for a live Cloud Functions call. Single-sourced so
 * every route (tickets, feedback) attests identically — an un-attested route
 * would fail the moment App Check is enforced.
 */
async function liveCallHeaders(): Promise<Record<string, string>> {
  const headers = await authHeaders();
  try {
    const { getAppCheckToken } = await import("@/core/config/firebase");
    const appCheckToken = await getAppCheckToken();
    if (appCheckToken) headers["X-Firebase-AppCheck"] = appCheckToken;
  } catch {
    // Attestation unavailable — server runs monitor mode until enforced.
  }
  return headers;
}

/** Input shape for the LIVE POST /tickets/create route (server schema). */
export interface LiveTicketSubmitInput {
  customerName: string;
  customerPhone?: string;
  orderId?: string;
  branchId: string;
  category:
    | "wrong_item"
    | "late_delivery"
    | "food_quality"
    | "payment_issue"
    | "app_bug"
    | "general_inquiry";
  priority?: "low" | "medium" | "high" | "urgent";
  subject: string;
  description: string;
  attachments?: string[];
}

export const supportService = {
  /**
   * ROUTE AUDIT: no HTTP route lists a customer's tickets either.
   *
   * `GET /v1/support/tickets` never existed; this used to swallow the 404 and
   * return `ok([])`, which is exactly the false empty state that hid a
   * customer's own tickets from them. The list is now read from Firestore as
   * the signed-in customer (see services/ticketReads.ts and the security model
   * in backend/firestore.rules), which is where tickets actually live.
   *
   * Kept as a thin delegation so existing callers keep working; it never
   * returns an empty success on failure.
   */
  async listTickets(): Promise<ApiResult<TicketReadRow[]>> {
    const uid = auth.currentUser?.uid ?? "";
    return fetchMyTickets(uid);
  },

  /**
   * REMOVED: submitTicket targeted `POST /v1/support/tickets`, which never
   * existed. The only real creation route is `POST /tickets/create`
   * (functions/src/index.ts), spoken by submitTicketToLiveBackend below, whose
   * schema requires branchId/description and takes evidence under
   * `attachments`. Nothing called this method, so it is deleted rather than
   * left as a trap that silently drops photos.
   */

  /**
   * Upload photo evidence to Firebase Storage and return download URLs.
   * Never resolves to base64 data-URLs. Fails closed when Storage is
   * unavailable so the ticket POST carries `photoUrls: []` honestly.
   */
  async uploadEvidence(files: File[], ticketRef: string): Promise<ApiResult<string[]>> {
    if (files.length === 0) return ok([]);
    try {
      const { getStorage, ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
      const uid = auth.currentUser?.uid ?? "anonymous";
      const safeRef = ticketRef.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "pending";
      const storage = getStorage();
      const urls: string[] = [];
      for (const file of files.slice(0, 3)) {
        const name = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64) || "photo.jpg";
        const path = `support-evidence/${uid}/${safeRef}/${Date.now()}_${name}`;
        const snap = await uploadBytes(ref(storage, path), file, {
          contentType: file.type || "image/jpeg",
        });
        urls.push(await getDownloadURL(snap.ref));
      }
      return ok(urls);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Photo upload failed. Please try again.";
      return fail("EVIDENCE_UPLOAD_FAILED", message, true);
    }
  },

  /**
   * ROUTE: POST /support/feedback (functions/src/index.ts) — LIVE.
   *
   * POST /v1/support/feedback never existed, and the old code fabricated an id
   * and createdAt locally so the customer saw a success that recorded nothing.
   * This posts the real contract (supportFeedbackSchema: rating 1..5 int,
   * optional comment <= 2000, optional orderId <= 128) with the same base URL
   * and auth/App Check header approach as submitTicketToLiveBackend, and only
   * reports success on a real 2xx.
   */
  async submitFeedback(input: FeedbackInput): Promise<ApiResult<FeedbackRecord>> {
    if (!Number.isFinite(input.rating) || input.rating < 1 || input.rating > 5) {
      return fail("INVALID_RATING", "Please select a rating between 1 and 5.");
    }
    try {
      const headers = await liveCallHeaders();
      const res = await fetch(`${liveFunctionsBase()}/support/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          // The server requires an integer 1..5; a fractional score would be a
          // 400, so round the star rating the UI produced.
          rating: Math.round(input.rating),
          comment: input.comment?.trim() || undefined,
          orderId: input.orderId,
          // A suggestion is folded into the comment the server stores; the
          // route has no separate field, and dropping it silently would lose
          // what the customer typed.
          ...(input.suggestion?.trim()
            ? {
                comment: [input.comment?.trim(), input.suggestion.trim()]
                  .filter(Boolean)
                  .join("\n\n"),
              }
            : {}),
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return fail(
          "FEEDBACK_SUBMIT_FAILED",
          `Feedback was not recorded (HTTP ${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`,
          res.status >= 500,
        );
      }
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      if (typeof data.id !== "string" || !data.id) {
        // A 2xx without an id means the server did not confirm a record; do not
        // claim the feedback was saved.
        return fail("FEEDBACK_SUBMIT_FAILED", "Feedback service returned no confirmation.", true);
      }
      return ok({
        id: data.id,
        createdAt: Date.now(),
        rating: Math.round(input.rating),
        comment: input.comment,
        suggestion: input.suggestion,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not send feedback. Please try again.";
      return fail("FEEDBACK_SUBMIT_FAILED", message, true);
    }
  },

  /**
   * LIVE ticket creation against POST /tickets/create (Cloud Functions).
   * This is the real backend — the legacy submitTicket above targets the
   * never-landed /v1/support/* contract. Field contract mirrors
   * createTicketSchema server-side; failures are honest (no local ticket
   * fabrication — the caller keeps its own draft UX).
   */
  async submitTicketToLiveBackend(
    input: LiveTicketSubmitInput,
  ): Promise<
    ApiResult<{ id: string; ticketNumber?: string; status?: string; createdAt?: string | number }>
  > {
    try {
      const headers = await liveCallHeaders();
      const res = await fetch(`${liveFunctionsBase()}/tickets/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          orderId: input.orderId,
          branchId: input.branchId,
          category: input.category,
          priority: input.priority,
          subject: input.subject,
          description: input.description,
          attachments: input.attachments ?? [],
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return fail(
          "TICKET_SUBMIT_FAILED",
          `Ticket service refused the request (HTTP ${res.status}): ${text}`,
        );
      }
      const data = (await res.json()) as {
        id?: string;
        ticketNumber?: string;
        status?: string;
        createdAt?: string | number;
      };
      if (typeof data.id !== "string" || !data.id) {
        return fail("TICKET_SUBMIT_FAILED", "Ticket service returned no ticket id.");
      }
      return ok({
        id: data.id,
        ticketNumber: data.ticketNumber,
        status: data.status,
        createdAt: data.createdAt,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not reach support. Please try again.";
      return fail("TICKET_SUBMIT_FAILED", message, true);
    }
  },
};
