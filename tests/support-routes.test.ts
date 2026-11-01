import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Support route audit — the local content surfaces never touch the network, and
 * the one remote call (feedback) reaches the real route.
 *
 * Backend routes that actually exist (functions/src/index.ts):
 *   POST /tickets/create   POST /tickets/message   POST /tickets/resolve
 *   POST /tickets/resolveNote   POST /tickets/escalate
 *   POST /support/feedback  (new)
 * and NO /v1/support/* route at all, and NO GET ticket list route.
 *
 * Mocks use the same relative specifiers the module under test imports.
 */

const httpGet = vi.fn();
const httpPost = vi.fn();
const fetchMock = vi.fn();

vi.mock("../src/core/network/httpClient", () => ({
  httpClient: {
    get: (...args: unknown[]) => httpGet(...args),
    post: (...args: unknown[]) => httpPost(...args),
  },
}));

vi.mock("../src/core/config/firebase", () => ({
  auth: { currentUser: { getIdToken: async () => "test-token" } },
  db: { __mockDb: true },
  getAppCheckToken: async () => null,
}));

const MODULE = "../src/features/support/services/supportService";

beforeEach(() => {
  httpGet.mockReset();
  httpPost.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("local content never calls the network", () => {
  it("repository serves FAQs, channels and categories locally", async () => {
    const { supportRepository } =
      await import("../src/features/support/repositories/SupportRepository");

    const faqs = supportRepository.listFaqs();
    const channels = supportRepository.listChannels();
    const categories = supportRepository.listIssueCategories();

    expect(faqs.success).toBe(true);
    expect(channels.success).toBe(true);
    expect(categories.success).toBe(true);
    // Synchronous: an ApiResult, not a Promise. Nothing async happened.
    expect(faqs).not.toBeInstanceOf(Promise);
    expect(httpGet).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serves a non-empty FAQ list and every item has question + answer", async () => {
    const { LOCAL_FAQS } = await import("../src/features/support/data/faqs");
    expect(LOCAL_FAQS.length).toBeGreaterThan(0);
    for (const f of LOCAL_FAQS) {
      expect(f.id, "every FAQ needs a stable id").toBeTruthy();
      expect(f.question.trim().length).toBeGreaterThan(5);
      expect(f.answer.trim().length).toBeGreaterThan(20);
    }
  });

  it("serves categories from the app's own ticket vocabulary", async () => {
    const { LOCAL_ISSUE_CATEGORIES } = await import("../src/features/support/data/issueCategories");
    expect(LOCAL_ISSUE_CATEGORIES.length).toBe(6);
    for (const c of LOCAL_ISSUE_CATEGORIES) {
      expect(c.id).toBeTruthy();
      expect(c.label).toBeTruthy();
    }
  });

  it("channels contain only real APP values plus in-app ticketing", async () => {
    const { LOCAL_CHANNELS } = await import("../src/features/support/data/channels");
    const { APP } = await import("../src/core/constants/app");

    const ids = LOCAL_CHANNELS.map((c) => c.id);
    // In-app ticketing is always present and always available — it really works.
    expect(ids).toContain("in-app-ticket");

    // Every email value must be a real APP value, never an invented address.
    for (const c of LOCAL_CHANNELS) {
      if (c.kind === "email") {
        expect([APP.supportEmail, APP.grievanceEmail]).toContain(c.value);
      }
      // No invented phone/WhatsApp/chat channel exists in APP config.
      expect(c.kind).not.toBe("call");
      expect(c.kind).not.toBe("whatsapp");
      expect(c.kind).not.toBe("chat");
    }
  });
});

describe("feedback posts to the real route", () => {
  it("POSTs /support/feedback with the rating and reports the server id", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: "fb_123" }),
    });

    const { supportService } = await import(MODULE);
    const res = await supportService.submitFeedback({ rating: 5, comment: "Great" });

    expect(res.success).toBe(true);
    if (res.success) expect(res.data.id).toBe("fb_123");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/support\/feedback$/);
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.rating).toBe(5);
    expect(body.comment).toBe("Great");
    // The dead /v1/support path must never be used.
    expect(String(url)).not.toContain("/v1/support");
  });

  it("still carries the Authorization header", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: "fb_1" }) });
    const { supportService } = await import(MODULE);
    await supportService.submitFeedback({ rating: 4 });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer test-token");
  });

  it("reports failure on a non-2xx and never claims success", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "boom",
      json: async () => ({}),
    });
    const { supportService } = await import(MODULE);
    const res = await supportService.submitFeedback({ rating: 4 });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("FEEDBACK_SUBMIT_FAILED");
  });

  it("treats a 2xx without an id as a failure (no fabricated confirmation)", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({}) });
    const { supportService } = await import(MODULE);
    const res = await supportService.submitFeedback({ rating: 4 });
    expect(res.success).toBe(false);
  });

  it("rejects an out-of-range rating before calling the network", async () => {
    const { supportService } = await import(MODULE);
    expect((await supportService.submitFeedback({ rating: 0 })).success).toBe(false);
    expect((await supportService.submitFeedback({ rating: 6 })).success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rounds a fractional rating so the server's integer schema accepts it", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: "fb_2" }) });
    const { supportService } = await import(MODULE);
    await supportService.submitFeedback({ rating: 3.6 });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.rating).toBe(4);
    expect(Number.isInteger(body.rating)).toBe(true);
  });
});

describe("dead /v1/support methods are gone", () => {
  it("supportService exposes no submitTicket targeting /v1/support/tickets", async () => {
    const { supportService } = await import(MODULE);
    // Deleted rather than left as a trap: nothing called it.
    expect("submitTicket" in supportService).toBe(false);
  });
});
