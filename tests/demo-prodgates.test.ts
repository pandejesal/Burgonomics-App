import { describe, it, expect, vi } from 'vitest';

// Loop 10/120: simulation flags persisted by a dev/QA build share
// localStorage with prod builds on-device. Prod must hard-refuse them.

const mode = vi.hoisted(() => ({ prod: true }));

vi.mock('../src/core/config/env', async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, isProd: () => mode.prod };
});

import {
  useDemoStore,
  shouldSimulate,
  isSimulationMode,
} from '../src/features/demo/state/demoStore';

describe('demoStore production gate', () => {
  it('prod: sims stay off even when force-set', () => {
    mode.prod = true;
    useDemoStore.getState().setError('payment', true);
    useDemoStore.getState().setSimulationMode(true);
    expect(shouldSimulate('payment')).toBe(false);
    expect(isSimulationMode()).toBe(false);
    expect(useDemoStore.getState().simulationMode).toBe(false);
  });

  it('dev: sims engage normally', () => {
    mode.prod = false;
    useDemoStore.getState().setError('payment', true);
    useDemoStore.getState().setSimulationMode(true);
    expect(shouldSimulate('payment')).toBe(true);
    expect(isSimulationMode()).toBe(true);
  });
});
