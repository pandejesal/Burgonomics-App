import { describe, it, expect } from 'vitest';

export interface TrackingPoint {
  lat: number;
  lng: number;
}

export interface RiderLiveLocation {
  riderLat: number;
  riderLng: number;
  progressPercent: number;
  etaMinutes: number;
}

/**
 * Calculates linear interpolation for rider position along delivery path with ETA estimation.
 */
export function interpolateRiderPosition(
  origin: TrackingPoint,
  destination: TrackingPoint,
  progressRatio: number, // 0.0 to 1.0
  totalTripMinutes = 20
): RiderLiveLocation {
  const clampedProgress = Math.max(0, Math.min(1, progressRatio));
  const riderLat = origin.lat + (destination.lat - origin.lat) * clampedProgress;
  const riderLng = origin.lng + (destination.lng - origin.lng) * clampedProgress;
  const remainingRatio = 1 - clampedProgress;
  const etaMinutes = Math.max(1, Math.round(totalTripMinutes * remainingRatio));

  return {
    riderLat: Number(riderLat.toFixed(6)),
    riderLng: Number(riderLng.toFixed(6)),
    progressPercent: Math.round(clampedProgress * 100),
    etaMinutes,
  };
}

export interface PastOrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  selectedAddons?: { id: string; name: string; price: number }[];
}

export interface ProductCatalogItem {
  id: string;
  name: string;
  price: number;
  inStock: boolean;
}

export interface ReorderResult {
  canReorderAll: boolean;
  validItems: PastOrderItem[];
  outOfStockItems: string[];
  priceChangedItems: { name: string; oldPrice: number; newPrice: number }[];
}

/**
 * Validates a past order for 1-Tap Reorder against current live branch catalog.
 */
export function validate1TapReorder(
  pastItems: PastOrderItem[],
  liveCatalog: ProductCatalogItem[]
): ReorderResult {
  const catalogMap = new Map<string, ProductCatalogItem>(
    liveCatalog.map((item) => [item.id, item])
  );

  const validItems: PastOrderItem[] = [];
  const outOfStockItems: string[] = [];
  const priceChangedItems: { name: string; oldPrice: number; newPrice: number }[] = [];

  for (const item of pastItems) {
    const liveItem = catalogMap.get(item.productId);
    if (!liveItem || !liveItem.inStock) {
      outOfStockItems.push(item.name);
      continue;
    }

    if (liveItem.price !== item.price) {
      priceChangedItems.push({
        name: item.name,
        oldPrice: item.price,
        newPrice: liveItem.price,
      });
    }

    validItems.push({
      ...item,
      price: liveItem.price,
    });
  }

  return {
    canReorderAll: outOfStockItems.length === 0,
    validItems,
    outOfStockItems,
    priceChangedItems,
  };
}

describe('Customer App — Live Tracking & 1-Tap Reorder Suite', () => {
  describe('interpolateRiderPosition', () => {
    const branchCoords = { lat: 23.0131, lng: 72.5085 }; // CG Road Branch
    const dropCoords = { lat: 23.0338, lng: 72.5262 }; // Customer Address

    it('returns exact branch origin at 0% progress with full ETA', () => {
      const result = interpolateRiderPosition(branchCoords, dropCoords, 0, 20);
      expect(result.riderLat).toBe(23.0131);
      expect(result.riderLng).toBe(72.5085);
      expect(result.progressPercent).toBe(0);
      expect(result.etaMinutes).toBe(20);
    });

    it('interpolates midpoint accurately at 50% progress with halved ETA', () => {
      const result = interpolateRiderPosition(branchCoords, dropCoords, 0.5, 20);
      const expectedLat = Number(((23.0131 + 23.0338) / 2).toFixed(6));
      const expectedLng = Number(((72.5085 + 72.5262) / 2).toFixed(6));

      expect(result.riderLat).toBe(expectedLat);
      expect(result.riderLng).toBe(expectedLng);
      expect(result.progressPercent).toBe(50);
      expect(result.etaMinutes).toBe(10);
    });

    it('clamps to destination at 100% progress with 1 min minimum ETA', () => {
      const result = interpolateRiderPosition(branchCoords, dropCoords, 1.0, 20);
      expect(result.riderLat).toBe(23.0338);
      expect(result.riderLng).toBe(72.5262);
      expect(result.progressPercent).toBe(100);
      expect(result.etaMinutes).toBe(1);
    });
  });

  describe('validate1TapReorder', () => {
    const liveCatalog: ProductCatalogItem[] = [
      { id: 'p1', name: 'Classic Smash Burger', price: 199, inStock: true },
      { id: 'p2', name: 'Double Truffle Melt', price: 319, inStock: true }, // Price updated from 299 to 319
      { id: 'p3', name: 'Peri Peri Fries', price: 129, inStock: false }, // 86ed out of stock
    ];

    it('successfully reconstructs cart when all items are available at current prices', () => {
      const pastItems: PastOrderItem[] = [
        { productId: 'p1', name: 'Classic Smash Burger', price: 199, quantity: 2 },
      ];

      const result = validate1TapReorder(pastItems, liveCatalog);
      expect(result.canReorderAll).toBe(true);
      expect(result.validItems).toHaveLength(1);
      expect(result.outOfStockItems).toHaveLength(0);
      expect(result.priceChangedItems).toHaveLength(0);
    });

    it('flags 86ed out of stock items and updates price-changed items', () => {
      const pastItems: PastOrderItem[] = [
        { productId: 'p1', name: 'Classic Smash Burger', price: 199, quantity: 1 },
        { productId: 'p2', name: 'Double Truffle Melt', price: 299, quantity: 1 },
        { productId: 'p3', name: 'Peri Peri Fries', price: 129, quantity: 1 },
      ];

      const result = validate1TapReorder(pastItems, liveCatalog);
      expect(result.canReorderAll).toBe(false);
      expect(result.outOfStockItems).toContain('Peri Peri Fries');
      expect(result.priceChangedItems).toEqual([
        { name: 'Double Truffle Melt', oldPrice: 299, newPrice: 319 },
      ]);
      expect(result.validItems).toHaveLength(2);
      expect(result.validItems.find((i) => i.productId === 'p2')?.price).toBe(319);
    });
  });
});
