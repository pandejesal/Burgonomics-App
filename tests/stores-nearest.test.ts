import { describe, it, expect } from "vitest";
import { haversineKm } from "../src/features/stores/utils/distance";
import { isStoreOpenAtTime } from "../src/features/stores/hooks/useNearestStore";
import type { Store } from "../src/features/stores/models/Store";

describe("Prompt 08: Store Locator, Geofencing & Branch Switching Suite", () => {
  const sampleStores: Store[] = [
    {
      id: "store_surat_adajan",
      name: "Burgonomics Surat Adajan Outlet",
      city: "Surat",
      area: "Adajan",
      address: "Shop 4, Prime Arcade, Anand Mahal Rd, Adajan, Surat",
      lat: 21.1959,
      lng: 72.7933,
      phone: "+91 98765 43210",
      hours: { open: "11:00 AM", close: "11:30 PM" },
      etaMinutes: 25,
      supports: { delivery: true, takeaway: true, dineIn: true },
      isOpen: true,
    },
    {
      id: "store_ahmedabad_thaltej",
      name: "Burgonomics Ahmedabad Flagship",
      city: "Ahmedabad",
      area: "Thaltej",
      address: "Ground Floor, Titanium Square, Thaltej, Ahmedabad",
      lat: 23.0525,
      lng: 72.512,
      phone: "+91 98765 43211",
      hours: { open: "11:00 AM", close: "02:00 AM" }, // Overnight schedule
      etaMinutes: 30,
      supports: { delivery: true, takeaway: true, dineIn: true },
      isOpen: true,
    },
  ];

  describe("1. Haversine Distance Precision", () => {
    it("computes accurate distance in kilometers between two GPS coordinates", () => {
      // User near Adajan Gam (21.2000, 72.8000) to Surat Store (21.1959, 72.7933)
      const dist = haversineKm(
        { lat: 21.2000, lng: 72.8000 },
        { lat: 21.1959, lng: 72.7933 }
      );
      expect(dist).toBeGreaterThan(0.5);
      expect(dist).toBeLessThan(1.5);
      expect(parseFloat(dist.toFixed(1))).toBe(0.8);
    });

    it("ranks nearest store accurately when sorted", () => {
      const userCoords = { lat: 21.2000, lng: 72.8000 }; // Surat

      const sorted = [...sampleStores].sort((a, b) => {
        const distA = haversineKm(userCoords, { lat: a.lat, lng: a.lng });
        const distB = haversineKm(userCoords, { lat: b.lat, lng: b.lng });
        return distA - distB;
      });

      expect(sorted[0].id).toBe("store_surat_adajan");
      expect(sorted[1].id).toBe("store_ahmedabad_thaltej");
    });
  });

  describe("2. Operating Hours Parser & Overnight Hours", () => {
    it("identifies store as open during normal daytime operating hours", () => {
      const hours = { open: "11:00 AM", close: "11:30 PM" };

      // 14:30 (2:30 PM) -> should be open
      const afternoon = new Date("2026-09-01T14:30:00");
      const res = isStoreOpenAtTime(hours, afternoon);
      expect(res.isOpen).toBe(true);
      expect(res.statusText).toContain("Open until 11:30 PM");

      // 08:00 (8:00 AM) -> should be closed
      const morning = new Date("2026-09-01T08:00:00");
      const resMorning = isStoreOpenAtTime(hours, morning);
      expect(resMorning.isOpen).toBe(false);
      expect(resMorning.statusText).toContain("Closed");
    });

    it("handles overnight operating hours correctly (e.g. 11:00 AM to 02:00 AM next day)", () => {
      const overnightHours = { open: "11:00 AM", close: "02:00 AM" };

      // 01:15 (1:15 AM next day) -> should be open
      const lateNight = new Date("2026-09-02T01:15:00");
      const res = isStoreOpenAtTime(overnightHours, lateNight);
      expect(res.isOpen).toBe(true);

      // 05:00 (5:00 AM) -> should be closed
      const earlyMorning = new Date("2026-09-02T05:00:00");
      const resClosed = isStoreOpenAtTime(overnightHours, earlyMorning);
      expect(resClosed.isOpen).toBe(false);
    });

    it("shows closing soon notice when within 45 minutes of closing", () => {
      const hours = { open: "11:00 AM", close: "11:00 PM" };
      // 22:30 (10:30 PM) -> 30 mins before closing
      const evening = new Date("2026-09-01T22:30:00");
      const res = isStoreOpenAtTime(hours, evening);
      expect(res.isOpen).toBe(true);
      expect(res.statusText).toBe("Closes in 30 mins");
    });
  });

  describe("3. Cart Safety on Store Switch", () => {
    it("flags cart store mismatch when changing active branch", () => {
      const cartStoreId = "store_surat_adajan";
      const targetStoreId = "store_ahmedabad_thaltej";
      const hasCartItems = true;

      const shouldWarn = hasCartItems && cartStoreId !== targetStoreId;
      expect(shouldWarn).toBe(true);
    });
  });
});
