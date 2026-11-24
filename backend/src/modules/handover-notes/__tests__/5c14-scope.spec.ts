import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { HandoverNotesService } from '../handover-notes.service';
import { UnitScopeService } from '../../rbac/services/unit-scope.service';

const ORG = 'org-1';
const UNIT_A = 'unit-a';
const UNIT_B = 'unit-b';

const fsA = { id: 'u1', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG };
const fsNull = { id: 'u2', role: 'field_supervisor', unitId: null, organizationId: ORG };
const sup = { id: 'u3', role: 'supervisor', unitId: null, organizationId: ORG };

const noteFixture = (unitId: string, organizationId: string) => ({
  id: 'n-1',
  title: 'Test',
  content: 'x',
  priority: 'info',
  status: 'active',
  userId: 'u1',
  unitId,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  readBy: [] as string[],
  user: { id: 'u1', name: 'User', role: 'field_supervisor' },
  unit: { id: unitId, name: `Unit ${unitId}`, organizationId },
  device: null,
});

/**
 * Phase 5C.14 — SEC-B: handover-notes unit scope.
 *
 * Every read/write must be confined to the strict unit scope of a saha
 * sorumlusu; a NULL unit assignment fails closed, and cross-organization
 * access is denied for every role.
 */
describe('Phase 5C.14 — SEC-B: handover notes scope', () => {
  const mockPrisma: any = {
    unit: {
      findUnique: vi.fn(),
      findMany: vi.fn(async () => [{ id: UNIT_A }, { id: UNIT_B }]),
    },
    handoverNote: {
      create: vi.fn(async (args: any) => ({ ...noteFixture(args.data.unitId, ORG), id: 'n-new' })),
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(),
      update: vi.fn(async (args: any) => ({ ...noteFixture(UNIT_A, ORG), ...(args.data.readBy ? { readBy: args.data.readBy } : {}) })),
      count: vi.fn(async () => 0),
    },
  };
  const mockGateway: any = { broadcastHandoverNote: vi.fn(async () => ({})) };

  let service: HandoverNotesService;
  let unitScopeService: UnitScopeService;

  beforeEach(() => {
    vi.clearAllMocks();
    unitScopeService = new UnitScopeService({} as any);
    service = new HandoverNotesService(mockPrisma as any, mockGateway as any, unitScopeService as any);
  });

  describe('create', () => {
    it('FIELD_SUPERVISOR may create a note in his own unit (actor recorded from session)', async () => {
      mockPrisma.unit.findUnique.mockResolvedValue({ id: UNIT_A, name: 'A', organizationId: ORG });
      await service.create(fsA as any, { unitId: UNIT_A, title: 'T', content: 'C' } as any);
      expect(mockPrisma.handoverNote.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: fsA.id, unitId: UNIT_A }) }),
      );
      expect(mockGateway.broadcastHandoverNote).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: ORG, unitId: UNIT_A }),
      );
    });

    it('FIELD_SUPERVISOR creating in ANY other unit is DENIED (no write)', async () => {
      mockPrisma.unit.findUnique.mockResolvedValue({ id: UNIT_B, name: 'B', organizationId: ORG });
      await expect(service.create(fsA as any, { unitId: UNIT_B, title: 'T', content: 'C' } as any)).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.handoverNote.create).not.toHaveBeenCalled();
    });

    it('FIELD_SUPERVISOR with NULL unit assignment is DENIED (fail closed)', async () => {
      mockPrisma.unit.findUnique.mockResolvedValue({ id: UNIT_A, name: 'A', organizationId: ORG });
      await expect(service.create(fsNull as any, { unitId: UNIT_A, title: 'T', content: 'C' } as any)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('SUPERVISOR may create within the org but is DENIED for a foreign-org unit', async () => {
      mockPrisma.unit.findUnique.mockResolvedValue({ id: UNIT_B, name: 'B', organizationId: 'foreign-org' });
      await expect(service.create(sup as any, { unitId: UNIT_B, title: 'T', content: 'C' } as any)).rejects.toBeInstanceOf(ForbiddenException);

      mockPrisma.unit.findUnique.mockResolvedValue({ id: UNIT_B, name: 'B', organizationId: ORG });
      await expect(service.create(sup as any, { unitId: UNIT_B, title: 'T', content: 'C' } as any)).resolves.toBeTruthy();
    });
  });

  describe('findAll', () => {
    it('a client-supplied unitId outside the strict scope is DENIED', async () => {
      mockPrisma.unit.findUnique.mockResolvedValue({ id: UNIT_B, organizationId: ORG });
      await expect(service.findAll(fsA as any, { unitId: UNIT_B } as any)).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.handoverNote.findMany).not.toHaveBeenCalled();
    });

    it('FIELD_SUPERVISOR without a unitId is confined to his assigned unit', async () => {
      await service.findAll(fsA as any, {} as any);
      expect(mockPrisma.handoverNote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ unitId: UNIT_A }) }),
      );
    });

    it('SUPERVISOR without a unitId is confined to his organization units', async () => {
      await service.findAll(sup as any, {} as any);
      expect(mockPrisma.unit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG }) }),
      );
      expect(mockPrisma.handoverNote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ unitId: { in: [UNIT_A, UNIT_B] } }) }),
      );
    });

    it('FIELD_SUPERVISOR with NULL unit assignment listing is DENIED (never "all")', async () => {
      await expect(service.findAll(fsNull as any, {} as any)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('findOne', () => {
    it('FIELD_SUPERVISOR may read a note in his own unit', async () => {
      mockPrisma.handoverNote.findUnique.mockResolvedValue(noteFixture(UNIT_A, ORG));
      await expect(service.findOne('n-1', fsA as any)).resolves.toMatchObject({ id: 'n-1', isReadByMe: false });
    });

    it('FIELD_SUPERVISOR reading a note in another unit is DENIED', async () => {
      mockPrisma.handoverNote.findUnique.mockResolvedValue(noteFixture(UNIT_B, ORG));
      await expect(service.findOne('n-1', fsA as any)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('a missing note is NOT_FOUND (404), not a scope verdict', async () => {
      mockPrisma.handoverNote.findUnique.mockResolvedValue(null);
      await expect(service.findOne('nope', sup as any)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('markAsRead', () => {
    it('FIELD_SUPERVISOR marking a note in another unit is DENIED', async () => {
      mockPrisma.handoverNote.findUnique.mockResolvedValue(noteFixture(UNIT_B, ORG));
      await expect(service.markAsRead('n-1', fsA as any)).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.handoverNote.update).not.toHaveBeenCalled();
    });

    it('FIELD_SUPERVISOR may mark a note in his own unit', async () => {
      mockPrisma.handoverNote.findUnique.mockResolvedValue(noteFixture(UNIT_A, ORG));
      await expect(service.markAsRead('n-1', fsA as any)).resolves.toMatchObject({ isReadByMe: true });
      expect(mockPrisma.handoverNote.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ readBy: { push: fsA.id } }) }),
      );
    });
  });

  describe('getUnreadCount', () => {
    it('FIELD_SUPERVISOR count is confined to his unit', async () => {
      mockPrisma.handoverNote.count.mockResolvedValue(3);
      await expect(service.getUnreadCount(fsA as any)).resolves.toMatchObject({ count: 3 });
      expect(mockPrisma.handoverNote.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ unitId: UNIT_A }) }),
      );
    });

    it('FIELD_SUPERVISOR with NULL unit assignment is DENIED', async () => {
      await expect(service.getUnreadCount(fsNull as any)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});