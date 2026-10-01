import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { CsrfGuard, CSRF_COOKIE, CSRF_HEADER } from '../csrf/csrf.guard';
import { CsrfService } from '../csrf/csrf.service';
import { vi, describe, it, expect, beforeEach } from 'vitest';

function createMockContext(
  method: string,
  headers: Record<string, string>,
  cookies: Record<string, string>,
) {
  const response: any = {
    cookie: vi.fn(),
  };
  const handler = () => {};
  const cls = class {};
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        headers,
        cookies,
      }),
      getResponse: () => response,
    }),
    getHandler: () => handler,
    getClass: () => cls,
  } as any;
}

describe('CsrfGuard', () => {
  let guard: CsrfGuard;
  let csrfService: CsrfService;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CsrfGuard, CsrfService, Reflector],
    }).compile();

    guard = module.get<CsrfGuard>(CsrfGuard);
    csrfService = module.get<CsrfService>(CsrfService);
    reflector = module.get<Reflector>(Reflector);
  });

  describe('GET requests (safe)', () => {
    it('should allow GET without CSRF cookie, and set one', () => {
      const context = createMockContext('GET', {}, {});
      const result = guard.canActivate(context);
      expect(result).toBe(true);
      const res = context.switchToHttp().getResponse();
      expect(res.cookie).toHaveBeenCalledWith(
        CSRF_COOKIE,
        expect.any(String),
        expect.objectContaining({ httpOnly: false, sameSite: 'strict' }),
      );
    });

    it('should allow GET with existing CSRF cookie', () => {
      const token = csrfService.generateToken();
      const context = createMockContext('GET', {}, { [CSRF_COOKIE]: token });
      const result = guard.canActivate(context);
      expect(result).toBe(true);
      const res = context.switchToHttp().getResponse();
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  describe('POST requests (unsafe)', () => {
    it('should block POST with missing CSRF header', () => {
      const token = csrfService.generateToken();
      const context = createMockContext('POST', {}, { [CSRF_COOKIE]: token });
      const result = guard.canActivate(context);
      expect(result).toBe(false);
    });

    it('should block POST with mismatched CSRF tokens', () => {
      const token1 = csrfService.generateToken();
      const token2 = csrfService.generateToken();
      const context = createMockContext(
        'POST',
        { [CSRF_HEADER]: token1 },
        { [CSRF_COOKIE]: token2 },
      );
      const result = guard.canActivate(context);
      expect(result).toBe(false);
    });

    it('should allow POST with matching CSRF tokens', () => {
      const token = csrfService.generateToken();
      const context = createMockContext(
        'POST',
        { [CSRF_HEADER]: token },
        { [CSRF_COOKIE]: token },
      );
      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should block POST with missing CSRF cookie', () => {
      const token = csrfService.generateToken();
      const context = createMockContext('POST', { [CSRF_HEADER]: token }, {});
      const result = guard.canActivate(context);
      expect(result).toBe(false);
    });
  });

  describe('SkipCsrf decorator', () => {
    it('should skip CSRF check when skipCsrf metadata is true', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
      const context = createMockContext('POST', {}, {});
      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });
  });
});
