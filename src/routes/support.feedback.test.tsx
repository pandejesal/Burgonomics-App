import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

/**
 * The Help screen's feedback form must only claim success on a real 2xx.
 *
 * Source of truth for the route: POST /support/feedback
 * (backend functions/src/index.ts) returning 201 { id }.
 *
 * @vitest-environment jsdom
 */

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const supportRoute = { options: {} as { component: React.ComponentType } };

vi.mock("sonner", () => {
  const success = vi.fn();
  return { toast: { success, error: vi.fn() }, __toastSuccess: success };
});

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => {
    supportRoute.options = options as { component: React.ComponentType };
    return { options, useSearch: () => ({}) };
  },
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/core/state/appConfigStore", () => ({
  useAppConfig: (select: (s: unknown) => unknown) => select({ isOnline: true }),
}));
vi.mock("@/shared/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("@/features/orders", () => ({
  useOrdersStore: Object.assign((select: (s: unknown) => unknown) => select({ ids: [] }), {
    getState: () => ({ ids: [], byId: {} }),
  }),
}));
vi.mock("@/features/support/hooks/useCustomerTickets", () => ({
  useCustomerTickets: () => ({
    tickets: [],
    createTicket: vi.fn(),
    isSubmitting: false,
    listError: null,
    refresh: vi.fn(),
  }),
}));
vi.mock("@/features/support/components/CreateTicketForm", () => ({
  CreateTicketForm: () => null,
}));
vi.mock("@/features/support/components/TicketListAccordion", () => ({
  TicketListAccordion: () => null,
}));
vi.mock("@/shared/components/common/BottomSheet", () => ({
  BottomSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-sheet>{children}</div> : null,
}));

const submitFeedback = vi.fn();
vi.mock("@/features/support/repositories/SupportRepository", async () => {
  const { LOCAL_FAQS } = await import("@/features/support/data/faqs");
  const { LOCAL_CHANNELS } = await import("@/features/support/data/channels");
  const { LOCAL_ISSUE_CATEGORIES } = await import("@/features/support/data/issueCategories");
  return {
    supportRepository: {
      listFaqs: () => ({ success: true, data: LOCAL_FAQS }),
      listChannels: () => ({ success: true, data: LOCAL_CHANNELS }),
      listIssueCategories: () => ({ success: true, data: LOCAL_ISSUE_CATEGORIES }),
      submitFeedback: (...a: unknown[]) => submitFeedback(...a),
    },
  };
});

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

async function mountPage() {
  await import("./support");
  const Page = supportRoute.options.component;
  await act(async () => root.render(<Page />));
}

async function openFeedbackAndSubmit() {
  const feedbackBtn = Array.from(container.querySelectorAll("button")).find(
    (b) => (b.textContent ?? "").trim() === "Feedback",
  );
  expect(feedbackBtn, "feedback button missing").toBeDefined();
  await act(async () => feedbackBtn!.click());

  // Pick 5 stars.
  const star = container.querySelector<HTMLButtonElement>('button[aria-label="5 stars"]');
  expect(star, "5-star control missing").toBeDefined();
  await act(async () => star!.click());

  const submit = Array.from(container.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes("Send feedback"),
  );
  expect(submit, "submit button missing").toBeDefined();
  await act(async () => submit!.click());
}

describe("feedback form success/failure honesty", () => {
  it("does NOT show a success toast when the server refuses", async () => {
    submitFeedback.mockResolvedValue({
      success: false,
      error: { code: "FEEDBACK_SUBMIT_FAILED", message: "HTTP 500", retryable: true },
    });
    await mountPage();
    await openFeedbackAndSubmit();

    const { __toastSuccess } = (await import("sonner")) as unknown as {
      __toastSuccess: ReturnType<typeof vi.fn>;
    };
    expect(__toastSuccess).not.toHaveBeenCalled();
    // The form stays open with an error rather than closing on a lie.
    expect(container.textContent).not.toContain("Thanks for the feedback!");
  });

  it("shows the success toast only on a confirmed 2xx", async () => {
    submitFeedback.mockResolvedValue({
      success: true,
      data: { id: "fb_1", rating: 5, createdAt: 1 },
    });
    await mountPage();
    await openFeedbackAndSubmit();

    const { __toastSuccess } = (await import("sonner")) as unknown as {
      __toastSuccess: ReturnType<typeof vi.fn>;
    };
    expect(__toastSuccess).toHaveBeenCalledTimes(1);
  });
});
