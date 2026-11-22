import { Module, Global } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { RbacController } from './rbac.controller';
import { PermissionGuard } from './guards/permission.guard';
import { UnitScopeGuard } from './guards/unit-scope.guard';
import { UnitScopeService } from './services/unit-scope.service';
import { ScopeResolutionService } from './services/scope-resolution.service';

/**
 * PermissionGuard is deliberately NOT registered as a global APP_GUARD. Global
 * guards run before route-level guards, so a global permission guard would always
 * observe an unauthenticated request and either reject every protected route or
 * (by deferring) skip the permission check altogether. It is therefore applied as
 * a route guard AFTER JwtAuthGuard on the controllers that declare @Permissions.
 */
@Global()
@Module({
  controllers: [RbacController],
  providers: [
    RbacService,
    PermissionGuard,
    UnitScopeGuard,
    UnitScopeService,
    ScopeResolutionService,
  ],
  exports: [RbacService, PermissionGuard, UnitScopeGuard, UnitScopeService, ScopeResolutionService],
})
export class RbacModule {}
