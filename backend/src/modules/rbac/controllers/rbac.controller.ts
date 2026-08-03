import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { PERMISSIONS } from '../constants';
import { RolesService } from '../services/roles.service';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ZodValidationPipe } from '@common/pipes';
import {
  assignRoleSchema,
  createRoleSchema,
  updateRoleSchema,
  upsertPermissionSchema,
  type AssignRoleDto,
  type CreateRoleDto,
  type UpdateRoleDto,
  type UpsertPermissionDto,
} from '../dto';

/**
 * RBAC admin surface. All endpoints require ADMIN_DASHBOARD_READ at
 * minimum plus the specific write permissions declared per-handler.
 */
@ApiTags('Admin RBAC')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller({ path: 'admin/rbac', version: '1' })
export class RbacController {
  constructor(private readonly roles: RolesService) {}

  @Get('roles')
  @RequirePermissions(PERMISSIONS.RBAC_READ)
  @ApiOperation({ summary: 'List roles with attached permissions' })
  listRoles() {
    return this.roles.listRoles();
  }

  @Post('roles')
  @RequirePermissions(PERMISSIONS.RBAC_WRITE)
  @ApiOperation({ summary: 'Create a custom role' })
  createRole(@Body(new ZodValidationPipe(createRoleSchema)) body: CreateRoleDto) {
    return this.roles.createRole(body);
  }

  @Put('roles/:id')
  @RequirePermissions(PERMISSIONS.RBAC_WRITE)
  @ApiOperation({ summary: 'Update a custom role' })
  updateRole(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRoleSchema)) body: UpdateRoleDto,
  ) {
    return this.roles.updateRole(id, body);
  }

  @Delete('roles/:id')
  @RequirePermissions(PERMISSIONS.RBAC_WRITE)
  @ApiOperation({ summary: 'Delete a custom role' })
  deleteRole(@Param('id') id: string) {
    return this.roles.deleteRole(id).then(() => ({ ok: true }));
  }

  @Get('permissions')
  @RequirePermissions(PERMISSIONS.RBAC_READ)
  @ApiOperation({ summary: 'List all permissions' })
  listPermissions() {
    return this.roles.listPermissions();
  }

  @Post('permissions')
  @RequirePermissions(PERMISSIONS.RBAC_WRITE)
  @ApiOperation({ summary: 'Upsert a permission' })
  upsertPermission(@Body(new ZodValidationPipe(upsertPermissionSchema)) body: UpsertPermissionDto) {
    return this.roles.upsertPermission(body);
  }

  @Delete('permissions/:key')
  @RequirePermissions(PERMISSIONS.RBAC_WRITE)
  @ApiOperation({ summary: 'Delete a permission by key' })
  deletePermission(@Param('key') key: string) {
    return this.roles.deletePermission(key).then(() => ({ ok: true }));
  }

  @Post('assignments')
  @RequirePermissions(PERMISSIONS.RBAC_WRITE)
  @ApiOperation({ summary: 'Assign a role to a user (optionally scoped)' })
  assign(
    @CurrentUser('sub') adminId: string,
    @Body(new ZodValidationPipe(assignRoleSchema)) body: AssignRoleDto,
  ) {
    return this.roles.assignToUser({ ...body, assignedBy: adminId });
  }

  @Delete('assignments/:userId/:roleKey')
  @RequirePermissions(PERMISSIONS.RBAC_WRITE)
  @ApiOperation({ summary: 'Remove a role assignment' })
  unassign(@Param('userId') userId: string, @Param('roleKey') roleKey: string) {
    return this.roles.removeFromUser(userId, roleKey).then(() => ({ ok: true }));
  }

  @Get('assignments/:userId')
  @RequirePermissions(PERMISSIONS.RBAC_READ)
  @ApiOperation({ summary: 'List a user’s role assignments' })
  listAssignments(@Param('userId') userId: string) {
    return this.roles.listAssignmentsForUser(userId);
  }
}
