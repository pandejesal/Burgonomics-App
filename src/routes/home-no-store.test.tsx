/**
 * UX-01 follow-up — /home had the same `return null` gate as /menu. A fresh
 * visit (no persisted store) rendered a blank document until the redirect to
 * /stores landed. It must be never-blank: skeleton while hydrating, then an
 * honest empty state with a working way to choose a store.
 */
/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = vi.hoisted(() => ({
  navigate: vi.fn(),
  home: { status: "idle", bundle: null, error: null, load: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  useNavigate: () => fixture.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/features/stores/state/storeStore", () => ({
  useStoreSelection: (select: (state: unknown) => unknown) =>
    select({ activeStore: null, isHydrated: true }),
}));
vi.mock("@/features/auth/state/authStore", () => ({
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({ user: null, isBootstrapped: true }),
  selectIsAuthenticated: () => false,
}));
vi.mock("@/features/home", () => ({
  useHomeStore: Object.assign(
    (select: (state: typeof fixture.home) => unknown) => select(fixture.home),
    { getState: () => fixture.home },
  ),
}));
vi.mock("@/features/home/components/CategoryPills", () => ({ CategoryPills: () => null }));
vi.mock("@/features/menu/components/CategoryPills", () => ({ CategoryPills: () => null }));
vi.mock("@/features/home/components/BrandHeader", () => ({ BrandHeader: () => null }));
vi.mock("@/features/home/components/BannerCarousel", () => ({ BannerCarousel: () => null }));
vi.mock("@/features/home/components/CategoryGrid", () => ({ CategoryGrid: () => null }));
vi.mock("@/features/home/components/HorizontalRail", () => ({ HorizontalRail: () => null }));
vi.mock("@/features/home/components/SectionHeader", () => ({ SectionHeader: () => null }));
vi.mock("@/features/home/components/BestSellerCard", () => ({ BestSellerCard: () => null }));
vi.mock("@/features/home/components/ComboCard", () => ({ ComboCard: () => null }));
vi.mock("@/features/home/components/HomeSkeleton", () => ({ HomeSkeleton: () => null }));
vi.mock("@/features/cart/components/FloatingCartBar", () => ({ FloatingCartBar: () => null }));
vi.mock("@/features/orders/hooks/useReorderItems", () => ({
  useReorderItems: () => ({ reorder: vi.fn() }),
}));
vi.mock("@/features/orders", () => ({
  orderRepository: { getOrder: vi.fn() },
  OrderHistoryCard: () => null,
}));
vi.mock("@/features/orders/repositories/OrderRepository", () => ({
  orderRepository: { getOrder: vi.fn() },
}));
vi.mock("@/shared/components/feedback/FailureState", () => ({ FailureState: () => null }));
vi.mock("@/shared/components/feedback/PetpoojaSyncPlaceholder", () => ({
  PetpoojaSyncPlaceholder: () => null,
}));
vi.mock("@/shared/hooks/useOnlineStatus", () => ({ useOnlineStatus: vi.fn() }));
vi.mock("@/core/state/appConfigStore", () => ({
  useAppConfig: (select: (state: { isOnline: boolean }) => unknown) => select({ isOnline: true }),
}));

import { Route as HomeRoute } from "./home";

const HomePage = (HomeRoute as unknown as { options: { component: React.ComponentType } }).options
  .component;

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

describe("UX-01 follow-up — /home with no selected store", () => {
  it("is never blank: it explains the missing store and offers a way to pick one", async () => {
    await act(async () => root.render(<HomePage />));

    expect(container.textContent?.trim().length).toBeGreaterThan(0);
    expect(container.textContent).toContain("Choose a store");
    expect(fixture.navigate).toHaveBeenCalledWith({ to: "/stores", replace: true });

    const action = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Choose a store"),
    );
    expect(action, "empty state action missing").toBeDefined();
    await act(async () => action!.click());
    expect(fixture.navigate).toHaveBeenCalledWith({ to: "/stores" });
  });
});
