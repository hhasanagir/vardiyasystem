import { Module, Global } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RbacService } from './rbac.service';
import { RbacController } from './rbac.controller';
import { PermissionGuard } from './guards/permission.guard';
import { ScopeResolutionService } from './services/scope-resolution.service';

@Global()
@Module({
  controllers: [RbacController],
  providers: [
    RbacService,
    PermissionGuard,
    ScopeResolutionService,
    {
      provide: APP_GUARD,
      useExisting: PermissionGuard,
    },
  ],
  exports: [RbacService, PermissionGuard, ScopeResolutionService],
})
export class RbacModule {}
