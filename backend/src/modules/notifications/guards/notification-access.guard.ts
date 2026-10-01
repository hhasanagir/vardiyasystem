import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class NotificationAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required');

    // Users can only access their own notifications
    const paramUserId = request.params.userId;
    if (paramUserId && paramUserId !== user.id) {
      const userRole = user.role || '';
      const isAdmin =
        userRole === 'system_admin' || userRole === 'hospital_admin';
      if (!isAdmin) {
        throw new ForbiddenException('Cannot access other user notifications');
      }
    }

    return true;
  }
}
