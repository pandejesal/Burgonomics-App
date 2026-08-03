import { z } from 'zod';

export const upsertPermissionSchema = z.object({
  key: z
    .string()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9._-]+$/),
  resource: z.string().min(1).max(60),
  action: z.string().min(1).max(60),
  description: z.string().max(240).optional(),
});
export type UpsertPermissionDto = z.infer<typeof upsertPermissionSchema>;

export const createRoleSchema = z.object({
  key: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9_-]+$/),
  name: z.string().min(2).max(80),
  description: z.string().max(240).optional(),
  permissions: z.array(z.string()).default([]),
});
export type CreateRoleDto = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(240).optional(),
  permissions: z.array(z.string()).optional(),
});
export type UpdateRoleDto = z.infer<typeof updateRoleSchema>;

export const assignRoleSchema = z.object({
  userId: z.string().min(1),
  roleKey: z.string().min(1),
  scope: z.string().max(120).optional(),
});
export type AssignRoleDto = z.infer<typeof assignRoleSchema>;

export interface RoleResponse {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PermissionResponse {
  id: string;
  key: string;
  resource: string;
  action: string;
  description: string | null;
}
