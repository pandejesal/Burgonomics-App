/**
 * Conflict resolution policy. PETPOOJA is the source of truth: on any
 * disagreement between local state and PETPOOJA state, PETPOOJA wins,
 * with local per-row `updatedAt` used to guarantee idempotent replay.
 */
export enum ConflictPolicy {
  PETPOOJA_WINS = 'PETPOOJA_WINS',
  IGNORE = 'IGNORE',
}

export interface ConflictContext {
  entity: 'category' | 'product' | 'modifier_group' | 'modifier' | 'offer' | 'store' | 'stock';
  petpoojaId: string;
  reason: string;
}

/** No-op today; a Phase-4 hook will emit an outbox event per conflict. */
export function resolveConflict(_ctx: ConflictContext): ConflictPolicy {
  return ConflictPolicy.PETPOOJA_WINS;
}
