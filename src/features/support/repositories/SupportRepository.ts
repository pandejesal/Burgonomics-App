/**
 * SupportRepository — UI-facing surface for the help center.
 *
 * ROUTE AUDIT (against backend functions/src/index.ts, 52 routes):
 *   listFaqs()             → DEAD. No GET /v1/support/faqs route exists.
 *   listChannels()         → DEAD. No GET /v1/support/channels route exists.
 *   listIssueCategories()  → DEAD. No GET /v1/support/issue-categories route.
 *   submitTicket()         → DEAD. No POST /v1/support/tickets route exists;
 *                            the live create route is POST /tickets/create.
 *   submitFeedback()       → DEAD. No POST /v1/support/feedback route exists.
 *
 * Each of these now returns an honest failure with a retryable flag instead of
 * an empty list, so the UI can say "couldn't load" rather than "there is
 * nothing". Ticket reads come from Firestore (services/ticketReads.ts) because
 * no HTTP route lists a customer's tickets.
 */
import type { ApiResult } from "@/core/network/http";
import { supportService } from "@/features/support/services/supportService";
import type {
  FaqItem,
  FeedbackInput,
  FeedbackRecord,
  IssueCategory,
  SupportChannel,
  SupportTicket,
  SupportTicketInput,
} from "@/features/support/models";

export class SupportRepository {
  readonly name = "SupportRepository";

  listFaqs(): Promise<ApiResult<FaqItem[]>> {
    return supportService.listFaqs();
  }

  listChannels(): Promise<ApiResult<SupportChannel[]>> {
    return supportService.listChannels();
  }

  listIssueCategories(): Promise<ApiResult<IssueCategory[]>> {
    return supportService.listIssueCategories();
  }

  submitTicket(input: SupportTicketInput): Promise<ApiResult<SupportTicket>> {
    return supportService.submitTicket(input);
  }

  submitFeedback(input: FeedbackInput): Promise<ApiResult<FeedbackRecord>> {
    return supportService.submitFeedback(input);
  }
}

export const supportRepository = new SupportRepository();
