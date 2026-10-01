import { Test, TestingModule } from '@nestjs/testing';
import { CsrfService } from '../csrf/csrf.service';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('CsrfService', () => {
  let service: CsrfService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CsrfService],
    }).compile();

    service = module.get<CsrfService>(CsrfService);
  });

  describe('generateToken', () => {
    it('should generate a 64-character hex string', () => {
      const token = service.generateToken();
      expect(token).toBeDefined();
      expect(token.length).toBe(64);
    });

    it('should generate unique tokens each time', () => {
      const token1 = service.generateToken();
      const token2 = service.generateToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('validateToken', () => {
    it('should return true when tokens match', () => {
      const token = service.generateToken();
      expect(service.validateToken(token, token)).toBe(true);
    });

    it('should return false when tokens do not match', () => {
      const token1 = service.generateToken();
      const token2 = service.generateToken();
      expect(service.validateToken(token1, token2)).toBe(false);
    });

    it('should return false when header token is null', () => {
      expect(service.validateToken(null, 'sometoken')).toBe(false);
    });

    it('should return false when cookie token is undefined', () => {
      const token = service.generateToken();
      expect(service.validateToken(token, undefined)).toBe(false);
    });

    it('should return false when both tokens are missing', () => {
      expect(service.validateToken(null, undefined)).toBe(false);
    });

    it('should return false when tokens have wrong length', () => {
      expect(service.validateToken('short', 'short')).toBe(false);
    });
  });
});
