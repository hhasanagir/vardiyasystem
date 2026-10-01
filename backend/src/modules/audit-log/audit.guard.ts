import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MinRole } from '../../guards/min-role';

@Injectable()
export class AuditAccessGuard implements CanActivate {
  private readonly minRole = MinRole.SUPERVISOR;

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return false;

    const hierarchy: Record<string, number> = {
      guest: 50,
      secretary: 100,
      assistant_technician: 150,
      technician: 200,
      senior_technician: 300,
      medical_engineer: 400,
      supervisor: 500,
      imaging_director: 600,
      hospital_admin: 800,
      system_admin: 1000,
    };
    return hierarchy[user.role] >= hierarchy[this.minRole];
  }
}
