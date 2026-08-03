export interface RoleEntity {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoleWithPermissions extends RoleEntity {
  permissions: string[];
}

export interface UserRoleAssignmentEntity {
  id: string;
  userId: string;
  roleId: string;
  scope: string;
  assignedBy: string | null;
  createdAt: Date;
}
