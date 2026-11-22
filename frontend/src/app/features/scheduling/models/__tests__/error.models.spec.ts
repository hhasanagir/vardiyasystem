import { describe, it, expect } from 'vitest';
import { classifyHttpError } from '../error.models';

describe('classifyHttpError', () => {
  describe('409 blocking violations vs version conflict', () => {
    it('should surface the blocking violation message when hasBlocking is true', () => {
      const err = classifyHttpError(409, {
        message: 'Assignment validation failed',
        hasBlocking: true,
        violations: [
          { rule: 'UNIT_CLOSED', message: 'RONK-1 2026-08-15 tarihinde kapalı (Cumartesi)', severity: 'BLOCKING' },
        ],
      });
      expect(err.code).toBe(409);
      expect(err.userMessage).toContain('kapalı');
      expect(err.retryable).toBe(false);
      expect(err.severity).toBe('error');
    });

    it('should surface the DEVICE_OFF_DATE violation message even without hasBlocking', () => {
      const err = classifyHttpError(409, {
        message: 'Assignment validation failed',
        violations: [
          { rule: 'DEVICE_OFF_DATE', message: 'RONK-1 2026-08-15 tarihinde kapalı (cihaz devre dışı)', severity: 'BLOCKING' },
        ],
      });
      expect(err.userMessage).toContain('devre dışı');
      expect(err.retryable).toBe(false);
    });

    it('should fall back to the generic server message when no violation has a message', () => {
      const err = classifyHttpError(409, {
        message: 'Assignment validation failed',
        hasBlocking: true,
        violations: [{ rule: 'UNIT_CLOSED', severity: 'BLOCKING' }],
      });
      expect(err.userMessage).toBe('Assignment validation failed');
    });

    it('should report a version conflict when serverVersion is present', () => {
      const err = classifyHttpError(409, {
        serverVersion: 5,
        localVersion: 4,
        scheduleId: 's-1',
      });
      expect(err.userMessage).toBe('Bu plan başka bir kullanıcı tarafından güncellendi.');
      expect(err.retryable).toBe(true);
      expect(err.severity).toBe('warning');
      expect((err as any).localVersion).toBe(4);
      expect((err as any).serverVersion).toBe(5);
    });

    it('should report a version conflict when localVersion is present', () => {
      const err = classifyHttpError(409, { localVersion: 2 });
      expect(err.retryable).toBe(true);
      expect(err.userMessage).toBe('Bu plan başka bir kullanıcı tarafından güncellendi.');
    });
  });

  it('should map 400 to a warning with a stable message', () => {
    const err = classifyHttpError(400, { message: 'Geçersiz' });
    expect(err.code).toBe(400);
    expect(err.severity).toBe('warning');
    expect(err.retryable).toBe(false);
  });

  it('should map 500 to a retryable critical error', () => {
    const err = classifyHttpError(500, { message: 'boom' });
    expect(err.severity).toBe('critical');
    expect(err.retryable).toBe(true);
  });
});
