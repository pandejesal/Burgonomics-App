/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { useMenuStore } from "@/features/menu/state/menuStore";
import { useSearchStore } from "@/features/menu/state/searchStore";

describe("probe", () => {
  it("imports firebase-backed stores without network", () => {
    useMenuStore.setState({ categories: [], activeCategoryId: undefined });
    useSearchStore.setState({ kind: "all" });
    expect(useMenuStore.getState().status).toBe("idle");
    expect(useSearchStore.getState().kind).toBe("all");
  });
});
