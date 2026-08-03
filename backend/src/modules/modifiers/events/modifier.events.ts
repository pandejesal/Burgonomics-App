export const MODIFIER_EVENTS = {
  GROUP_UPDATED: 'modifier.group_updated',
  OPTION_UPDATED: 'modifier.option_updated',
} as const;

export interface ModifierGroupChangedEvent {
  groupId: string;
  petpoojaId: string;
  source: 'PETPOOJA_SYNC';
  correlationId?: string;
}
