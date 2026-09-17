import { describe, it, expect, vi, beforeEach } from 'vitest';

// Loop 11/120: the outlet directory reads must stay bounded (same class as
// the Loop 3 partner fix) and prod must never fall back to mock stores.

vi.mock('../src/core/config/firebase', () => ({ db: {} }));

const seen = vi.hoisted(() => ({ limits: [] as unknown[] }));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    collection: vi.fn((...args: unknown[]) => ({ _collection: args })),
    collectionGroup: vi.fn((...args: unknown[]) => ({ _collectionGroup: args })),
    doc: vi.fn((...args: unknown[]) => ({ _doc: args })),
    query: vi.fn((...args: unknown[]) => ({ _query: args })),
    where: vi.fn((...args: unknown[]) => ({ _where: args })),
    orderBy: vi.fn((...args: unknown[]) => ({ _orderBy: args })),
    limit: vi.fn((n: unknown) => {
      seen.limits.push(n);
      return { _limit: n };
    }),
    getDocs: vi.fn(async () => ({ empty: true, forEach: () => {} })),
    Timestamp: { now: () => ({ toMillis: () => 0 }) },
  };
});

import { storesService } from '../src/features/stores/services/storesService';

// Local mock store data for testing (replaces deleted MOCK_STORES)
const LOCAL_MOCK_STORES = [
  { id: "branch_surat_01", name: "Surat Central", city: "Surat" },
  { id: "branch_ahmedabad_01", name: "Ahmedabad Central", city: "Ahmedabad" },
  { id: "branch_vadodara_01", name: "Vadodara West", city: "Vadodara" },
];

describe('storesService directory bounds (Loop 11/120)', () => {
  beforeEach(() => {
    seen.limits = [];
  });

  it('bounds both directory reads at 100', async () => {
    const res = await storesService.list();
    expect(res.success).toBe(true);
    expect(seen.limits).toEqual([100, 100]);
  });

  it('falls back to the DEV-gated catalog only (prod returns [] — vitest runs DEV=true)', async () => {
    const res = await storesService.list();
    expect(res.success).toBe(true);
    // Under vitest import.meta.env.DEV is true, so the fallback leg serves
    // the mock catalog. In prod builds the same leg returns [] (see service).
    expect(res.data.map((s) => s.id).sort()).toEqual(LOCAL_MOCK_STORES.map((s) => s.id).sort());
  });
});