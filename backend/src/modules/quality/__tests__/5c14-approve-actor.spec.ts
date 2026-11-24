import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { RequestMethod } from '@nestjs/common';
import { QualityController } from '../quality.controller';
import { AUDIT_METADATA_KEY } from '../../audit-log/audit.constants';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { MinRole } from '../../../guards/min-role';

/**
 * Phase 5C.14 — C3: quality record approval must record the AUTHENTICATED
 * actor (req.user.id) as the approving authority. A client-claimed actor must
 * never be trusted; the controller derives the actor solely from the session.
 */
describe('Phase 5C.14 — C3: quality approve actor integrity', () => {
  it('approveRecord passes the authenticated session actor to the service', async () => {
    const approveRecord = vi.fn(async () => ({ id: 'q-1', status: 'approved' }));
    const controller = new QualityController({ approveRecord } as any);

    const req: any = {
      user: { id: 'u-admin', email: 'admin@x', name: 'Admin', role: 'supervisor', organizationId: 'org-1' },
    };

    await controller.approveRecord('q-1', req);

    expect(approveRecord).toHaveBeenCalledTimes(1);
    expect(approveRecord.mock.calls[0]).toEqual(['q-1', 'u-admin']);
  });

  it('exposes POST /quality/records/:id/approve', () => {
    const handler = QualityController.prototype.approveRecord;
    expect(Reflect.getMetadata('path', handler)).toBe('records/:id/approve');
    expect(Reflect.getMetadata('method', handler)).toBe(RequestMethod.POST);
  });

  it('carries QUALITY_RECORD_APPROVED audit metadata', () => {
    const audit = Reflect.getMetadata(AUDIT_METADATA_KEY, QualityController.prototype.approveRecord);
    expect(audit).toMatchObject({ action: 'QUALITY_RECORD_APPROVED', entityType: 'quality_record' });
  });

  it('requires at least field-supervisor level', () => {
    const roles: string[] = Reflect.getMetadata(ROLES_KEY, QualityController.prototype.approveRecord) ?? [];
    expect(Array.isArray(roles)).toBe(true);
    expect(roles).toContain(MinRole.FIELD_SUPERVISOR);
  });
});