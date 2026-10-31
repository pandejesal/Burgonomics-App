/** @vitest-environment jsdom */
/**
 * CUST-F1 regression pins — order-history request races and swallowed failures.
 *
 * The filter effect had a local `cancelled` flag, but the manual refresh and
 * pagination entry points had NO cross-request guard and NO failure handling:
 * a slow refresh could land after a newer tab's response (wrong rows + wrong
 * pagination state), a failed "Load Older Feasts" was a silent no-op that
 * could even leave the button stuck, and a rejected first load spun forever.
 * These pins exercise real out-of-order promise resolution on the standalone-
 * mounted page.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: (...args: unknown[]) => toastError(...args),
    info: vi.fn(),
  },
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    Link: ({ to, children, ...rest }: any) => (
      <a href={String(to)} {...rest}>
        {children}
      </a>
    ),
    // Standalone mount: the route object normally reads params from the
    // router context, which does not exist outside a <RouterProvider>.
    createFileRoute: (path: string) => (opts: any) => ({
      ...opts,
      options: opts,
      useParams: () => ({}),
      useSearch: () => ({}),
      useNavigate: () => vi.fn(),
      _$path: path,
    }),
  };
});

vi.mock("@/features/auth/components/ProtectedRoute", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// The refresh control lives in AppShell's rightSlot — render it.
vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({
    children,
    rightSlot,
  }: {
    children: React.ReactNode;
    rightSlot?: React.ReactNode;
  }) => (
    <div>
      {rightSlot ? <div data-testid="appshell-right">{rightSlot}</div> : null}
      {children}
    </div>
  ),
}));

vi.mock("@/core/state/appConfigStore", () => ({
  useAppConfig: (selector: (s: { isOnline: boolean }) => unknown) => selector({ isOnline: true }),
}));

// Lightweight barrel mock: the route only needs the repository and the card.
vi.mock("@/features/orders", () => ({
  orderRepository: { listOrders: vi.fn() },
  OrderHistoryCard: ({ order }: { order: { id: string } }) => (
    <div data-testid="order-card">{order.id}</div>
  ),
}));

import { orderRepository } from "@/features/orders";
import { Route } from "./orders.index";

const Page = (Route as unknown as { options: { component: React.ComponentType } }).options
  .component;

type Res =
  | {
      success: true;
      data: { items: Array<{ id: string }>; hasMore: boolean; page: number; pageSize: number };
    }
  | { success: false; error: { code: string; message: string } };

const ok = (ids: string[], hasMore = false, page = 1): Res => ({
  success: true,
  data: { items: ids.map((id) => ({ id })), hasMore, page, pageSize: 10 },
});

const generic = "Something went wrong. Please try again.";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const listOrders = vi.mocked(orderRepository.listOrders);

/** Flush the then/catch/finally chain so a deferred resolution reaches the DOM. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Page />);
  });
  // useHydrated flips true in an effect; this second pass starts the load.
  await settle();
  return {
    container,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

async function click(el: Element | null) {
  if (!el) throw new Error("click target missing");
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

const byText = (container: HTMLElement, text: string) =>
  Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === text,
  ) ?? null;

const refreshButton = (container: HTMLElement) =>
  container.querySelector('button[aria-label="Refresh orders"]');

const cardIds = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-testid="order-card"]')).map(
    (n) => n.textContent,
  );

const nextDeferred = () => {
  const d = deferred<Res>();
  listOrders.mockReturnValueOnce(d.promise as never);
  return d;
};

beforeEach(() => {
  listOrders.mockReset();
  toastError.mockReset();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("order history — request races (CUST-F1)", () => {
  it("POSITIVE COMMAND: renders the first page for the active bucket", async () => {
    listOrders.mockResolvedValueOnce(ok(["ord_active_1"]) as never);
    const { container, unmount } = await mount();
    await settle();

    expect(cardIds(container)).toEqual(["ord_active_1"]);
    await unmount();
  });

  it("NEGATIVE CONTROL: a slow refresh from the previous bucket cannot overwrite a newer tab", async () => {
    const initial = deferred<Res>();
    const slowRefresh = deferred<Res>();
    const pastFetch = deferred<Res>();
    listOrders
      .mockReturnValueOnce(initial.promise as never)
      .mockReturnValueOnce(slowRefresh.promise as never)
      .mockReturnValueOnce(pastFetch.promise as never);

    const { container, unmount } = await mount();
    initial.resolve(ok(["ord_active_1"]));
    await settle();
    expect(cardIds(container)).toEqual(["ord_active_1"]);

    // Refresh is still in flight when the customer switches tabs.
    await click(refreshButton(container));
    await click(byText(container, "Past Feasts"));

    pastFetch.resolve(ok(["ord_past_1"]));
    await settle();
    expect(cardIds(container)).toEqual(["ord_past_1"]);

    // The stale refresh now lands with the OLD bucket's rows.
    slowRefresh.resolve(ok(["ord_stale_active"]));
    await settle();

    // The newer tab's response must win; stale rows and its pagination
    // must not paint over it.
    expect(cardIds(container)).toEqual(["ord_past_1"]);
    expect(cardIds(container)).not.toContain("ord_stale_active");
    await unmount();
  });

  it("NEGATIVE CONTROL: a slow refresh resolving BEFORE the tab fetch cannot paint the old bucket", async () => {
    // Covers reviewer R1 #2: the refresh landed in the window between the
    // bucket-set commit and the filtering effect registering its generation.
    // Fix: the tab click itself invalidates in-flight reads.
    const initial = deferred<Res>();
    const slowRefresh = deferred<Res>();
    const pastFetch = deferred<Res>();
    listOrders
      .mockReturnValueOnce(initial.promise as never)
      .mockReturnValueOnce(slowRefresh.promise as never)
      .mockReturnValueOnce(pastFetch.promise as never);

    const { container, unmount } = await mount();
    initial.resolve(ok(["ord_active_1"]));
    await settle();

    await click(refreshButton(container));
    await click(byText(container, "Past Feasts"));

    // The stale refresh resolves FIRST — before the tab fetch resolves.
    slowRefresh.resolve(ok(["ord_refresh_active"]));
    await settle();

    // Mid-state honesty (GLM residual 2): the tab click already put the list
    // region into its loading skeleton, and the abandoned refresh must NOT
    // clear it to repaint the old bucket either.
    expect(cardIds(container)).toEqual([]);
    expect(container.textContent).not.toContain("ord_refresh_active");

    pastFetch.resolve(ok(["ord_past_1"]));
    await settle();

    expect(cardIds(container)).toEqual(["ord_past_1"]);
    expect(cardIds(container)).not.toContain("ord_refresh_active");
    await unmount();
  });

  it("NEGATIVE CONTROL: a load-more in flight during a tab switch cannot append across buckets", async () => {
    const initial = deferred<Res>();
    const pageTwo = deferred<Res>();
    const pastFetch = deferred<Res>();
    listOrders
      .mockReturnValueOnce(initial.promise as never)
      .mockReturnValueOnce(pageTwo.promise as never)
      .mockReturnValueOnce(pastFetch.promise as never);

    const { container, unmount } = await mount();
    initial.resolve(ok(["ord_active_1"], true, 1));
    await settle();

    await click(byText(container, "Load Older Feasts"));
    await click(byText(container, "Past Feasts"));

    pastFetch.resolve(ok(["ord_past_1"]));
    await settle();

    // The old bucket's page two cannot glue itself onto the new tab.
    pageTwo.resolve(ok(["ord_active_2"], false, 2));
    await settle();

    expect(cardIds(container)).toEqual(["ord_past_1"]);
    expect(cardIds(container)).not.toContain("ord_active_2");
    await unmount();
  });

  it("NEGATIVE CONTROL (ABA): a page-2 deferred by a tab round-trip cannot append on return", async () => {
    // Reviewer finding 1: filter equality alone permits A→B→A re-entry; the
    // generation snapshot must kill the first visit's page-2 response.
    const initial = deferred<Res>(); // 1: ongoing p1
    const pageTwo = deferred<Res>(); // 2: load-more (ongoing p2)
    const pastFetch = deferred<Res>(); // 3: past tab effect
    const refetchOngoing = deferred<Res>(); // 4: back to ongoing effect
    listOrders
      .mockReturnValueOnce(initial.promise as never)
      .mockReturnValueOnce(pageTwo.promise as never)
      .mockReturnValueOnce(pastFetch.promise as never)
      .mockReturnValueOnce(refetchOngoing.promise as never);

    const { container, unmount } = await mount();
    initial.resolve(ok(["ord_active_1"], true, 1));
    await settle();
    expect(cardIds(container)).toEqual(["ord_active_1"]);

    await click(byText(container, "Load Older Feasts"));
    await click(byText(container, "Past Feasts"));
    pastFetch.resolve(ok(["ord_past_1"], false, 1));
    await settle();
    await click(byText(container, "Active Orders"));

    // Newer requests resolve first: the round-trip's fresh page 1 lands,
    // then the first visit's abandoned page-2 arrives. It must not append.
    refetchOngoing.resolve(ok(["ord_active_1"], false, 1));
    await settle();
    pageTwo.resolve(ok(["ord_active_2"], false, 2));
    await settle();

    expect(cardIds(container)).toEqual(["ord_active_1"]);
    expect(cardIds(container)).not.toContain("ord_active_2");
    await unmount();
  });

  it("NEGATIVE CONTROL: a refresh completing mid-load-more blocks the stale append", async () => {
    // Reviewer finding 1 (second repro): pagination in flight while a refresh
    // resets the base page — the stale page-2 must not glue onto page 1.
    const initial = deferred<Res>();
    const pageTwo = deferred<Res>();
    const refresh = deferred<Res>();
    listOrders
      .mockReturnValueOnce(initial.promise as never)
      .mockReturnValueOnce(pageTwo.promise as never)
      .mockReturnValueOnce(refresh.promise as never);

    const { container, unmount } = await mount();
    initial.resolve(ok(["ord_active_1"], true, 1));
    await settle();

    await click(byText(container, "Load Older Feasts"));
    await click(refreshButton(container));

    refresh.resolve(ok(["ord_refreshed_1"], false, 1));
    await settle();
    pageTwo.resolve(ok(["ord_active_2"], false, 2));
    await settle();

    expect(cardIds(container)).toEqual(["ord_refreshed_1"]);
    expect(cardIds(container)).not.toContain("ord_active_2");
    await unmount();
  });

  it("NEGATIVE CONTROL: a failed load-more is surfaced and leaves the existing rows intact", async () => {
    listOrders
      .mockResolvedValueOnce(ok(["ord_active_1"], true, 1) as never)
      .mockRejectedValueOnce(new Error("network down") as never);

    const { container, unmount } = await mount();
    await settle();

    await click(byText(container, "Load Older Feasts"));
    await settle();

    // Existing rows survive and the failure is visible — never a silent
    // no-op — and raw network text stays out of the toast.
    expect(cardIds(container)).toEqual(["ord_active_1"]);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0]?.[0]).toBe("Couldn't load older feasts");
    expect(toastError.mock.calls[0]?.[1]?.description).toBe(generic);
    // The button must not stay stuck on the loading label.
    expect(byText(container, "Load Older Feasts")).not.toBeNull();
    await unmount();
  });

  it("NEGATIVE CONTROL: a load-more ApiFailure is surfaced the same way", async () => {
    listOrders
      .mockResolvedValueOnce(ok(["ord_active_1"], true, 1) as never)
      .mockResolvedValueOnce({
        success: false,
        error: { code: "BACKEND_UNAVAILABLE", message: "raw private diagnostic" },
      } as never);

    const { container, unmount } = await mount();
    await settle();

    await click(byText(container, "Load Older Feasts"));
    await settle();

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0]?.[0]).toBe("Couldn't load older feasts");
    expect(toastError.mock.calls[0]?.[1]?.description).toBe(
      "This service isn't available right now. Please try again later.",
    );
    expect(container.textContent).not.toContain("raw private diagnostic");
    expect(cardIds(container)).toEqual(["ord_active_1"]);
    await unmount();
  });

  it("NEGATIVE CONTROL: a rejected first load shows the retry state instead of an endless skeleton", async () => {
    listOrders.mockRejectedValueOnce(new Error("network down") as never);

    const { container, unmount } = await mount();
    await settle();

    expect(container.textContent).toContain("Failed to load orders");
    expect(container.textContent).toContain("Try Again");
    expect(container.textContent).not.toContain("network down");
    expect(listOrders).toHaveBeenCalledTimes(1);
    await unmount();
  });

  it("POSITIVE COMMAND: a same-bucket load-more appends exactly once", async () => {
    listOrders
      .mockResolvedValueOnce(ok(["ord_active_1"], true, 1) as never)
      .mockResolvedValueOnce(ok(["ord_active_2"], false, 2) as never);

    const { container, unmount } = await mount();
    await settle();

    await click(byText(container, "Load Older Feasts"));
    await settle();

    expect(cardIds(container)).toEqual(["ord_active_1", "ord_active_2"]);
    expect(listOrders).toHaveBeenLastCalledWith(
      expect.objectContaining({ bucket: "ongoing", page: 2 }),
    );
    await unmount();
  });

  it("NEGATIVE CONTROL: the local-fallback page echo cannot duplicate rows on a later page", async () => {
    // OrderRepository resolves an EMPTY server page-2 with its full local
    // list stamped page:1. Appending that would duplicate every row; the
    // page-echo check refuses it instead (repository fix would be separate).
    listOrders
      .mockResolvedValueOnce(ok(["ord_active_1"], true, 1) as never)
      .mockResolvedValueOnce(ok(["ord_local_echo"], true, 1) as never);

    const { container, unmount } = await mount();
    await settle();

    await click(byText(container, "Load Older Feasts"));
    await settle();

    expect(cardIds(container)).toEqual(["ord_active_1"]);
    expect(cardIds(container)).not.toContain("ord_local_echo");
    // Fail-closed pagination (GLM residual 1): the re-armed button would be
    // a silent no-op forever — the echo ends the page chain instead.
    expect(byText(container, "Load Older Feasts")).toBeNull();
    await unmount();
  });

  it("UNMOUNT SAFETY: a late RESPONSE after leaving the page side-effects nothing", async () => {
    const initial = deferred<Res>();
    const lateRefresh = deferred<Res>();
    listOrders
      .mockReturnValueOnce(initial.promise as never)
      .mockReturnValueOnce(lateRefresh.promise as never);

    const { container, unmount } = await mount();
    initial.resolve(ok(["ord_active_1"]));
    await settle();

    await click(refreshButton(container));
    const late = lateRefresh;
    await unmount();

    // Resolving after unmount must not throw and must not toast (the catch
    // path's isMounted guard also belongs to the mounted tree only).
    await act(async () => {
      late.resolve(ok(["ord_late"]));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(toastError).not.toHaveBeenCalled();
  });

  it("UNMOUNT SAFETY: a late REJECTION after leaving the page toasts nothing", async () => {
    // Reviewer: the success path never toasts, so the rejection branch needs
    // its own post-unmount pin to exercise the isMounted guard.
    const initial = deferred<Res>();
    const lateRefresh = deferred<Res>();
    listOrders
      .mockReturnValueOnce(initial.promise as never)
      .mockReturnValueOnce(lateRefresh.promise as never);

    const { container, unmount } = await mount();
    initial.resolve(ok(["ord_active_1"]));
    await settle();

    await click(refreshButton(container));
    const late = lateRefresh;
    await unmount();

    await act(async () => {
      late.reject(new Error("network down"));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(toastError).not.toHaveBeenCalled();
  });
});
