import { Injectable } from '@nestjs/common';
import type { ReportFormat, ReportType } from '../constants';

export interface ReportRow {
  [column: string]: string | number | boolean | null;
}

export interface RenderedReport {
  buffer: Buffer;
  contentType: string;
  extension: string;
  rowCount: number;
}

/**
 * Serializes tabular report rows into the requested wire format.
 *
 * CSV is authored inline (no dependency footprint); XLSX and PDF fall
 * back to a light-weight text-based envelope so the platform ships
 * without pulling native/OS dependencies into the Worker runtime.
 * A future PR can swap in `exceljs` / `pdfkit` behind this seam.
 */
@Injectable()
export class ReportExporterService {
  render(
    type: ReportType,
    format: ReportFormat,
    rows: ReportRow[],
    headers?: string[],
  ): RenderedReport {
    const cols = headers ?? this.inferHeaders(rows);
    switch (format) {
      case 'csv':
        return this.renderCsv(rows, cols);
      case 'xlsx':
        return this.renderTextEnvelope(rows, cols, {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          extension: 'xlsx',
          header: `# ${type.toUpperCase()} REPORT — TSV-XLSX envelope`,
        });
      case 'pdf':
        return this.renderTextEnvelope(rows, cols, {
          contentType: 'application/pdf',
          extension: 'pdf',
          header: `%PDF-textual-envelope\n# ${type.toUpperCase()} REPORT`,
        });
    }
  }

  private inferHeaders(rows: ReportRow[]): string[] {
    const set = new Set<string>();
    for (const r of rows) for (const k of Object.keys(r)) set.add(k);
    return Array.from(set);
  }

  private renderCsv(rows: ReportRow[], headers: string[]): RenderedReport {
    const lines: string[] = [];
    lines.push(headers.map((h) => this.esc(h)).join(','));
    for (const r of rows) {
      lines.push(headers.map((h) => this.esc(this.stringify(r[h] ?? ''))).join(','));
    }
    const text = lines.join('\n');
    return {
      buffer: Buffer.from(text, 'utf8'),
      contentType: 'text/csv',
      extension: 'csv',
      rowCount: rows.length,
    };
  }

  private renderTextEnvelope(
    rows: ReportRow[],
    headers: string[],
    opts: { contentType: string; extension: string; header: string },
  ): RenderedReport {
    const lines = [opts.header, headers.join('\t')];
    for (const r of rows) {
      lines.push(headers.map((h) => this.stringify(r[h] ?? '')).join('\t'));
    }
    return {
      buffer: Buffer.from(lines.join('\n'), 'utf8'),
      contentType: opts.contentType,
      extension: opts.extension,
      rowCount: rows.length,
    };
  }

  private stringify(v: unknown): string {
    if (v == null) return '';
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  private esc(v: string): string {
    if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  }
}
