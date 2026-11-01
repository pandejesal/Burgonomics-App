/**
 * SupportRepository — UI-facing surface for the help center.
 *
 * ROUTE AUDIT (backend functions/src/index.ts):
 *   listFaqs()             → LOCAL content. No GET /v1/support/faqs route exists.
 *   listChannels()         → LOCAL content. No GET /v1/support/channels route.
 *   listIssueCategories()  → LOCAL content. No GET /v1/support/issue-categories.
 *   submitFeedback()       → LIVE. POST /support/feedback.
 *   submitTicket()         → REMOVED. No POST /v1/support/tickets route exists;
 *                            the live create route is POST /tickets/create via
 *                            supportService.submitTicketToLiveBackend (nothing
 *                            called this method).
 *
 * The three content methods are synchronous local data with no awaiting, no
 * spinner, and no failure state — they cannot fail, because they never leave the
 * app. Each list is single-sourced from real app data (see features/support/data).
 */
import type { ApiResult } from "@/core/network/http";
import { ok } from "@/core/network/http";
import { supportService } from "@/features/support/services/supportService";
import { LOCAL_FAQS } from "@/features/support/data/faqs";
import { LOCAL_CHANNELS } from "@/features/support/data/channels";
import { LOCAL_ISSUE_CATEGORIES } from "@/features/support/data/issueCategories";
import type {
  FaqItem,
  FeedbackInput,
  FeedbackRecord,
  IssueCategory,
  SupportChannel,
} from "@/features/support/models";

export class SupportRepository {
  readonly name = "SupportRepository";

  /** Local FAQs (no network call, cannot fail). */
  listFaqs(): ApiResult<FaqItem[]> {
    return ok(LOCAL_FAQS);
  }

  /** Local contact channels built from real APP config values. */
  listChannels(): ApiResult<SupportChannel[]> {
    return ok(LOCAL_CHANNELS);
  }

  /** Local issue categories — the app's own ticket vocabulary. */
  listIssueCategories(): ApiResult<IssueCategory[]> {
    return ok(LOCAL_ISSUE_CATEGORIES);
  }

  submitFeedback(input: FeedbackInput): Promise<ApiResult<FeedbackRecord>> {
    return supportService.submitFeedback(input);
  }
}

export const supportRepository = new SupportRepository();
