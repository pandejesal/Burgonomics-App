import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Mock-removal production gate (FR-001, FR-005, FR-011):
// the demo/simulation store was deleted. Production must never
// reintroduce it, and production routes/services must not import it.

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('demo-removal production gate', () => {
  it('demoStore module does not exist', () => {
    expect(existsSync(join(root, 'features', 'demo', 'state', 'demoStore.ts'))).toBe(false);
    expect(existsSync(join(root, 'features', 'demo', 'state', 'demoStore.tsx'))).toBe(false);
  });

  it('no production source imports demoStore', () => {
    const offenders: string[] = [];
    for (const file of walk(root)) {
      const content = readFileSync(file, 'utf8');
      if (content.includes('features/demo/state/demoStore')) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  }, 20000);

  // ZERO-MOCK: order status may only move on a server write (functions
  // orderStatus bump, dispatch webhooks, Partner KDS). The on-device
  // 30s ticker must stay behind a compile-time DEV gate so release
  // bundles drop the branch entirely.
  it('client order-status ticker is DEV-gated', () => {
    const service = readFileSync(
      join(root, 'features', 'orders', 'services', 'ordersService.ts'),
      'utf8',
    );

    expect(service).toMatch(
      /const CLIENT_STATUS_TICK_ENABLED[^=]*=\s*import\.meta\.env\.DEV === true;/,
    );

    const start = service.indexOf('function tickOrder');
    const end = service.indexOf('function shortCode');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const tickBody = service.slice(start, end);
    // The guard must be the first statement — nothing may advance first.
    expect(tickBody).toMatch(
      /function tickOrder\([^)]*\):\s*Order\s*\{\s*if \(!CLIENT_STATUS_TICK_ENABLED\) return order;/,
    );
    // The ticker is the only caller of the simulation engine.
    expect(service.match(/advanceOrder\(/g) ?? []).toHaveLength(1);
  });
});
