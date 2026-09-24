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
  });
});
