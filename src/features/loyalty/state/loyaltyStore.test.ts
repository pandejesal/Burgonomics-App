import { describe, it, expect, vi, beforeEach } from "vitest";

// Loop 65/120: the loyalty balance is a cache of server truth, never minted
// locally. Guards: no phantom default, server refresh wins, guests zero,
// failures keep last (never invent).
const { mockGetDoc } = vi.hoisted(() => ({ mockGetDoc: vi.fn() }));

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    doc: vi.fn((...args: unknown[]) => args),
    getDoc: mockGetDoc,
  };
});

import { useLoyaltyStore } from "./loyaltyStore";

describe("Loop 65: loyalty balance follows the server", () => {
  beforeEach(() => {
    mockGetDoc.mockReset();
    useLoyaltyStore.setState({ balance: 0, lastSyncedAt: null });
  });

  it("defaults to zero — no phantom points", () => {
    expect(useLoyaltyStore.getState().balance).toBe(0);
  });

  it("refresh adopts the server balance, even downward", async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ loyaltyPoints: 320 }),
    });
    await useLoyaltyStore.getState().refreshFromServer("cust_1");
    expect(useLoyaltyStore.getState().balance).toBe(320);

    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ loyaltyPoints: 120 }),
    });
    await useLoyaltyStore.getState().refreshFromServer("cust_1");
    expect(useLoyaltyStore.getState().balance).toBe(120);
  });

  it("floors guests and missing docs to zero", async () => {
    await useLoyaltyStore.getState().refreshFromServer(null);
    expect(useLoyaltyStore.getState().balance).toBe(0);
    expect(mockGetDoc).not.toHaveBeenCalled();

    mockGetDoc.mockResolvedValueOnce({ exists: () => false, data: () => ({}) });
    await useLoyaltyStore.getState().refreshFromServer("cust_ghost");
    expect(useLoyaltyStore.getState().balance).toBe(0);
  });

  it("keeps the last value when the lookup fails, never invents", async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ loyaltyPoints: 200 }),
    });
    await useLoyaltyStore.getState().refreshFromServer("cust_1");
    mockGetDoc.mockRejectedValueOnce(new Error("offline"));
    await useLoyaltyStore.getState().refreshFromServer("cust_1");
    expect(useLoyaltyStore.getState().balance).toBe(200);
  });
});
