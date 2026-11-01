/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { configureAuthUidSource } from "@/features/auth/utils/scopedPersistence";
import { useFavoritesStore } from "@/features/favorites/state/favoritesStore";
import type { Favorite } from "@/features/favorites/models";

// Standalone mount: the real Link needs a router context. Rendering it as an
// anchor keeps the DESTINATION under test (to / params / search) instead of
// mocking the rail's own logic away.
vi.mock("@tanstack/react-router", () => ({
  Link: (props: {
    to: string;
    params?: unknown;
    search?: unknown;
    children?: React.ReactNode;
    className?: string;
  }) => (
    <a
      data-to={props.to}
      data-params={JSON.stringify(props.params ?? null)}
      data-search={JSON.stringify(props.search ?? null)}
      className={props.className}
    >
      {props.children}
    </a>
  ),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

import { FavoritesRail, DEFAULT_FAVORITES_RAIL_LIMIT } from "./FavoritesRail";

// Real scoped store: account isolation is the store's job, so the rail is
// proven against the actual persistence scoping rather than a stub selector.
let uid: string | null = null;
let notify: (state: { user?: { id?: string } | null }) => void = () => undefined;
configureAuthUidSource({
  getUid: () => uid,
  subscribe: (listener) => {
    notify = listener;
    return () => undefined;
  },
});

function authenticate(nextUid: string | null) {
  uid = nextUid;
  notify({ user: uid ? { id: uid } : null });
}

const productFav: Favorite = {
  id: "fav-product",
  kind: "product",
  refId: "prod-1",
  name: "Classic Smash Burger",
  imageUrl: "/images/menu/classic-burgers/hero-burger.jpg",
  addedAt: 1,
};

const comboFav: Favorite = {
  id: "fav-combo",
  kind: "combo",
  refId: "combo-1",
  name: "Big Bang Meal",
  addedAt: 2,
};

const categoryFav: Favorite = {
  id: "fav-category",
  kind: "category",
  refId: "cat-real-burgers",
  name: "Burgers",
  addedAt: 3,
};

const fetchSpy = vi.fn();
let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderRail(props: { limit?: number } = {}): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const target = container;
  await act(async () => {
    root!.render(<FavoritesRail {...props} />);
  });
  return target;
}

/** Cards only: the SectionHeader "View all" link is also a Link. */
const cards = () =>
  Array.from(
    container!.querySelectorAll('[role="list"][aria-label="Your favourite items"] a'),
  ) as HTMLAnchorElement[];

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
  fetchSpy.mockClear();
  localStorage.clear();
  authenticate(null);
  useFavoritesStore.getState().clear();
});

afterEach(async () => {
  if (root) {
    const mounted = root;
    await act(async () => mounted.unmount());
  }
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("FavoritesRail — bounded, navigation-only favourites lane", () => {
  it("renders absolutely nothing (no heading, no placeholder) and performs no network call when empty", async () => {
    const el = await renderRail();

    expect(useFavoritesStore.getState().items).toEqual([]);
    expect(el.innerHTML).toBe("");
    expect(el.textContent).toBe("");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("links a product favourite to its product route using the stored refId", async () => {
    useFavoritesStore.getState().add(productFav);

    const el = await renderRail();
    const anchors = cards();

    expect(anchors).toHaveLength(1);
    expect(anchors[0].dataset.to).toBe("/menu/product/$productId");
    expect(JSON.parse(anchors[0].dataset.params ?? "null")).toEqual({ productId: "prod-1" });
    expect(el.textContent).toContain("Classic Smash Burger");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows the genuine stored image when one exists", async () => {
    useFavoritesStore.getState().add(productFav);

    const el = await renderRail();
    const images = Array.from(el.querySelectorAll("img"));

    expect(images).toHaveLength(1);
    expect(images[0].getAttribute("src")).toBe(productFav.imageUrl);
    // Decorative: the card already carries the name as its accessible text.
    expect(images[0].getAttribute("alt")).toBe("");
  });

  it("never substitutes a placeholder image when the favourite stores none", async () => {
    useFavoritesStore.getState().add(comboFav);

    const el = await renderRail();

    expect(cards()).toHaveLength(1);
    // SafeImage would inject its own placeholder graphic; the rail must not
    // claim a photo it does not have.
    expect(el.querySelectorAll("img")).toHaveLength(0);
  });

  it("links a category favourite to the menu using the real stored category id", async () => {
    useFavoritesStore.getState().add(categoryFav);

    const anchors = (await renderRail(), cards());

    expect(anchors).toHaveLength(1);
    expect(anchors[0].dataset.to).toBe("/menu");
    expect(JSON.parse(anchors[0].dataset.search ?? "null")).toEqual({
      category: "cat-real-burgers",
    });
  });

  it("links a combo favourite to the existing favourites page rather than inventing a mapping", async () => {
    useFavoritesStore.getState().add(comboFav);

    const anchors = (await renderRail(), cards());

    expect(anchors).toHaveLength(1);
    expect(anchors[0].dataset.to).toBe("/profile/favorites");
    expect(JSON.parse(anchors[0].dataset.params ?? "null")).toBeNull();
  });

  it("renders for ANY kind — a combo and category with no product still shows the lane", async () => {
    useFavoritesStore.getState().add(comboFav);
    useFavoritesStore.getState().add(categoryFav);

    const el = await renderRail();

    expect(cards()).toHaveLength(2);
    expect(el.textContent).toContain("Your favourites");
    expect(el.textContent).toContain("Big Bang Meal");
    expect(el.textContent).toContain("Burgers");
  });

  it("exposes the existing favourites route as the view-all affordance", async () => {
    useFavoritesStore.getState().add(productFav);

    const el = await renderRail();
    const anchors = Array.from(el.querySelectorAll("a")) as HTMLAnchorElement[];
    const viewAll = anchors.find((a) => a.textContent === "View all");

    expect(viewAll).toBeDefined();
    expect(viewAll!.dataset.to).toBe("/profile/favorites");
  });

  it("makes no add, stock or pricing claim anywhere in the lane", async () => {
    useFavoritesStore.getState().add(productFav);
    useFavoritesStore.getState().add(comboFav);

    const el = await renderRail();
    const text = el.textContent ?? "";

    // No action elements at all: navigation only.
    expect(el.querySelectorAll("button")).toHaveLength(0);
    expect(text).not.toMatch(/₹|\bRs\b|\bprice\b/i);
    expect(text).not.toMatch(/\badd\b/i);
    expect(text).not.toMatch(/sold out|out of stock|in stock|\b86\b/i);
  });

  it("bounds the lane to the default limit and displays no numeric count", async () => {
    for (let index = 0; index < 12; index += 1) {
      useFavoritesStore.getState().add({
        ...productFav,
        id: `fav-${index}`,
        refId: `prod-${index}`,
        name: `Item ${index}`,
      });
    }

    const el = await renderRail();

    expect(DEFAULT_FAVORITES_RAIL_LIMIT).toBe(8);
    expect(cards()).toHaveLength(8);
    // Newest first (the store prepends).
    expect(cards()[0].textContent).toContain("Item 11");
    expect(el.textContent).not.toMatch(/\d+\s+favourites?/i);
  });

  it("honours an explicit limit", async () => {
    useFavoritesStore.getState().add(productFav);
    useFavoritesStore.getState().add(comboFav);
    useFavoritesStore.getState().add(categoryFav);

    await renderRail({ limit: 2 });

    expect(cards()).toHaveLength(2);
  });

  it("drops the previous account's cards on the same commit as an account switch", async () => {
    authenticate("account-a");
    useFavoritesStore.getState().add(productFav);
    const el = await renderRail();
    expect(cards()).toHaveLength(1);

    await act(async () => {
      authenticate("account-b");
    });

    expect(cards()).toHaveLength(0);
    expect(el.textContent).toBe("");
  });

  it("hides immediately when the store is emptied while mounted", async () => {
    useFavoritesStore.getState().add(productFav);
    const el = await renderRail();
    expect(cards()).toHaveLength(1);

    await act(async () => {
      useFavoritesStore.getState().clear();
    });

    expect(cards()).toHaveLength(0);
    expect(el.textContent).toBe("");
  });
});
