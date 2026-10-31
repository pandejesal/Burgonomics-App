/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeBundle } from "@/features/home/models";
import { fail, type ApiResult } from "@/core/network/http";

const fixture = vi.hoisted(() => ({
  navigate: vi.fn(),
  reorder: vi.fn(),
  getHome: vi.fn(),
  storeId: "store-B" as string | null,
  userId: null as string | null,
  activeStore: null as { id: string } | null,
  activeStoreId: null as string | null,
  authUser: null as { id: string } | null,
  authUserId: null as string | null,
  isHydrated: true,
  favoriteName: null as string | null,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  useNavigate: () => fixture.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/shared/hooks/useOnlineStatus", () => ({ useOnlineStatus: vi.fn() }));
vi.mock("@/core/state/appConfigStore", () => ({
  useAppConfig: (selector: (state: { isOnline: boolean }) => unknown) =>
    selector({ isOnline: true }),
}));
vi.mock("@/features/stores/state/storeStore", () => ({
  useStoreSelection: (
    selector: (state: { activeStore: { id: string } | null; isHydrated: boolean }) => unknown,
  ) => {
    // Zustand returns a stable store object; identity churn here would retrigger load effects.
    if (fixture.activeStoreId !== fixture.storeId) {
      fixture.activeStoreId = fixture.storeId;
      fixture.activeStore = fixture.storeId ? { id: fixture.storeId } : null;
    }
    return selector({ activeStore: fixture.activeStore, isHydrated: fixture.isHydrated });
  },
}));
vi.mock("@/features/auth/state/authStore", () => ({
  selectIsAuthenticated: (state: { user: { id: string } | null }) => Boolean(state.user),
  useAuthStore: Object.assign(
    (selector: (state: { user: { id: string } | null }) => unknown) => {
      if (fixture.authUserId !== fixture.userId) {
        fixture.authUserId = fixture.userId;
        fixture.authUser = fixture.userId ? { id: fixture.userId } : null;
      }
      return selector({ user: fixture.authUser });
    },
    {
      getState: () => ({
        user: fixture.userId ? { id: fixture.userId } : null,
      }),
    },
  ),
}));
vi.mock("@/features/orders/hooks/useReorderItems", () => ({
  useReorderItems: () => ({ reorder: fixture.reorder }),
}));
vi.mock("@/features/orders/repositories/OrderRepository", () => ({
  orderRepository: { getOrder: vi.fn() },
}));
vi.mock("@/features/cart/components/FloatingCartBar", () => ({ FloatingCartBar: () => null }));
vi.mock("@/features/home/components/BrandHeader", () => ({ BrandHeader: () => null }));
vi.mock("@/features/home/components/BannerCarousel", () => ({ BannerCarousel: () => null }));
vi.mock("@/features/home/components/CategoryGrid", () => ({
  CategoryGrid: ({ categories }: { categories: { id: string; name: string }[] }) => (
    <div>{categories.map(({ id, name }) => `${id}:${name}`).join(",")}</div>
  ),
}));
vi.mock("@/features/home/components/HorizontalRail", () => ({
  HorizontalRail: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/features/home/components/SectionHeader", () => ({ SectionHeader: () => null }));
vi.mock("@/features/home/components/BestSellerCard", () => ({ BestSellerCard: () => null }));
vi.mock("@/features/home/components/ComboCard", () => ({ ComboCard: () => null }));
vi.mock("@/features/home/components/FavoritesRail", () => ({
  FavoritesRail: () =>
    fixture.favoriteName ? (
      <section aria-label="Your favourites">{fixture.favoriteName}</section>
    ) : null,
}));
vi.mock("@/features/home/components/QuickReorderRail", () => ({ QuickReorderRail: () => null }));
vi.mock("@/features/home/components/HomeSkeleton", () => ({
  HomeSkeleton: () => <div>Home loading</div>,
}));
vi.mock("@/shared/components/feedback/FailureState", () => ({
  FailureState: ({ title, message }: { title?: string; message?: string }) => (
    <div role="alert">
      {title}
      {message}
    </div>
  ),
}));
vi.mock("@/shared/components/feedback/PetpoojaSyncPlaceholder", () => ({
  PetpoojaSyncPlaceholder: () => <div>Outlet menu not published</div>,
}));
vi.mock("@/features/home/repositories/HomeRepository", () => ({
  homeRepository: { getHome: fixture.getHome },
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

import { useHomeStore } from "@/features/home/state/homeStore";
import { Route } from "./home";

const HomePage = (
  Route as unknown as {
    options: { component: React.ComponentType };
  }
).options.component;

function bundle(categoryId: string, categoryName: string): HomeBundle {
  return {
    banners: [],
    categories: [{ id: categoryId, name: categoryName, order: 1, itemCount: 2 }],
    featuredOffers: [],
    bestSellers: [],
    popularCombos: [],
    recommendations: [],
    recentlyViewed: [],
    quickReorder: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

/** Capture the true first commit inside act, then let passive load effects settle. */
async function mountFirstCommit(): Promise<string> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  let firstCommit = "";
  await act(async () => {
    flushSync(() => root!.render(<HomePage />));
    firstCommit = container!.textContent ?? "";
  });
  return firstCommit;
}

afterEach(async () => {
  const mountedRoot = root;
  if (mountedRoot) await act(async () => mountedRoot.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

beforeEach(() => {
  useHomeStore.getState().reset();
  fixture.navigate.mockReset();
  fixture.reorder.mockReset();
  fixture.getHome.mockReset();
  fixture.getHome.mockImplementation(() => new Promise<ApiResult<HomeBundle>>(() => {}));
  fixture.storeId = "store-B";
  fixture.userId = null;
  fixture.activeStore = null;
  fixture.activeStoreId = null;
  fixture.authUser = null;
  fixture.authUserId = null;
  fixture.isHydrated = true;
  fixture.favoriteName = null;
});

describe("Home route scope guard", () => {
  it("includes the conditional favourites surface inside the ready Home body", async () => {
    fixture.favoriteName = "An existing saved favourite";
    useHomeStore.setState({
      status: "ready",
      bundle: bundle("store-B-category", "Store B Burgers"),
      lastLoadedStoreId: "store-B",
      lastLoadedUserId: null,
      error: null,
    });
    const firstCommit = await mountFirstCommit();
    expect(firstCommit).toContain("An existing saved favourite");
  });

  it("does not mount favourites while the outlet result is loading", async () => {
    fixture.favoriteName = "A saved favourite";
    const firstCommit = await mountFirstCommit();
    expect(firstCommit).toContain("Home loading");
    expect(firstCommit).not.toContain("A saved favourite");
  });

  it("does not paint store A's bundle on the first commit after switching to store B", async () => {
    fixture.storeId = "store-B";
    useHomeStore.setState({
      status: "ready",
      bundle: bundle("store-A-category", "Store A Burgers"),
      lastLoadedStoreId: "store-A",
      lastLoadedUserId: null,
      error: null,
    });

    const firstCommit = await mountFirstCommit();

    expect(firstCommit).toContain("Home loading");
    expect(firstCommit).not.toContain("store-A-category:Store A Burgers");
    expect(firstCommit).not.toContain("Outlet menu not published");
    expect(fixture.getHome).toHaveBeenCalledWith("store-B", undefined);
    expect(container!.textContent).not.toContain("store-A-category:Store A Burgers");
  });

  it("does not paint the previous user's data on the first commit after the user changes", async () => {
    fixture.storeId = "store-A";
    fixture.userId = "user-b";
    useHomeStore.setState({
      status: "ready",
      bundle: {
        ...bundle("store-A-category", "Store A Burgers"),
        quickReorder: [
          {
            id: "user-a-order",
            orderId: "order-a",
            title: "A's previous order",
            subtitle: "Private to A",
            total: 300,
            placedAt: "2026-10-29T00:00:00.000Z",
          },
        ],
      },
      lastLoadedStoreId: "store-A",
      lastLoadedUserId: "user-a",
      error: null,
    });

    const firstCommit = await mountFirstCommit();

    expect(firstCommit).toContain("Home loading");
    expect(firstCommit).not.toContain("store-A-category:Store A Burgers");
    expect(firstCommit).not.toContain("A's previous order");
    expect(fixture.getHome).toHaveBeenCalledWith("store-A", "user-b");
  });

  it("paints a matching store/user result, confirming the guard is not a blanket empty state", async () => {
    fixture.storeId = "store-A";
    fixture.userId = "user-a";
    useHomeStore.setState({
      status: "ready",
      bundle: bundle("store-A-category", "Store A Burgers"),
      lastLoadedStoreId: "store-A",
      lastLoadedUserId: "user-a",
      error: null,
    });

    const firstCommit = await mountFirstCommit();

    expect(firstCommit).toContain("store-A-category:Store A Burgers");
    expect(firstCommit).not.toContain("Home loading");
  });

  it("shows an explicit failure even when an older same-scope bundle is still in state", async () => {
    fixture.storeId = "store-A";
    useHomeStore.setState({
      status: "ready",
      bundle: bundle("store-A-category", "Store A Burgers"),
      lastLoadedStoreId: "store-A",
      lastLoadedUserId: null,
      error: null,
    });
    await mountFirstCommit();

    await act(async () => {
      useHomeStore.setState({
        status: "error",
        error: "Refresh failed",
        bundle: bundle("store-A-category", "Store A Burgers"),
        lastLoadedStoreId: "store-A",
        lastLoadedUserId: null,
      });
    });

    expect(container!.textContent).toContain("We couldn't load Home");
    expect(container!.textContent).toContain("Refresh failed");
    expect(container!.textContent).not.toContain("store-A-category:Store A Burgers");
  });

  it("shows no A data after A was ready and B's load fails", async () => {
    fixture.storeId = "store-B";
    useHomeStore.setState({
      status: "ready",
      bundle: bundle("store-A-category", "Store A Burgers"),
      lastLoadedStoreId: "store-A",
      lastLoadedUserId: null,
      error: null,
    });
    const pendingB = deferred<ApiResult<HomeBundle>>();
    fixture.getHome.mockReturnValueOnce(pendingB.promise);

    const firstCommit = await mountFirstCommit();
    expect(firstCommit).not.toContain("store-A-category:Store A Burgers");
    expect(useHomeStore.getState()).toMatchObject({
      status: "loading",
      bundle: null,
      lastLoadedStoreId: null,
      lastLoadedUserId: null,
    });

    await act(async () => {
      pendingB.resolve(fail("MENU_FETCH_FAILED", "Store B menu unavailable"));
      await pendingB.promise;
    });

    expect(container!.textContent).toContain("Store B menu unavailable");
    expect(container!.textContent).not.toContain("store-A-category");
    expect(container!.textContent).not.toContain("Home loading");
    expect(useHomeStore.getState()).toMatchObject({
      status: "error",
      bundle: null,
      lastLoadedStoreId: null,
    });
  });
});
