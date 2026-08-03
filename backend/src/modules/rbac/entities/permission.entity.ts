export interface PermissionEntity {
  id: string;
  key: string;
  resource: string;
  action: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}
