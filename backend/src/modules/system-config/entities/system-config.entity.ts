export interface SystemConfigEntity {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
  category: string;
  version: number;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SystemConfigVersionEntity {
  id: string;
  configId: string;
  version: number;
  value: unknown;
  changedBy: string | null;
  changeNote: string | null;
  createdAt: Date;
}
