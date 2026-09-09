import { describe, it, expect } from "vitest";

// Guards the B5-S2 support-honesty contract: no seeded tickets, no mock
// content, SLA copy gated on the backend field, no base64 photo payloads.

import * as hookModule from "../src/features/support/hooks/useCustomerTickets";
import {
  isRemotePhotoUrl,
  sanitizeCachedTickets,
} from "../src/features/support/hooks/useCustomerTickets";
import { extractSlaMinutes } from "../src/features/support/services/supportService";

describe("support honesty (B5-S2)", () => {
  it("exports no mock/seed ticket fixtures", () => {
    expect("INITIAL_MOCK_TICKETS" in hookModule).toBe(false);
    expect("MOCK_TICKETS" in hookModule).toBe(false);
    expect("MOCK_FAQS" in hookModule).toBe(false);
  });

  it("starts from [] on empty/corrupt cache (no seeded resolved ticket)", () => {
    expect(sanitizeCachedTickets(null)).toEqual([]);
    expect(sanitizeCachedTickets(undefined)).toEqual([]);
    expect(sanitizeCachedTickets({})).toEqual([]);
    expect(sanitizeCachedTickets("TKT-84920")).toEqual([]);
    expect(sanitizeCachedTickets([])).toEqual([]);
  });

  it("drops invalid cached entries but keeps valid server-confirmed shapes", () => {
    const valid = {
      id: "tkt_abc",
      ticketNumber: "TKT-12345",
      category: "OTHER",
      categoryLabel: "General Query or Feedback",
      description: "My burger was cold on arrival today.",
      photos: [],
      status: "OPEN",
      priority: "normal",
      escalationLevel: 1,
      createdAt: new Date().toISOString(),
      slaMinutes: 15,
    };
    const out = sanitizeCachedTickets([valid, { nope: true }, null, 42]);
    expect(out).toHaveLength(1);
    expect(out[0].ticketNumber).toBe("TKT-12345");
    expect(out[0].slaMinutes).toBe(15);
  });

  it("strips base64 data-URL photos and keeps only remote https URLs", () => {
    expect(isRemotePhotoUrl("https://cdn.example/p.jpg")).toBe(true);
    expect(isRemotePhotoUrl("data:image/jpeg;base64,AAAA")).toBe(false);
    expect(isRemotePhotoUrl("http://cdn.example/p.jpg")).toBe(false);
    expect(isRemotePhotoUrl(undefined)).toBe(false);

    const ticket = {
      id: "tkt_x",
      ticketNumber: "TKT-X",
      categoryLabel: "Support request",
      description: "Cold burger, photo attached as evidence.",
      photos: ["data:image/jpeg;base64,AAAA", "https://cdn.example/keep.jpg"],
      status: "OPEN",
      createdAt: new Date().toISOString(),
    };
    const out = sanitizeCachedTickets([ticket]);
    expect(out[0].photos).toEqual(["https://cdn.example/keep.jpg"]);
  });

  it("normalizes absent/invalid backend SLA to null (no invented SLA)", () => {
    const ticket = {
      id: "tkt_y",
      ticketNumber: "TKT-Y",
      categoryLabel: "Support request",
      description: "Late delivery complaint with details.",
      photos: [],
      status: "OPEN",
      createdAt: new Date().toISOString(),
      slaMinutes: 0,
    };
    expect(sanitizeCachedTickets([ticket])[0].slaMinutes).toBeNull();
  });

  it("extractSlaMinutes reads backend field variants, else null", () => {
    expect(extractSlaMinutes({ slaMinutes: 15 })).toBe(15);
    expect(extractSlaMinutes({ sla_minutes: 30 })).toBe(30);
    expect(extractSlaMinutes({ responseSlaMinutes: 10 })).toBe(10);
    expect(extractSlaMinutes({ ticket: { slaMinutes: 20 } })).toBe(20);
    expect(extractSlaMinutes({})).toBeNull();
    expect(extractSlaMinutes(null)).toBeNull();
    expect(extractSlaMinutes(undefined)).toBeNull();
    expect(extractSlaMinutes({ slaMinutes: 0 })).toBeNull();
    expect(extractSlaMinutes({ slaMinutes: -5 })).toBeNull();
    expect(extractSlaMinutes({ slaMinutes: Number.NaN })).toBeNull();
  });
});
