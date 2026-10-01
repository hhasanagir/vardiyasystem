export { RbacModule } from './rbac.module';
export { RbacService } from './rbac.service';
export { PermissionGuard } from './guards/permission.guard';
export { Permissions } from './decorators/permissions.decorator';
export { ScopeLevel } from './decorators/scope-level.decorator';
export { CurrentUser } from './decorators/current-user.decorator';
export { ScopeResolutionService } from './services/scope-resolution.service';
export {
  RbacUser,
  AccessDeniedError,
  PermissionScope,
  HierarchyScopeLevel,
} from './interfaces/rbac.types';
