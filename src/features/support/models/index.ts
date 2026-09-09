export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category?: string;
}

export interface SupportChannel {
  id: string;
  label: string;
  /** Repo-driven — UI resolves the icon by `kind`, not by hardcoding. */
  kind: "call" | "email" | "whatsapp" | "chat" | "form" | "ai";
  value?: string; // phone number / email / URL
  available: boolean;
  helper?: string;
}

/** Repository-driven categories for the Report Issue form. */
export type IssueCategoryId = "order" | "payment" | "delivery" | "technical" | "other";

export interface IssueCategory {
  id: IssueCategoryId;
  label: string;
  helper?: string;
}

export interface SupportTicketInput {
  subject: string;
  message: string;
  category?: IssueCategoryId;
  orderId?: string;
  /** Storage-backed evidence URLs (https). Never base64 data-URLs. */
  photoUrls?: string[];
}

export interface SupportTicket extends SupportTicketInput {
  id: string;
  createdAt: number;
  status: "open" | "in_progress" | "resolved";
  /** Backend ticket number when the server assigns one. */
  ticketNumber?: string;
  /**
   * Backend-provided response SLA in minutes. Absent when the backend did
   * not supply one — callers must gate ALL SLA copy on this field.
   */
  slaMinutes?: number;
}

/**
 * Minimal backend ticket projection (Batch-5 S1 contract). Parsed
 * defensively in supportService — extra fields are ignored, missing
 * fields fall back to client-known values.
 */
export interface BackendTicket {
  id?: string;
  ticketNumber?: string;
  ticket_number?: string;
  status?: string;
  createdAt?: string | number;
  slaMinutes?: number;
  sla_minutes?: number;
}

export interface FeedbackInput {
  rating: number; // 1..5
  comment?: string;
  suggestion?: string;
}

export interface FeedbackRecord extends FeedbackInput {
  id: string;
  createdAt: number;
}
