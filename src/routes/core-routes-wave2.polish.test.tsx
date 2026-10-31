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
  listFaqs: vi.fn(),
  listChannels: vi.fn(),
  listIssueCategories: vi.fn(),
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
vi.mock("@/features/support/repositories/SupportRepository", () => ({
  supportRepository: {
    listFaqs: fixture.listFaqs,
    listChannels: fixture.listChannels,
    listIssueCategories: fixture.listIssueCategories,
    submitFeedback: vi.fn(),
  },
}));
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
  fixture.listFaqs.mockResolvedValue(ok([]));
  fixture.listChannels.mockResolvedValue(ok([]));
  fixture.listIssueCategories.mockResolvedValue(ok([]));
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

describe("M6 - support load failure is honest (no infinite skeleton)", () => {
  it("replaces the channels skeleton with an error + retry when listChannels fails", async () => {
    fixture.listChannels.mockResolvedValue(fail());
    await mount(SupportRoute);

    expect(container.querySelectorAll(".animate-pulse").length).toBe(0);
    expect(container.textContent).toContain("Couldn't load contact channels");
    expect(
      Array.from(container.querySelectorAll("button")).some((b) =>
        (b.textContent ?? "").includes("Try Again"),
      ),
    ).toBe(true);
  });

  it("replaces the FAQ skeleton with an error + retry when listFaqs fails", async () => {
    fixture.listFaqs.mockResolvedValue(fail());
    await mount(SupportRoute);

    expect(container.querySelectorAll(".animate-pulse").length).toBe(0);
    expect(container.textContent).toContain("Couldn't load FAQs");
  });

  it("retries the channels load and renders the channels on success", async () => {
    fixture.listChannels
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(
        ok([
          { id: "c1", kind: "call", label: "Store line", value: "+919876543210", available: true },
        ]),
      );
    await mount(SupportRoute);

    const retry = Array.from(container.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Try Again"),
    );
    expect(retry, "missing retry control").toBeDefined();
    await act(async () => retry!.click());

    expect(container.textContent).toContain("Store line");
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
