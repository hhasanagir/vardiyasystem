import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Response, Request } from 'express';
import { CsrfService } from './csrf.service';

export const CSRF_COOKIE = 'csrf-token';
export const CSRF_HEADER = 'x-csrf-token';
export const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const SKIP_CSRF_KEY = 'skipCsrf';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly csrfService: CsrfService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const method = request.method;

    const skipCsrf = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipCsrf) return true;

    const existingCookie = (
      request.cookies as Record<string, string> | undefined
    )?.[CSRF_COOKIE];

    if (SAFE_METHODS.has(method)) {
      if (!existingCookie) {
        const token = this.csrfService.generateToken();
        this.setCsrfCookie(response, token);
      }
      return true;
    }

    const headerToken = request.headers[CSRF_HEADER] as string | undefined;
    return this.csrfService.validateToken(headerToken, existingCookie);
  }

  private setCsrfCookie(response: Response, token: string): void {
    response.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
  }
}
