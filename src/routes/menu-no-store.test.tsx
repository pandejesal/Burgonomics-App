/**
 * UX-01 — a deep link to /menu with fresh storage (no selected store) must
 * never render a blank document. The route sends the customer to /stores and,
 * even before that navigation lands, renders an honest empty state with a
 * working action instead of `return null`.
 */
/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = vi.hoisted(() => {
  const noop = vi.fn();
  return {
    navigate: vi.fn(),
    menu: {
      status: "idle",
      error: null,
      stale: false,
      categories: [],
      activeCategoryId: undefined,
      buckets: {},
      viewMode: "list",
      load: noop,
      loadMore: noop,
      setActiveCategory: noop,
      setViewMode: noop,
      subscribeToLiveMenu: () => noop,
    },
  };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
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
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useSearch: () => ({}),
  }),
  useNavigate: () => fixture.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/features/stores/state/storeStore", () => ({
  useStoreSelection: (select: (state: unknown) => unknown) =>
    select({ activeStore: null, isHydrated: true }),
}));
vi.mock("@/features/menu/state/menuStore", () => ({
  useMenuStore: Object.assign(
    (select: (state: typeof fixture.menu) => unknown) => select(fixture.menu),
    { getState: () => fixture.menu },
  ),
}));
vi.mock("@/features/cart", () => ({
  cartRepository: { addItem: vi.fn() },
  FloatingCartBar: () => null,
}));
vi.mock("@/features/menu/utils/categorySwipe", () => ({ attachCategorySwipe: () => () => {} }));
vi.mock("@/shared/hooks/useOnlineStatus", () => ({ useOnlineStatus: vi.fn() }));
vi.mock("@/core/state/appConfigStore", () => ({
  useAppConfig: (select: (state: { isOnline: boolean }) => unknown) => select({ isOnline: true }),
}));
vi.mock("@/core/services/haptics", () => ({
  HapticService: { impact: vi.fn(async () => {}) },
}));

import { Route as MenuRoute } from "./menu.index";

const MenuPage = (
  MenuRoute as unknown as { options: { component: React.ComponentType } }
).options.component;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.clearAllMocks();
  fixture.navigate.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("UX-01 — /menu with no selected store", () => {
  it("is never blank: it explains the missing store and offers a way to pick one", async () => {
    await act(async () => root.render(<MenuPage />));

    // Current bug: the component returns null, so the document is blank.
    expect(container.textContent?.trim().length).toBeGreaterThan(0);
    expect(container.textContent).toContain("Choose a store");

    // The route still redirects the deep link to the store picker.
    expect(fixture.navigate).toHaveBeenCalledWith({ to: "/stores", replace: true });

    // The honest empty state's action navigates there too.
    const action = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Choose a store"),
    );
    expect(action, "empty state action missing").toBeDefined();
    await act(async () => action!.click());
    expect(fixture.navigate).toHaveBeenCalledWith({ to: "/stores" });
  });
});
