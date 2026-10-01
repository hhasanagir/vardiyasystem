import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogService, AuditAction } from '../audit-log.service';
import { PrismaService } from '../../../prisma.service';
import { CorrelationService } from '../../../correlation/correlation.service';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('AuditLogService', () => {
  let service: AuditLogService;

  const mockLog = {
    id: 'log-1',
    requestId: 'req-1',
    userId: 'user-1',
    userName: 'Test User',
    userRole: 'hospital_admin',
    organizationId: 'org-1',
    hospitalId: 'hosp-1',
    unitId: 'unit-1',
    actionType: 'LOGIN',
    entityType: 'user',
    entityId: 'user-1',
    oldValue: null,
    newValue: null,
    description: null,
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
    status: 'SUCCESS',
    createdAt: new Date(),
    flagged: false,
    flagReason: null,
    flaggedAt: null,
    flaggedBy: null,
    user: {
      id: 'user-1',
      name: 'Test User',
      email: 'test@test.com',
      role: 'hospital_admin',
    },
  };

  const mockPrisma = {
    auditLog: {
      create: vi.fn().mockResolvedValue(mockLog),
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
      findMany: vi.fn().mockResolvedValue([mockLog]),
      findUnique: vi.fn().mockResolvedValue(mockLog),
      findFirst: vi.fn().mockResolvedValue(mockLog),
      count: vi.fn().mockResolvedValue(1),
      update: vi.fn().mockResolvedValue(mockLog),
      groupBy: vi.fn().mockResolvedValue([
        { actionType: 'LOGIN', _count: 5 },
        { actionType: 'LOGOUT', _count: 3 },
      ]),
    },
    user: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { id: 'user-1', name: 'Test User', email: 'test@test.com' },
        ]),
      findUnique: vi
        .fn()
        .mockResolvedValue({
          id: 'user-1',
          name: 'Test User',
          email: 'test@test.com',
        }),
    },
    schedule: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    scheduleApproval: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  };

  const mockCorrelationService = {
    getContext: vi
      .fn()
      .mockReturnValue({
        correlationId: 'req-1',
        userId: 'user-1',
        organizationId: 'org-1',
      }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CorrelationService, useValue: mockCorrelationService },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
    vi.clearAllMocks();
  });

  describe('log', () => {
    it('should create an audit log entry', async () => {
      const result = await service.log({
        userId: 'user-1',
        action: 'LOGIN',
        entityType: 'user',
        entityId: 'user-1',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });

      expect(result).toBeDefined();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actionType: 'LOGIN',
          entityType: 'user',
          userId: 'user-1',
        }),
      });
    });

    it('should accept before/after for backward compatibility', async () => {
      await service.log({
        userId: 'user-1',
        action: 'UPDATE',
        entityType: 'personnel',
        entityId: 'p-1',
        before: { name: 'Old' },
        after: { name: 'New' },
      });

      const call = mockPrisma.auditLog.create.mock.calls[0][0];
      expect(call.data.oldValue).toEqual({ name: 'Old' });
      expect(call.data.newValue).toEqual({ name: 'New' });
    });

    it('should prefer oldValue/newValue over before/after', async () => {
      await service.log({
        userId: 'user-1',
        action: 'UPDATE',
        entityType: 'personnel',
        entityId: 'p-1',
        oldValue: { name: 'CorrectOld' },
        newValue: { name: 'CorrectNew' },
        before: { name: 'WrongOld' },
        after: { name: 'WrongNew' },
      });

      const call = mockPrisma.auditLog.create.mock.calls[0][0];
      expect(call.data.oldValue).toEqual({ name: 'CorrectOld' });
      expect(call.data.newValue).toEqual({ name: 'CorrectNew' });
    });

    it('should attach requestId from correlation service', async () => {
      await service.log({
        userId: 'user-1',
        action: 'LOGIN',
        entityType: 'user',
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          requestId: 'req-1',
          organizationId: 'org-1',
        }),
      });
    });

    it('should default status to SUCCESS', async () => {
      await service.log({
        userId: 'user-1',
        action: 'LOGIN',
        entityType: 'user',
      });

      const call = mockPrisma.auditLog.create.mock.calls[0][0];
      expect(call.data.status).toBe('SUCCESS');
    });

    it('should use custom status when provided', async () => {
      await service.log({
        userId: 'user-1',
        action: 'FAILED_LOGIN',
        entityType: 'user',
        status: 'FAILURE',
      });

      const call = mockPrisma.auditLog.create.mock.calls[0][0];
      expect(call.data.status).toBe('FAILURE');
    });
  });

  describe('logBatch', () => {
    it('should create multiple audit log entries', async () => {
      await service.logBatch([
        { userId: 'user-1', action: 'LOGIN', entityType: 'user' },
        { userId: 'user-1', action: 'LOGOUT', entityType: 'user' },
      ]);

      expect(mockPrisma.auditLog.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ actionType: 'LOGIN' }),
          expect.objectContaining({ actionType: 'LOGOUT' }),
        ]),
      });
    });
  });

  describe('findAll', () => {
    it('should return paginated results', async () => {
      const result = await service.findAll({ limit: 10, offset: 0 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.pages).toBe(1);
    });

    it('should apply date range filters', async () => {
      await service.findAll({
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('should apply actionType filter', async () => {
      await service.findAll({ actionType: 'LOGIN' });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ actionType: 'LOGIN' }),
        }),
      );
    });

    it('should apply entityType filter', async () => {
      await service.findAll({ entityType: 'schedule' });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ entityType: 'schedule' }),
        }),
      );
    });

    it('should apply search filter across multiple fields', async () => {
      await service.findAll({ search: 'test' });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.arrayContaining([
                  expect.objectContaining({ entityId: { contains: 'test' } }),
                ]),
              }),
            ]),
          }),
        }),
      );
    });
  });

  describe('findById', () => {
    it('should return a single audit log by ID', async () => {
      const result = await service.findById('log-1');
      expect(result).toBeDefined();
      expect(result?.id).toBe('log-1');
    });

    it('should return null if not found', async () => {
      mockPrisma.auditLog.findUnique.mockResolvedValueOnce(null);
      const result = await service.findById('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('flagLog / unflagLog', () => {
    it('should flag a log entry', async () => {
      await service.flagLog('log-1', 'Suspicious activity', 'admin-1');

      expect(mockPrisma.auditLog.update).toHaveBeenCalledWith({
        where: { id: 'log-1' },
        data: expect.objectContaining({
          flagged: true,
          flagReason: 'Suspicious activity',
          flaggedBy: 'admin-1',
        }),
      });
    });

    it('should unflag a log entry', async () => {
      await service.unflagLog('log-1');

      expect(mockPrisma.auditLog.update).toHaveBeenCalledWith({
        where: { id: 'log-1' },
        data: expect.objectContaining({
          flagged: false,
          flagReason: null,
          flaggedAt: null,
          flaggedBy: null,
        }),
      });
    });
  });

  describe('computeChanges', () => {
    it('should return empty when both null', () => {
      const changes = AuditLogService.computeChanges(null, null);
      expect(changes).toEqual([]);
    });

    it('should detect added fields when no old value', () => {
      const changes = AuditLogService.computeChanges(null, { name: 'New' });
      expect(changes).toHaveLength(1);
      expect(changes[0].changeType).toBe('added');
      expect(changes[0].newValue).toBe('New');
    });

    it('should detect removed fields when no new value', () => {
      const changes = AuditLogService.computeChanges({ name: 'Old' }, null);
      expect(changes).toHaveLength(1);
      expect(changes[0].changeType).toBe('removed');
      expect(changes[0].oldValue).toBe('Old');
    });

    it('should detect modified fields', () => {
      const changes = AuditLogService.computeChanges(
        { name: 'Old', email: 'same@test.com' },
        { name: 'New', email: 'same@test.com' },
      );
      expect(changes).toHaveLength(1);
      expect(changes[0].field).toBe('name');
      expect(changes[0].oldValue).toBe('Old');
      expect(changes[0].newValue).toBe('New');
      expect(changes[0].changeType).toBe('modified');
    });

    it('should only store changed fields', () => {
      const changes = AuditLogService.computeChanges(
        { name: 'Old', email: 'same@test.com', shift: '08:00-16:00' },
        { name: 'New', email: 'same@test.com', shift: '16:00-24:00' },
      );
      expect(changes).toHaveLength(2);
    });
  });

  describe('formatAuditLogEntry', () => {
    it('should format with Turkish labels', async () => {
      const result = await service.findById('log-1');
      expect(result?.actionLabel).toBe('Giriş Yapıldı');
      expect(result?.entityTypeLabel).toBe('Kullanıcı');
    });
  });
});
