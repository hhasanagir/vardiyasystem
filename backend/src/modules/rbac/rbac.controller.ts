import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Query } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Permissions } from './decorators/permissions.decorator';
import { PermissionGuard } from './guards/permission.guard';
import { AssignRoleDto, UpdateRolePermissionsDto } from './dto/assign-role.dto';
import { RbacUser } from './interfaces/rbac.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Log } from '../audit-log/log.decorator';
import { AuditEvent } from '../audit-log/audit.constants';

@Controller('rbac')
@UseGuards(JwtAuthGuard)
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('roles')
  @UseGuards(PermissionGuard)
  @Permissions('role.read')
  async getRoles() {
    return this.rbacService.getAvailableRoles();
  }

  @Get('roles/:id/permissions')
  @UseGuards(PermissionGuard)
  @Permissions('role.read')
  async getRolePermissions(@Param('id') id: string) {
    return this.rbacService.getRolePermissions(id);
  }

  @Put('roles/:id/permissions')
  @UseGuards(PermissionGuard)
  @Permissions('role.update')
  @Log({ action: AuditEvent.PERMISSION_CHANGED, entityType: 'role', description: 'Rol yetkileri güncellendi' })
  async updateRolePermissions(
    @Param('id') id: string,
    @Body() dto: UpdateRolePermissionsDto,
    @CurrentUser() user: RbacUser,
  ) {
    await this.rbacService.updateRolePermissions(id, dto.permissions, user.id);
    return { success: true };
  }

  @Get('permissions')
  @UseGuards(PermissionGuard)
  @Permissions('role.read')
  async getPermissions() {
    return this.rbacService.getAllPermissions();
  }

  @Get('matrix')
  @UseGuards(PermissionGuard)
  @Permissions('role.read')
  async getPermissionMatrix() {
    return this.rbacService.getPermissionMatrix();
  }

  @Get('user/:userId/permissions')
  @UseGuards(PermissionGuard)
  @Permissions('role.read')
  async getUserPermissions(@Param('userId') userId: string) {
    const permissions = await this.rbacService.getUserPermissions(userId);
    return { permissions };
  }

  @Get('user/:userId/roles')
  @UseGuards(PermissionGuard)
  @Permissions('role.read')
  async getUserRoles(@Param('userId') userId: string) {
    return this.rbacService.getUserRbacRoles(userId);
  }

  @Post('assign')
  @UseGuards(PermissionGuard)
  @Permissions('role.assign')
  @Log({ action: AuditEvent.ROLE_ASSIGNED, entityType: 'role', description: 'Kullanıcıya rol atandı' })
  async assignRole(@Body() dto: AssignRoleDto, @CurrentUser() user: RbacUser) {
    await this.rbacService.assignRoleToUser(dto.userId, dto.roleId, user.id, {
      organizationId: dto.organizationId,
      hospitalGroupId: dto.hospitalGroupId,
      hospitalId: dto.hospitalId,
      departmentId: dto.departmentId,
      unitId: dto.unitId,
    });
    return { success: true };
  }

  @Delete('assign')
  @UseGuards(PermissionGuard)
  @Permissions('role.assign')
  @Log({ action: AuditEvent.ROLE_REMOVED, entityType: 'role', description: 'Kullanıcıdan rol kaldırıldı' })
  async removeRole(
    @CurrentUser() user: RbacUser,
    @Query('userId') userId: string,
    @Query('roleId') roleId: string,
    @Query('organizationId') organizationId?: string,
    @Query('hospitalGroupId') hospitalGroupId?: string,
    @Query('hospitalId') hospitalId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('unitId') unitId?: string,
  ) {
    await this.rbacService.removeRoleFromUser(userId, roleId, { organizationId, hospitalGroupId, hospitalId, departmentId, unitId }, user.id);
    return { success: true };
  }

  @Get('me/permissions')
  async getMyPermissions(@CurrentUser() user: RbacUser) {
    const permissions = await this.rbacService.getUserPermissions(user.id, {
      organizationId: user.organizationId,
      unitId: user.unitId,
    });
    return { permissions, rbacRoles: await this.rbacService.getUserRbacRoles(user.id) };
  }
}
