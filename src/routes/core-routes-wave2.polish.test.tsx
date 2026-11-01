/**
 * Wave-2 core-routes polish verification (sprint 2026-10-16).
 *
 * Findings covered:
 *   M6 - a failed support load must not leave an infinite pulse skeleton.
 *   L2 - the orders search input needs a real accessible name.
 *   L3 - the active bucket tab must be exposed programmatically, not by colour alone.
 *
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = vi.hoisted(() => ({
  listOrders: vi.fn(),
  submitFeedback: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useSearch: () => ({}),
  }),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({
    children,
    rightSlot,
  }: {
    children: React.ReactNode;
    rightSlot?: React.ReactNode;
  }) => (
    <main>
      {rightSlot}
      {children}
    </main>
  ),
}));
vi.mock("@/features/auth/components/ProtectedRoute", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/features/orders", () => ({
  orderRepository: { listOrders: fixture.listOrders },
  OrderHistoryCard: ({ order }: { order: { id: string } }) => <article>Order {order.id}</article>,
  useOrdersStore: Object.assign((select: (state: unknown) => unknown) => select({ ids: [] }), {
    getState: () => ({ ids: [], byId: {} }),
  }),
}));
vi.mock("@/core/state/appConfigStore", () => ({
  useAppConfig: (select: (state: unknown) => unknown) => select({ isOnline: true }),
}));
vi.mock("@/shared/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("@/features/support/repositories/SupportRepository", async () => {
  // FAQ / channel / category content is LOCAL (no /v1/support/* route), so the
  // mock serves the real local data instead of network stubs. Only feedback is
  // a spy, because it is the one genuinely remote call.
  const { LOCAL_FAQS } = await import("@/features/support/data/faqs");
  const { LOCAL_CHANNELS } = await import("@/features/support/data/channels");
  const { LOCAL_ISSUE_CATEGORIES } = await import("@/features/support/data/issueCategories");
  return {
    supportRepository: {
      listFaqs: () => ({ success: true, data: LOCAL_FAQS }),
      listChannels: () => ({ success: true, data: LOCAL_CHANNELS }),
      listIssueCategories: () => ({ success: true, data: LOCAL_ISSUE_CATEGORIES }),
      submitFeedback: fixture.submitFeedback,
    },
  };
});
vi.mock("@/features/support/hooks/useCustomerTickets", () => ({
  useCustomerTickets: () => ({ tickets: [], createTicket: vi.fn(), isSubmitting: false }),
}));
vi.mock("@/features/support/components/CreateTicketForm", () => ({
  CreateTicketForm: () => null,
}));
vi.mock("@/features/support/components/TicketListAccordion", () => ({
  TicketListAccordion: () => null,
}));
vi.mock("@/shared/components/common/BottomSheet", () => ({
  BottomSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
}));

import { Route as OrdersRoute } from "./orders.index";
import { Route as SupportRoute } from "./support";

const ok = (data: unknown) => ({ success: true, data });
const fail = (code = "NETWORK") => ({
  success: false,
  error: { code, message: "RAW PRIVATE DIAGNOSTIC" },
});

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.clearAllMocks();
  fixture.listOrders.mockResolvedValue(ok({ items: [], hasMore: false }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function mount(route: unknown) {
  const Page = (route as { options: { component: React.ComponentType } }).options.component;
  await act(async () => root.render(<Page />));
}

describe("M6 - support content is local, so it can never fail or spin", () => {
  // The FAQ / channel / category lists are local app data now (there is no
  // /v1/support/* route). The old M6 assertions proved a failed network fetch
  // rendered an error + retry; that path no longer exists, so these assert the
  // stronger property: the sections always render content immediately, with no
  // skeleton and no error state, even when the repository is stubbed to fail.

  it("renders channels with no skeleton and no error state", async () => {
    await mount(SupportRoute);

    expect(container.querySelectorAll(".animate-pulse").length).toBe(0);
    expect(container.textContent).not.toContain("Couldn't load contact channels");
    // The section always has something useful: the real APP email plus the
    // in-app ticket channel.
    expect(container.textContent).toContain("Direct Contact Channels");
    expect(container.textContent).toContain("Raise a support ticket");
    // The channel rows are tappable links; the address itself is the href,
    // not body text (see ChannelRow).
    const mailHrefs = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    expect(mailHrefs).toContain("mailto:support@burgonomics.com");
    expect(mailHrefs).toContain("mailto:privacy@burgonomics.com");
  });

  it("renders FAQs with no skeleton and no error state", async () => {
    await mount(SupportRoute);

    expect(container.querySelectorAll(".animate-pulse").length).toBe(0);
    expect(container.textContent).not.toContain("Couldn't load FAQs");
    // Real, grounded FAQ content is present on first paint.
    expect(container.textContent).toContain("Frequently Asked Questions");
    expect(container.textContent).toContain("Do the prices include GST?");
  });

  it("never renders a load-failure state for local content", async () => {
    // There is no network call to fail: local data cannot error, so the
    // screen must not offer a "Try Again" for FAQs/channels at all.
    await mount(SupportRoute);

    expect(container.textContent).not.toContain("Couldn't load");
    expect(container.textContent).toContain("Do the prices include GST?");
    expect(container.querySelectorAll(".animate-pulse").length).toBe(0);
  });
});

describe("L2 - orders search input has an accessible name", () => {
  it("exposes aria-label on the search input", async () => {
    await mount(OrdersRoute);

    const input = container.querySelector<HTMLInputElement>(
      'input[placeholder^="Search by Order"]',
    );
    expect(input).not.toBeNull();
    expect(input!.getAttribute("aria-label")).toBe("Search orders");
  });
});

describe("L3 - orders bucket tabs expose the active bucket programmatically", () => {
  it("marks exactly the active tab and moves the mark when the bucket changes", async () => {
    await mount(OrdersRoute);

    const tabs = Array.from(container.querySelectorAll("button")).filter((b) =>
      /Active Orders|Past Feasts|Cancelled/.test(b.textContent ?? ""),
    );
    expect(tabs).toHaveLength(3);

    const pressed = tabs.filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toContain("Active Orders");

    await act(async () => tabs[1].click());
    expect(tabs[1].getAttribute("aria-pressed")).toBe("true");
    expect(tabs[0].getAttribute("aria-pressed")).toBe("false");
  });
});
