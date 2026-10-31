/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

// Browser-bound collaborators: keep the suite hermetic (no Firebase/network,
// no sonner DOM). Only the component under test talks to these stubs.
vi.mock("@/features/favorites/repositories/FavoritesRepository", () => ({
  favoritesRepository: { toggle: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { FavoriteHeart } from "./FavoriteHeart";
import { favoritesRepository } from "@/features/favorites/repositories/FavoritesRepository";
import { useFavoritesStore } from "@/features/favorites/state/favoritesStore";
import { toast } from "sonner";
import { fail } from "@/core/network/http";

const toggle = vi.mocked(favoritesRepository.toggle);

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;
let host: HTMLDivElement | null = null;

const render = (ui: React.ReactElement): HTMLElement => {
  const el = document.createElement("div");
  el.innerHTML = renderToStaticMarkup(ui);
  document.body.append(el);
  return el;
};

const mount = async (ui: React.ReactElement) => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(ui));
};

beforeEach(() => {
  // jsdom has no matchMedia; motion reads it for prefers-reduced-motion.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  useFavoritesStore.setState({ items: [] });
  vi.clearAllMocks();
});

afterEach(async () => {
  const mountedRoot = root;
  if (mountedRoot) await act(async () => mountedRoot.unmount());
  root = null;
  host = null;
  document.body.innerHTML = "";
});

describe("B04: FavoriteHeart 44px target with an unchanged 36px disc", () => {
  it("keeps the visual disc/icon at 36px/16px while the button takes the 44px hit area", () => {
    const el = render(<FavoriteHeart kind="product" refId="prod_1" name="Classic Smash Burger" />);
    const button = el.querySelector<HTMLButtonElement>("button")!;

    expect(button.className).toContain("h-11");
    expect(button.className).toContain("w-11");

    const disc = button.firstElementChild as HTMLElement;
    expect(disc.tagName).toBe("SPAN");
    expect(disc.className).toContain("h-9");
    expect(disc.className).toContain("w-9");
    expect(disc.className).toContain("bg-surface/90");

    const icon = disc.querySelector("svg")!;
    expect(icon.getAttribute("class")).toContain("h-4 w-4");
    expect(icon.getAttribute("aria-hidden")).toBe("true");
  });

  it("exposes a pressed state and a name that names the product", () => {
    const el = render(<FavoriteHeart kind="product" refId="prod_1" name="Classic Smash Burger" />);
    const button = el.querySelector<HTMLButtonElement>("button")!;

    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.getAttribute("aria-label")).toBe("Add Classic Smash Burger to favourites");
    expect(button.querySelector("svg")!.getAttribute("class")).not.toContain("fill-current");
  });

  it("mirrors live favourited state: pressed label, remove wording, filled heart", async () => {
    useFavoritesStore.setState({
      items: [
        { id: "fav_1", kind: "product", refId: "prod_1", name: "Classic Smash Burger", addedAt: 1 },
      ],
    });

    // Client render: zustand v5 hands the *initial* state to server snapshots,
    // so only a mounted tree can reflect the store.
    await mount(<FavoriteHeart kind="product" refId="prod_1" name="Classic Smash Burger" />);
    const button = host!.querySelector<HTMLButtonElement>("button")!;

    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("aria-label")).toBe("Remove Classic Smash Burger from favourites");
    expect(button.querySelector("svg")!.getAttribute("class")).toContain("fill-current");
  });

  it("toggles through the repository once (busy guard) and reports failures", async () => {
    let release: (value: Awaited<ReturnType<typeof favoritesRepository.toggle>>) => void = () => {};
    toggle.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }) as ReturnType<typeof favoritesRepository.toggle>,
    );

    await mount(
      <FavoriteHeart
        kind="product"
        refId="prod_1"
        name="Classic Smash Burger"
        priceLabel="₹299.00"
      />,
    );
    const button = host!.querySelector<HTMLButtonElement>("button")!;

    await act(async () => button.click());
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(toggle).toHaveBeenCalledWith({
      kind: "product",
      refId: "prod_1",
      name: "Classic Smash Burger",
      imageUrl: undefined,
      fallbackImageUrl: undefined,
      priceLabel: "₹299.00",
    });

    // A second tap while the first is still in flight must not double-submit.
    await act(async () => button.click());
    expect(toggle).toHaveBeenCalledTimes(1);

    await act(async () => release(fail("WRITE_FAILED", "Couldn't update favourites")));
    expect(toast.error).toHaveBeenCalledWith("Couldn't update favourites");
  });

  it("confirms a successful toggle with a toast", async () => {
    toggle.mockResolvedValue({ success: true, data: { favorited: true } });

    await mount(<FavoriteHeart kind="product" refId="prod_1" name="Classic Smash Burger" />);
    const button = host!.querySelector<HTMLButtonElement>("button")!;

    await act(async () => button.click());
    expect(toast.success).toHaveBeenCalledWith("Added to favourites");
  });
});
