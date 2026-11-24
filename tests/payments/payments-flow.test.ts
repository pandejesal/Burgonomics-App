import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDocs, mockSetDoc, mockUpdateDoc, server, authState } = vi.hoisted(() => ({
  mockGetDocs: vi.fn(),
  mockSetDoc: vi.fn(),
  mockUpdateDoc: vi.fn(),
  server: { calls: [] as Array<{ url: string; body: any }> },
  authState: { currentUser: { uid: "test_user_001" } },
}));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: mockGetDocs,
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  setDoc: mockSetDoc,
  updateDoc: mockUpdateDoc,
  deleteDoc: vi.fn(),
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));
vi.mock("firebase/app", () => ({ initializeApp: vi.fn(), getApps: vi.fn(() => []) }));
vi.mock("../../src/core/config/firebase", () => ({
  auth: {
    get currentUser() {
      return authState.currentUser;
    },
  },
  db: {},
}));
vi.mock("../../src/core/config/functionsBase", () => ({
  defaultFunctionsBase: () => "https://fn.test/api",
}));
vi.mock("../../src/core/network/httpClient", () => ({
  httpClient: {
    post: async (url: string, body: any) => {
      server.calls.push({ url, body });
      return { data: { orderId: body?.orderId, alreadyCancelled: false } };
    },
  },
}));

import { ordersService, resolveStatus } from "../../src/features/orders/services/ordersService";

let sequence = 0;
beforeEach(() => {
  vi.clearAllMocks();
  server.calls.length = 0;
  authState.currentUser = { uid: `test_user_${++sequence}` };
});
async function seedServerOrder(id: string) {
  const order = {
    id,
    userId: authState.currentUser.uid,
    customerId: authState.currentUser.uid,
    fulfillment: "delivery",
    status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
    store: { id: "branch_01", name: "Test Outlet" },
    items: [],
    totals: { grandTotal: 500 },
    payment: { method: "cod", status: "pending" },
    placedAt: new Date().toISOString(),
  };
  mockGetDocs.mockResolvedValueOnce({
    forEach: (cb: (doc: { data: () => unknown }) => void) => cb({ data: () => order }),
  });
  const listed = await ordersService.listOrders();
  expect(listed.success).toBe(true);
}

describe("server-first cancellation", () => {
  it("cancels a live server order without a client Firestore write", async () => {
    await seedServerOrder("ord_cancel_flow");
    const result = await ordersService.cancelOrder("ord_cancel_flow");
    expect(result.success).toBe(true);
    expect(result.data?.status).toMatchObject({ code: "CANCELLED", terminal: true });
    expect(server.calls).toHaveLength(1);
    expect(server.calls[0]).toMatchObject({
      url: "https://fn.test/api/orders/customerCancel",
      body: { orderId: "ord_cancel_flow" },
    });
    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it("keeps a terminal retry local with no second server call or write", async () => {
    await seedServerOrder("ord_cancel_terminal");
    await ordersService.cancelOrder("ord_cancel_terminal");
    const result = await ordersService.cancelOrder("ord_cancel_terminal");
    expect(result.success).toBe(true);
    if (result.data) expect(result.data.status.code).toBe("CANCELLED");
    expect(server.calls).toHaveLength(1);
    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
    expect(resolveStatus("DELIVERED").terminal).toBe(true);
  });
});
