import type { TimeGranularity } from '../dto';

/**
 * PostgreSQL `date_trunc` unit for a given analytics granularity.
 * Analytics repository uses this to bucket time series.
 */
export function granularityToTruncUnit(g: TimeGranularity): string {
  switch (g) {
    case 'hour':
      return 'hour';
    case 'day':
      return 'day';
    case 'week':
      return 'week';
    case 'month':
      return 'month';
    case 'year':
      return 'year';
  }
}
