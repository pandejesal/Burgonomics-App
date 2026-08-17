import { describe, it, expect } from "vitest";
import {
  scrubUserProfile,
  scrubOrderData,
  scrubAccountData,
  getOrderScrubUpdatePayload,
} from "../netlify/functions/lib/account-scrub";

describe("account-scrub pure logic", () => {
  it("scrubs all PII fields from user profile while retaining generic record metadata", () => {
    const profile = {
      id: "usr_9981",
      name: "Bruce Wayne",
      phone: "+91 9876543210",
      email: "bruce@waynecorp.com",
      photoURL: "https://example.com/avatar.jpg",
      avatarUrl: "https://example.com/avatar.jpg",
      addresses: [{ id: "addr_1", line1: "1007 Mountain Drive", city: "Gotham" }],
      loyaltyPoints: 450,
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    const scrubbed = scrubUserProfile(profile);

    expect(scrubbed.name).toBe("Deleted User");
    expect(scrubbed.phone).toBe("");
    expect(scrubbed.email).toBe("");
    expect(scrubbed.photoURL).toBeNull();
    expect(scrubbed.avatarUrl).toBeNull();
    expect(scrubbed.addresses).toEqual([]);
    expect(scrubbed.anonymized).toBe(true);

    // Business & ledger data preserved
    expect(scrubbed.id).toBe("usr_9981");
    expect(scrubbed.loyaltyPoints).toBe(450);
    expect(scrubbed.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("scrubs order PII while preserving financial ledger fields and items", () => {
    const order = {
      id: "ord_1001",
      userId: "usr_9981",
      customerName: "Bruce Wayne",
      customerPhone: "+91 9876543210",
      customerEmail: "bruce@waynecorp.com",
      address: { line1: "1007 Mountain Drive", city: "Gotham", pin: "380015" },
      deliveryPartner: { name: "Rider Alex", phone: "+91 9999988888" },
      notes: "Ring the secret bell at gate 2",
      fulfillmentInstructions: "Leave with Alfred",
      meta: { deviceIp: "192.168.1.1" },
      items: [{ id: "item_burger_1", name: "Double Truffle Smash", price: 349, quantity: 2 }],
      total: 698,
      status: "COMPLETED",
      paymentStatus: "Paid",
      placedAt: "2026-02-15T12:00:00.000Z",
    };

    const scrubbed = scrubOrderData(order, { anonymizedAt: "2026-08-17T12:00:00.000Z" });

    expect(scrubbed.anonymized).toBe(true);
    expect(scrubbed.anonymizedAt).toBe("2026-08-17T12:00:00.000Z");
    expect(scrubbed.customerName).toBe("Deleted User");
    expect(scrubbed.customerPhone).toBe("");
    expect(scrubbed.customerEmail).toBe("");
    expect(scrubbed.address).toBeUndefined();
    expect(scrubbed.deliveryPartner).toBeUndefined();
    expect(scrubbed.notes).toBeUndefined();
    expect(scrubbed.fulfillmentInstructions).toBeUndefined();
    expect(scrubbed.meta).toBeUndefined();

    // Financial & order integrity fields preserved
    expect(scrubbed.id).toBe("ord_1001");
    expect(scrubbed.userId).toBe("usr_9981");
    expect(scrubbed.items).toHaveLength(1);
    expect(scrubbed.total).toBe(698);
    expect(scrubbed.status).toBe("COMPLETED");
    expect(scrubbed.paymentStatus).toBe("Paid");
  });

  it("is idempotent: scrubbing an already scrubbed record yields identical results", () => {
    const profile = {
      name: "Clark Kent",
      phone: "+91 1234567890",
      email: "clark@dailyplanet.com",
    };

    const firstPass = scrubUserProfile(profile);
    const secondPass = scrubUserProfile(firstPass);

    expect(firstPass).toEqual(secondPass);

    const order = {
      id: "ord_2002",
      customerName: "Clark Kent",
      notes: "Deliver fast",
      total: 250,
    };

    const firstOrderPass = scrubOrderData(order, { anonymizedAt: "2026-08-17T12:00:00.000Z" });
    const secondOrderPass = scrubOrderData(firstOrderPass, {
      anonymizedAt: "2026-08-17T12:00:00.000Z",
    });

    expect(firstOrderPass).toEqual(secondOrderPass);
  });

  it("generates correct Firestore update dictionary for server-side updates", () => {
    const serverTimestampSentinel = { __type: "serverTimestamp" };
    const deleteFieldSentinel = { __type: "deleteField" };

    const payload = getOrderScrubUpdatePayload(serverTimestampSentinel, deleteFieldSentinel);

    expect(payload).toEqual({
      anonymized: true,
      anonymizedAt: serverTimestampSentinel,
      address: deleteFieldSentinel,
      deliveryPartner: deleteFieldSentinel,
      notes: deleteFieldSentinel,
      fulfillmentInstructions: deleteFieldSentinel,
      meta: deleteFieldSentinel,
    });
  });

  it("composite scrubAccountData scrubs both user profile and order array", () => {
    const user = { name: "Diana Prince", phone: "+91 9119119110", email: "diana@themyscira.gov" };
    const orders = [
      { id: "ord_1", customerName: "Diana Prince", notes: "Amazonian feast", total: 990 },
      { id: "ord_2", customerName: "Diana Prince", notes: "Extra olives", total: 450 },
    ];

    const result = scrubAccountData(user, orders, { anonymizedAt: "2026-08-17T12:00:00.000Z" });

    expect(result.user.name).toBe("Deleted User");
    expect(result.user.phone).toBe("");
    expect(result.orders).toHaveLength(2);
    expect(result.orders[0].customerName).toBe("Deleted User");
    expect(result.orders[0].notes).toBeUndefined();
    expect(result.orders[1].customerName).toBe("Deleted User");
    expect(result.orders[1].notes).toBeUndefined();
  });
});
