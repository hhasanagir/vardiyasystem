import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RbacUser } from '../interfaces/rbac.types';

export const CurrentUser = createParamDecorator(
  (data: keyof RbacUser | undefined, ctx: ExecutionContext): RbacUser | any => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as RbacUser;
    return data ? user?.[data] : user;
  },
);
