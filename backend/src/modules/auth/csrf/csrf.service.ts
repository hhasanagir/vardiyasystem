import { Injectable } from '@nestjs/common';
import { randomUUID, timingSafeEqual } from 'node:crypto';

@Injectable()
export class CsrfService {
  private readonly tokenLength = 64;

  generateToken(): string {
    return randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
  }

  validateToken(
    token: string | undefined | null,
    cookieToken: string | undefined | null,
  ): boolean {
    if (!token || !cookieToken) return false;
    if (
      token.length !== this.tokenLength ||
      cookieToken.length !== this.tokenLength
    )
      return false;
    try {
      return timingSafeEqual(Buffer.from(token), Buffer.from(cookieToken));
    } catch {
      return false;
    }
  }
}
