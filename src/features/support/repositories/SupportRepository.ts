/**
 * SupportRepository — UI-facing surface for the help center. Content
 * is intentionally repository-driven: FAQs, channels, issue
 * categories, ticket submission and feedback all resolve through this
 * class so a live backend can take over without touching UI.
 *
 * Future integration points:
 *   listFaqs()             → GET  /v1/support/faqs
 *   listChannels()         → GET  /v1/support/channels
 *   listIssueCategories()  → GET  /v1/support/issue-categories
 *   submitTicket()         → POST /v1/support/tickets
 *   submitFeedback()       → POST /v1/support/feedback
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
