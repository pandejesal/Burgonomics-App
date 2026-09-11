import { describe, it, expect, vi } from 'vitest';

// Loop 11/120: the outlet directory reads must stay bounded (same class as
// the Loop 3 partner fix) and prod must never fall back to mock stores.

vi.mock('../src/core/config/firebase', () => ({ db: {} }));

const seen = vi.hoisted(() => ({ limits: [] as unknown[] }));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    collection: vi.fn((...args: unknown[]) => ({ _collection: args })),
    doc: vi.fn((...args: unknown[]) => ({ _doc: args })),
    getDoc: vi.fn(async () => ({ exists: false })),
    getDocs: vi.fn(async () => ({ empty: true, forEach: (_cb: unknown) => {} })),
    query: vi.fn((...args: unknown[]) => ({ _query: args })),
    limit: vi.fn((n: unknown) => {
      seen.limits.push(n);
      return { _limit: n };
    }),
  };
});

import { storesService } from '../src/features/stores/services/storesService';
import { MOCK_STORES } from '../src/features/stores/data/mockStores';

describe('storesService directory bounds (Loop 11/120)', () => {
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
    expect(res.data.map((s) => s.id).sort()).toEqual(MOCK_STORES.map((s) => s.id).sort());
  });
});
