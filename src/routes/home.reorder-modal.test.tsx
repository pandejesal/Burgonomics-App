/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  modalOpen: true,
  navigate: vi.fn(),
  load: vi.fn(async () => {}),
  reorder: vi.fn(async () => ({ success: false, addedCount: 0, outOfStockItems: [] })),
}));

const bundle = {
  banners: [],
  categories: [],
  quickReorder: [],
  bestSellers: [],
  popularCombos: [],
};

vi.mock("@/features/home", () => ({
  useHomeStore: (select: (s: unknown) => unknown) =>
    select({ status: "ready", bundle, error: null, load: mocks.load }),
}));
vi.mock("@/features/home/components/BrandHeader", () => ({ BrandHeader: () => null }));
vi.mock("@/features/home/components/BannerCarousel", () => ({ BannerCarousel: () => null }));
vi.mock("@/features/home/components/CategoryGrid", () => ({ CategoryGrid: () => null }));
vi.mock("@/features/home/components/HorizontalRail", () => ({ HorizontalRail: () => null }));
vi.mock("@/features/home/components/SectionHeader", () => ({ SectionHeader: () => null }));
vi.mock("@/features/home/components/BestSellerCard", () => ({ BestSellerCard: () => null }));
vi.mock("@/features/home/components/ComboCard", () => ({ ComboCard: () => null }));
vi.mock("@/features/home/components/QuickReorderRail", () => ({ QuickReorderRail: () => null }));
vi.mock("@/features/home/components/HomeSkeleton", () => ({ HomeSkeleton: () => null }));
vi.mock("@/features/menu/components/CategoryPills", () => ({ CategoryPills: () => null }));
vi.mock("@/features/cart/components/FloatingCartBar", () => ({ FloatingCartBar: () => null }));
vi.mock("@/shared/hooks/useOnlineStatus", () => ({ useOnlineStatus: () => true }));
vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/shared/components/feedback/FailureState", () => ({ FailureState: () => null }));
vi.mock("@/shared/components/feedback/PetpoojaSyncPlaceholder", () => ({
  PetpoojaSyncPlaceholder: () => null,
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (opts: Record<string, unknown>) => ({
    ...opts,
    options: opts,
    _$path: path,
  }),
  useNavigate: () => mocks.navigate,
}));
vi.mock("@/features/stores/state/storeStore", () => ({
  useStoreSelection: (select: (s: unknown) => unknown) =>
    select({ activeStore: { id: "store-A", name: "Surat Vesu" }, isHydrated: true }),
}));
vi.mock("@/features/auth/state/authStore", () => {
  const authState = { user: { id: "cust_home" } };
  return {
    useAuthStore: Object.assign((select: (s: typeof authState) => unknown) => select(authState), {
      getState: () => authState,
    }),
    selectIsAuthenticated: () => true,
  };
});
vi.mock("@/core/state/appConfigStore", () => ({
  useAppConfig: (select: (s: { isOnline: boolean }) => unknown) => select({ isOnline: true }),
}));
vi.mock("@/features/orders/hooks/useReorderItems", () => ({
  useReorderItems: () => ({
    reorder: mocks.reorder,
    outOfStockModal: mocks.modalOpen
      ? { isOpen: true, unavailableItems: ["Burger"] }
      : { isOpen: false, unavailableItems: [] },
    confirmReorderRemaining: vi.fn(),
    dismissOutOfStockModal: vi.fn(),
  }),
}));
vi.mock("@/features/orders/repositories/OrderRepository", () => ({
  orderRepository: { getOrder: vi.fn(async () => ({ success: false })) },
}));

import { Route } from "./home";

const HomePage = (Route as unknown as { options: { component: React.ComponentType } }).options
  .component;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.modalOpen = true;
  mocks.navigate.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function mount() {
  await act(async () => root.render(<HomePage />));
  await act(async () => {});
}

describe("home quick reorder — out-of-stock modal consumer", () => {
  it("renders the modal with the unavailable item when the hook reports it open", async () => {
    await mount();
    expect(container.textContent).toContain("Some Items Unavailable");
    expect(container.textContent).toContain("Burger");
  });

  it("renders nothing when the hook reports it closed", async () => {
    mocks.modalOpen = false;
    await mount();
    expect(container.textContent).not.toContain("Some Items Unavailable");
  });
});
