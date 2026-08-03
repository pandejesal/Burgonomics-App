import type { ReportFormat, ReportType } from '../constants';

export type ReportStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface ReportJobEntity {
  id: string;
  type: ReportType;
  status: ReportStatus;
  format: ReportFormat;
  params: Record<string, unknown> | null;
  requestedBy: string | null;
  fileUrl: string | null;
  fileSize: number | null;
  rowCount: number | null;
  error: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
