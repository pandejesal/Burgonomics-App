import { describe, it, expect } from 'vitest';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface BranchGeofence {
  id: string;
  name: string;
  location: Coordinates;
  deliveryRadiusKm: number;
}

export function calculateDistanceKm(from: Coordinates, to: Coordinates): number {
  const R = 6371; // Earth radius in km
  const dLat = ((to.latitude - from.latitude) * Math.PI) / 180;
  const dLon = ((to.longitude - from.longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((from.latitude * Math.PI) / 180) *
      Math.cos((to.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export function checkGeofenceDeliverability(
  customerLocation: Coordinates,
  branch: BranchGeofence
): { isDeliverable: boolean; distanceKm: number; deliveryFee: number; reason?: string } {
  const distanceKm = calculateDistanceKm(branch.location, customerLocation);

  if (distanceKm > branch.deliveryRadiusKm) {
    return {
      isDeliverable: false,
      distanceKm,
      deliveryFee: 0,
      reason: `Location is ${distanceKm}km away (outside ${branch.deliveryRadiusKm}km delivery zone)`,
    };
  }

  // Delivery fee: ₹30 for <= 3km, +₹10/km thereafter
  const deliveryFee = distanceKm <= 3 ? 30 : 30 + Math.ceil(distanceKm - 3) * 10;

  return {
    isDeliverable: true,
    distanceKm,
    deliveryFee,
  };
}

describe('Customer App Core — Geofence Radius & Distance Fee Engine', () => {
  const branchSurat: BranchGeofence = {
    id: 'branch_surat_01',
    name: 'Burgonomics Vesu Flagship',
    location: { latitude: 21.1518, longitude: 72.7758 },
    deliveryRadiusKm: 8.0,
  };

  it('accepts customer location well within delivery radius with standard base fee (<=3km)', () => {
    // ~1.8km away
    const nearCustomer: Coordinates = { latitude: 21.1620, longitude: 72.7850 };
    const result = checkGeofenceDeliverability(nearCustomer, branchSurat);

    expect(result.isDeliverable).toBe(true);
    expect(result.distanceKm).toBeLessThanOrEqual(3.0);
    expect(result.deliveryFee).toBe(30);
  });

  it('calculates tiered delivery fee for extended distance (>3km and <=8km)', () => {
    // ~5.2km away
    const midCustomer: Coordinates = { latitude: 21.1900, longitude: 72.8050 };
    const result = checkGeofenceDeliverability(midCustomer, branchSurat);

    expect(result.isDeliverable).toBe(true);
    expect(result.distanceKm).toBeGreaterThan(3.0);
    expect(result.distanceKm).toBeLessThanOrEqual(8.0);
    const expectedFee = 30 + Math.ceil(result.distanceKm - 3) * 10;
    expect(result.deliveryFee).toBe(expectedFee);
  });

  it('strictly rejects customer location beyond branch delivery radius (>8km)', () => {
    // ~14.5km away in northern Surat
    const farCustomer: Coordinates = { latitude: 21.2700, longitude: 72.8600 };
    const result = checkGeofenceDeliverability(farCustomer, branchSurat);

    expect(result.isDeliverable).toBe(false);
    expect(result.distanceKm).toBeGreaterThan(8.0);
    expect(result.reason).toContain('outside 8km delivery zone');
  });
});
