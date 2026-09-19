/**
 * SupportService — live-backend implementation of
 *   GET  /v1/support/faqs
 *   GET  /v1/support/channels
 *   GET  /v1/support/issue-categories
 *   GET  /v1/support/tickets
 *   POST /v1/support/tickets
 *   POST /v1/support/feedback
 *
 * Honesty contract (H-R4/H-R6/H-R7, M12/M13):
 * - No mock FAQs, channels, or categories. List calls hit the backend and
 *   resolve to `ok([])` when the backend is unreachable so the UI renders
 *   its honest empty state instead of fabricated content.
 * - SLA/response-time copy is NEVER invented here. Ticket responses may
 *   carry a backend SLA field (`slaMinutes`); callers gate all SLA wording
 *   on its presence.
 * - Photo evidence is uploaded to Firebase Storage (storage-backed URLs).
 *   Base64 data-URLs are never produced or persisted by this module.
 *
 * Backend contract assumption (Batch-5 S1 owns the ticket/notify API):
 * POST /v1/support/tickets exists and returns the created ticket, which
 * may include a backend SLA field. Shapes are parsed defensively —
 * `{ ticket: {...} }` or the ticket object directly, `slaMinutes` or
 * `sla_minutes` — and if the landed contract differs, adapt here, never
 * invent a parallel one.
 */
import { fail, ok, type ApiResult } from "@/core/network/http";
import { httpClient } from "@/core/network/httpClient";
import { auth } from "@/core/config/firebase";
import { isLiveApiBaseUrl } from "@/core/config/env";
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

function normalizeStatus(
  raw: BackendTicketResponse,
): SupportTicket["status"] {
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

function asArray<T>(data: unknown, key?: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (key && Array.isArray(obj[key])) return obj[key] as T[];
    for (const k of ["items", "data", "results"]) {
      if (Array.isArray(obj[k])) return obj[k] as T[];
    }
  }
  return [];
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

export const supportService = {
  async listFaqs(): Promise<ApiResult<FaqItem[]>> {
    // No live backend (`.example` fixture base URL) — skip the doomed fetch
    // (it only trips CSP violations and console noise) and resolve honest [].
    if (!isLiveApiBaseUrl()) return ok([]);
    try {
      const res = await httpClient.get<unknown>("/v1/support/faqs", {
        headers: await authHeaders(),
      });
      const items = asArray<FaqItem>(res.data, "faqs").filter(isFaq);
      return ok(items);
    } catch (err) {
      // Backend unreachable — honest empty list, never mock FAQs.
      if (import.meta.env?.DEV) {
        console.warn("[support] listFaqs failed, returning []", err);
      }
      return ok([]);
    }
  },

  async listChannels(): Promise<ApiResult<SupportChannel[]>> {
    if (!isLiveApiBaseUrl()) return ok([]);
    try {
      const res = await httpClient.get<unknown>("/v1/support/channels", {
        headers: await authHeaders(),
      });
      const items = asArray<SupportChannel>(res.data, "channels").filter(isChannel);
      return ok(items);
    } catch (err) {
      // Backend unreachable — honest empty list, never fabricated channels.
      if (import.meta.env?.DEV) {
        console.warn("[support] listChannels failed, returning []", err);
      }
      return ok([]);
    }
  },

  async listIssueCategories(): Promise<ApiResult<IssueCategory[]>> {
    if (!isLiveApiBaseUrl()) return ok([]);
    try {
      const res = await httpClient.get<unknown>("/v1/support/issue-categories", {
        headers: await authHeaders(),
      });
      const items = asArray<IssueCategory>(res.data, "categories").filter(isIssueCategory);
      return ok(items);
    } catch (err) {
      if (import.meta.env?.DEV) {
        console.warn("[support] listIssueCategories failed, returning []", err);
      }
      return ok([]);
    }
  },

  async listTickets(): Promise<ApiResult<BackendTicketResponse[]>> {
    if (!isLiveApiBaseUrl()) return ok([]);
    try {
      const res = await httpClient.get<unknown>("/v1/support/tickets", {
        headers: await authHeaders(),
      });
      return ok(asArray<BackendTicketResponse>(res.data, "tickets"));
    } catch (err) {
      if (import.meta.env?.DEV) {
        console.warn("[support] listTickets failed, returning []", err);
      }
      return ok([]);
    }
  },

  async submitTicket(input: SupportTicketInput): Promise<ApiResult<SupportTicket>> {
    if (!input.subject.trim() || !input.message.trim()) {
      return fail("INVALID_TICKET", "Please add a subject and a short message.");
    }
    if (!isLiveApiBaseUrl()) {
      return fail("BACKEND_UNAVAILABLE", "Support backend is not connected yet. Please try again later.");
    }
    try {
      const res = await httpClient.post<BackendTicketResponse>(
        "/v1/support/tickets",
        {
          subject: input.subject.trim(),
          message: input.message.trim(),
          category: input.category,
          orderId: input.orderId,
          photoUrls: input.photoUrls ?? [],
        },
        { headers: await authHeaders() },
      );
      const raw = (res.data ?? {}) as BackendTicketResponse;
      const fallbackId =
        typeof raw.id === "string" && raw.id
          ? raw.id
          : `tkt_${Date.now().toString(36)}`;
      return ok({
        id: normalizeTicketId(raw, fallbackId),
        subject: input.subject.trim(),
        message: input.message.trim(),
        category: input.category,
        orderId: input.orderId,
        photoUrls: input.photoUrls ?? [],
        ticketNumber: normalizeTicketNumber(raw, fallbackId.toUpperCase()),
        status: normalizeStatus(raw),
        createdAt: normalizeCreatedAt(raw),
        slaMinutes: extractSlaMinutes(raw) ?? undefined,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not reach support. Please try again.";
      return fail("TICKET_SUBMIT_FAILED", message, true);
    }
  },

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
      const message =
        err instanceof Error ? err.message : "Photo upload failed. Please try again.";
      return fail("EVIDENCE_UPLOAD_FAILED", message, true);
    }
  },

  async submitFeedback(input: FeedbackInput): Promise<ApiResult<FeedbackRecord>> {
    if (!Number.isFinite(input.rating) || input.rating < 1 || input.rating > 5) {
      return fail("INVALID_RATING", "Please select a rating between 1 and 5.");
    }
    if (!isLiveApiBaseUrl()) {
      return fail("BACKEND_UNAVAILABLE", "Support backend is not connected yet. Please try again later.");
    }
    try {
      const res = await httpClient.post<{ id?: string; createdAt?: number }>(
        "/v1/support/feedback",
        {
          rating: input.rating,
          comment: input.comment,
          suggestion: input.suggestion,
        },
        { headers: await authHeaders() },
      );
      const data = (res.data ?? {}) as { id?: string; createdAt?: number };
      return ok({
        id: typeof data.id === "string" && data.id ? data.id : `fb_${Date.now().toString(36)}`,
        createdAt:
          typeof data.createdAt === "number" && Number.isFinite(data.createdAt)
            ? data.createdAt
            : Date.now(),
        ...input,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not send feedback. Please try again.";
      return fail("FEEDBACK_SUBMIT_FAILED", message, true);
    }
  },
};
