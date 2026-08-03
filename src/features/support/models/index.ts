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
}

export interface SupportTicket extends SupportTicketInput {
  id: string;
  createdAt: number;
  status: "open" | "in_progress" | "resolved";
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
