import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { supportService } from "@/features/support/services/supportService";
import { useAuthStore } from "@/features/auth/state/authStore";

export type TicketCategory =
  | "LATE_DELIVERY"
  | "MISSING_ITEM"
  | "FOOD_QUALITY"
  | "WRONG_ORDER"
  | "PAYMENT_ISSUE"
  | "OTHER";

export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "ESCALATED";

export interface CustomerTicket {
  id: string;
  ticketNumber: string;
  orderId?: string;
  orderShortCode?: string;
  category: TicketCategory;
  categoryLabel: string;
  description: string;
  /** Storage-backed evidence URLs (https only — never base64 data-URLs). */
  photos: string[];
  status: TicketStatus;
  priority: "normal" | "urgent";
  escalationLevel: 1 | 2 | 3;
  branchId?: string;
  managerResponse?: string;
  createdAt: string;
  resolvedAt?: string;
  /**
   * Backend-provided response SLA in minutes. Null when the backend did
   * not supply one — UI gates ALL SLA copy on this field.
   */
  slaMinutes?: number | null;
}

export interface CreateTicketParams {
  orderId?: string;
  orderShortCode?: string;
  category: TicketCategory;
  description: string;
  /** Already-uploaded remote URLs (https). Data-URLs are dropped, never stored. */
  photos?: string[];
  /** Local files to upload to Storage before the ticket POST. */
  photoFiles?: File[];
  branchId?: string;
}

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  LATE_DELIVERY: "Delayed Delivery",
  MISSING_ITEM: "Missing Item in Package",
  FOOD_QUALITY: "Food Quality (Cold/Soggy)",
  WRONG_ORDER: "Wrong Item / Order Delivered",
  PAYMENT_ISSUE: "Payment / Duplicate Charge",
  OTHER: "General Query or Feedback",
};

const LEGACY_TICKETS_KEY = "burgonomics_customer_tickets";
const MAX_CACHED_TICKETS = 20;

// Loop 35: a single global key leaked drafts across users on shared devices.
// Scope by user id; guests keep the legacy key. Never migrate the legacy key
// into a signed-in scope — that would copy one user's drafts to another.
export const ticketsKeyFor = (uid?: string | null) =>
  uid ? `${LEGACY_TICKETS_KEY}:${uid}` : LEGACY_TICKETS_KEY;

/** Remote evidence URLs only — base64 data-URLs are never valid photo refs. */
export function isRemotePhotoUrl(url: unknown): url is string {
  return typeof url === "string" && /^https:\/\//.test(url);
}

function isValidCachedTicket(v: unknown): v is CustomerTicket {
  if (!v || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.id === "string" &&
    typeof t.ticketNumber === "string" &&
    typeof t.categoryLabel === "string" &&
    typeof t.description === "string" &&
    typeof t.createdAt === "string" &&
    (t.status === "OPEN" ||
      t.status === "IN_PROGRESS" ||
      t.status === "RESOLVED" ||
      t.status === "ESCALATED")
  );
}

/**
 * Sanitize a cached ticket list: keep only valid shapes, drop base64
 * photo payloads (quota + honesty), cap length. Exported for tests.
 */
export function sanitizeCachedTickets(parsed: unknown): CustomerTicket[] {
  if (!Array.isArray(parsed)) return [];
  return (parsed as unknown[])
    .filter(isValidCachedTicket)
    .map((t) => ({
      ...t,
      photos: Array.isArray(t.photos) ? t.photos.filter(isRemotePhotoUrl).slice(0, 3) : [],
      slaMinutes:
        typeof t.slaMinutes === "number" && Number.isFinite(t.slaMinutes) && t.slaMinutes > 0
          ? t.slaMinutes
          : null,
    }))
    .slice(0, MAX_CACHED_TICKETS);
}

function readCachedTickets(storageKey: string): CustomerTicket[] {
  try {
    const stored = localStorage.getItem(storageKey);
    // No seed: fresh installs start with []. The cache holds only
    // server-confirmed tickets from prior sessions on this device.
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    // Cache-shape guard: a corrupt / non-array payload must not poison
    // the hook. Clear the bad key so the next read starts clean.
    if (!Array.isArray(parsed)) {
      localStorage.removeItem(storageKey);
      return [];
    }
    return sanitizeCachedTickets(parsed);
  } catch {
    return [];
  }
}

function persistTickets(storageKey: string, tickets: CustomerTicket[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(tickets.slice(0, MAX_CACHED_TICKETS)));
  } catch (e) {
    console.warn("Failed to persist tickets:", e);
  }
}

export function useCustomerTickets() {
  // Server is the source of truth. localStorage is a read-through cache
  // of the last server-confirmed list for offline reads only.
  const uid = useAuthStore((s) => s.user?.id) ?? null;
  const storageKey = ticketsKeyFor(uid);
  const [tickets, setTickets] = useState<CustomerTicket[]>(() => readCachedTickets(storageKey));
  const [isLoading, setIsLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initial server sync: backend list wins; client-known detail (category,
  // description, photos) is preserved by id for tickets created here.
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setListError(null);
    try {
      const res = await supportService.listTickets();
      if (!res.success) {
        // Offline with no cache is still an honest empty state —
        // surface the failure so the UI can offer retry.
        setListError("Could not load tickets. Please try again.");
        return;
      }
      setTickets((prev) => {
        const prevById = new Map(prev.map((t) => [t.id, t]));
        const merged: CustomerTicket[] = res.data.map((raw) => {
          const nested = raw.ticket;
          const id =
            nested?.id ?? (typeof raw.id === "string" ? raw.id : `tkt_${Date.now().toString(36)}`);
          const cached = prevById.get(id);
          const statusRaw = (nested?.status ?? raw.status ?? "open").toLowerCase();
          const status: TicketStatus =
            statusRaw === "resolved" || statusRaw === "closed" || statusRaw === "done"
              ? "RESOLVED"
              : statusRaw === "in_progress" || statusRaw === "in-progress"
                ? "IN_PROGRESS"
                : "OPEN";
          const created =
            nested?.createdAt ?? raw.createdAt ?? raw.created_at ?? cached?.createdAt;
          const createdAt =
            typeof created === "number"
              ? new Date(created).toISOString()
              : typeof created === "string"
                ? created
                : new Date().toISOString();
          const slaCandidates = [
            raw.slaMinutes,
            raw.sla_minutes,
            raw.responseSlaMinutes,
            nested?.slaMinutes,
            nested?.sla_minutes,
          ];
          const sla =
            slaCandidates.find(
              (c): c is number => typeof c === "number" && Number.isFinite(c) && c > 0,
            ) ?? null;
          return {
            id,
            ticketNumber:
              nested?.ticketNumber ??
              raw.ticketNumber ??
              raw.ticket_number ??
              cached?.ticketNumber ??
              id.toUpperCase(),
            orderId: cached?.orderId,
            orderShortCode: cached?.orderShortCode,
            category: cached?.category ?? "OTHER",
            categoryLabel: cached?.categoryLabel ?? "Support request",
            description: cached?.description ?? "",
            photos: cached?.photos ?? [],
            status,
            priority: cached?.priority ?? "normal",
            escalationLevel: cached?.escalationLevel ?? 1,
            branchId: cached?.branchId,
            managerResponse: cached?.managerResponse,
            createdAt,
            resolvedAt: status === "RESOLVED" ? (cached?.resolvedAt ?? createdAt) : undefined,
            slaMinutes: sla,
          };
        });
        persistTickets(storageKey, merged);
        return merged;
      });
    } catch {
      setListError("Could not load tickets. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [storageKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Loop 35: account switch re-reads the newly scoped key so one user's
  // cached drafts never render under another user's session.
  useEffect(() => {
    setTickets(readCachedTickets(storageKey));
  }, [storageKey]);

  const createTicket = useCallback(
    async (params: CreateTicketParams): Promise<{ success: boolean; ticket?: CustomerTicket }> => {
      if (!params.category) {
        toast.error("Please select an issue category");
        return { success: false };
      }
      if (!params.description || params.description.trim().length < 10) {
        toast.error("Please describe your issue (at least 10 characters)");
        return { success: false };
      }

      setIsSubmitting(true);
      try {
        // 1. Storage-backed photo evidence — never base64-in-localStorage.
        // Upload failures fail the evidence step honestly (ticket still
        // posts without photos rather than inventing URLs).
        let photoUrls = (params.photos ?? []).filter(isRemotePhotoUrl).slice(0, 3);
        const files = (params.photoFiles ?? []).slice(0, 3);
        if (files.length > 0) {
          const upload = await supportService.uploadEvidence(files, `new_${Date.now()}`);
          if (upload.success) {
            photoUrls = [...photoUrls, ...upload.data.filter(isRemotePhotoUrl)].slice(0, 3);
          } else {
            toast.error("Photo upload failed — submitting the ticket without photos.");
          }
        }

        // 2. Server POST is the ticket creation — the LIVE
        // POST /tickets/create backend (no local fabrication). Category and
        // branch map onto the server's createTicketSchema; identity comes
        // from the signed-in session (server binds customerId to the caller).
        const serverCategory =
          params.category === "LATE_DELIVERY"
            ? "late_delivery"
            : params.category === "MISSING_ITEM" || params.category === "WRONG_ORDER"
              ? "wrong_item"
              : params.category === "FOOD_QUALITY"
                ? "food_quality"
                : params.category === "PAYMENT_ISSUE"
                  ? "payment_issue"
                  : "general_inquiry";
        const sessionUser = useAuthStore.getState().user;
        const { useStoreSelection } = await import("@/features/stores/state/storeStore");
        const activeStore = useStoreSelection.getState().activeStore;
        const res = await supportService.submitTicketToLiveBackend({
          customerName: sessionUser?.name || sessionUser?.phone || "Customer",
          customerPhone: sessionUser?.phone,
          orderId: params.orderId,
          branchId:
            params.branchId || (activeStore as { partnerBranchId?: string } | null)?.partnerBranchId || "",
          category: serverCategory,
          priority:
            params.category === "PAYMENT_ISSUE" || params.category === "WRONG_ORDER"
              ? "urgent"
              : "medium",
          subject: CATEGORY_LABELS[params.category],
          description: params.description.trim(),
          attachments: photoUrls,
        });
        if (!res.success) {
          toast.error(res.error.message);
          return { success: false };
        }

        const server = res.data;
        const newTicket: CustomerTicket = {
          id: server.id,
          ticketNumber: server.ticketNumber ?? server.id.toUpperCase(),
          orderId: params.orderId,
          orderShortCode: params.orderShortCode || params.orderId?.slice(-6).toUpperCase(),
          category: params.category,
          categoryLabel: CATEGORY_LABELS[params.category],
          description: params.description.trim(),
          photos: photoUrls,
          status: "OPEN",
          priority:
            params.category === "PAYMENT_ISSUE" || params.category === "WRONG_ORDER"
              ? "urgent"
              : "normal",
          escalationLevel: 1,
          branchId: params.branchId,
          createdAt:
            typeof server.createdAt === "number"
              ? new Date(server.createdAt).toISOString()
              : typeof server.createdAt === "string"
                ? server.createdAt
                : new Date().toISOString(),
          slaMinutes: null,
        };

        setTickets((prev) => {
          const next = [newTicket, ...prev].slice(0, MAX_CACHED_TICKETS);
          persistTickets(storageKey, next);
          return next;
        });
        // The live backend sends no SLA field — generic confirmation only,
        // never an invented response-time promise.
        toast.success(
          `Support Ticket #${newTicket.ticketNumber} raised! Our store team has been notified.`,
        );
        return { success: true, ticket: newTicket };
      } catch {
        toast.error("Failed to submit support ticket");
        return { success: false };
      } finally {
        setIsSubmitting(false);
      }
    },
    [storageKey],
  );

  return {
    tickets,
    isLoading,
    listError,
    isSubmitting,
    createTicket,
    refresh,
    categoryLabels: CATEGORY_LABELS,
  };
}

export default useCustomerTickets;
