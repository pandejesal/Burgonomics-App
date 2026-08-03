import type { StockUpdateWebhook, StoreStatusWebhook } from '../dto/petpooja.dto';

export interface StockUpdateTranslation {
  petpoojaRestId: string;
  petpoojaItemIds: string[];
  inStock: boolean;
  type: 'item' | 'addon';
  autoTurnOnAt: Date | null;
}

export function translateStockWebhook(wh: StockUpdateWebhook): StockUpdateTranslation {
  const inStock = typeof wh.inStock === 'boolean' ? wh.inStock : wh.inStock === 'true';
  const auto = parseAutoTurnOn(wh.autoTurnOnTime, wh.customTurnOnTime);
  return {
    petpoojaRestId: wh.restID,
    petpoojaItemIds: wh.itemID,
    inStock,
    type: wh.type,
    autoTurnOnAt: auto,
  };
}

export interface StoreStatusTranslation {
  petpoojaRestId: string;
  status: 'OPEN' | 'CLOSED';
  turnOnAt: Date | null;
  reason: string | null;
}

export function translateStoreStatusWebhook(wh: StoreStatusWebhook): StoreStatusTranslation {
  return {
    petpoojaRestId: wh.restID,
    status: wh.store_status === '1' ? 'OPEN' : 'CLOSED',
    turnOnAt: wh.turn_on_time ? parseDate(wh.turn_on_time) : null,
    reason: wh.reason ?? null,
  };
}

function parseAutoTurnOn(
  auto: string | null | undefined,
  custom: string | null | undefined,
): Date | null {
  if (!auto || auto === 'off') return null;
  if (auto === 'custom' && custom) return parseDate(custom);
  return null;
}

function parseDate(v: string): Date | null {
  // PETPOOJA format: "YYYY-MM-DD HH:MM:SS"
  const iso = v.includes('T') ? v : v.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
