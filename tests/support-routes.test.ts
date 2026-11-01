import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Support route audit — every network call in src/features/support must reach a
 * route that actually exists in backend functions/src/index.ts.
 *
 * The backend registers exactly these support routes:
 *   POST /tickets/create   (requireAuth, createTicketSchema)   index.ts:1105
 *   POST /tickets/message  (requireAuth, ticketMessageSchema)  index.ts:1117
 *   POST /tickets/resolve  POST /tickets/escalate  POST /tickets/resolveNote
 * and NO /v1/support/* route at all, and NO GET ticket list route.
 *
 * Returning `ok([])` for a path no handler serves is a false empty state, so
 * these tests pin both the route and the failure honesty.
 *
 * Mocks use the same relative specifiers the module under test imports.
 */

const httpGet = vi.fn();
const httpPost = vi.fn();

vi.mock("../src/core/network/httpClient", () => ({
  httpClient: {
    get: (...args: unknown[]) => httpGet(...args),
    post: (...args: unknown[]) => httpPost(...args),
  },
}));

vi.mock("../src/core/config/env", () => ({
  isLiveApiBaseUrl: () => true,
}));

vi.mock("../src/core/config/firebase", () => ({
  auth: { currentUser: { getIdToken: async () => "test-token" } },
  db: { __mockDb: true },
}));

const MODULE = "../src/features/support/services/supportService";

beforeEach(() => {
  httpGet.mockReset();
  httpPost.mockReset();
});

describe("support lists have no backend route — say so, never a fake empty list", () => {
  it("listFaqs returns a failure, not a fabricated empty success", async () => {
    const { supportService } = await import(MODULE);
    const res = await supportService.listFaqs();
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("SUPPORT_CONTENT_UNAVAILABLE");
    expect(httpGet).not.toHaveBeenCalled();
  });

  it("listChannels returns a failure, not a fabricated empty success", async () => {
    const { supportService } = await import(MODULE);
    const res = await supportService.listChannels();
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("SUPPORT_CONTENT_UNAVAILABLE");
    expect(httpGet).not.toHaveBeenCalled();
  });

  it("listIssueCategories returns a failure, not a fabricated empty success", async () => {
    const { supportService } = await import(MODULE);
    const res = await supportService.listIssueCategories();
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("SUPPORT_CONTENT_UNAVAILABLE");
    expect(httpGet).not.toHaveBeenCalled();
  });
});

describe("submitTicket no longer posts to a dead route", () => {
  it("does not POST /v1/support/tickets", async () => {
    httpPost.mockRejectedValue(new Error("must not be called"));
    const { supportService } = await import(MODULE);
    const res = await supportService.submitTicket({
      subject: "Cold food",
      message: "My burger arrived cold.",
      photoUrls: [],
    });
    expect(httpPost).not.toHaveBeenCalledWith(
      "/v1/support/tickets",
      expect.anything(),
      expect.anything(),
    );
    // No backend route takes this legacy input shape (it has no branchId and
    // uses message/photoUrls); it must fail honestly instead of guessing.
    expect(res.success).toBe(false);
  });
});

describe("submitFeedback reports the missing backend route honestly", () => {
  it("fails with a route-missing code instead of a fake success", async () => {
    const { supportService } = await import(MODULE);
    const res = await supportService.submitFeedback({ rating: 5, comment: "Great" });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("FEEDBACK_UNAVAILABLE");
    expect(httpPost).not.toHaveBeenCalledWith(
      "/v1/support/feedback",
      expect.anything(),
      expect.anything(),
    );
  });
});

describe("listTickets is served by Firestore, not a dead HTTP route", () => {
  it("never GETs /v1/support/tickets", async () => {
    const { supportService } = await import(MODULE);
    await supportService.listTickets();
    expect(httpGet).not.toHaveBeenCalledWith("/v1/support/tickets", expect.anything());
  });
});
