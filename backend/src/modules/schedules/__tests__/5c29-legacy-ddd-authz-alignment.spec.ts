import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { SchedulesController } from '../schedules.controller';
import { SchedulesDDDController } from '../schedules-ddd.controller';
import { MinRole } from '../../../guards/min-role';
import { canApprove, canPublish, UserRole } from '../../../models/schedule-status';
import { hasMinRole } from '../../../guards/role-guards';

const ROLES_KEY = 'roles';

function legacyRoles(method: string): string[] {
  return Reflect.getMetadata(ROLES_KEY, SchedulesController.prototype[method as keyof SchedulesController]) ?? [];
}

function dddRoles(method: string): string[] {
  return Reflect.getMetadata(ROLES_KEY, SchedulesDDDController.prototype[method as keyof SchedulesDDDController]) ?? [];
}

/**
 * Phase 5C.29 — P2-07: legacy authorization == DDD canonical contract.
 *
 * Audit decision: DDD = CANONICAL, LEGACY = ACTIVE/MIGRATION. The legacy
 * workflow surface must declare the same minimum-role threshold as the DDD
 * controller for every equivalent operation, and the shared decision
 * helpers (`canApprove`, `canPublish`) must not widen that contract.
 */
describe('Phase 5C.29 — P2-07 legacy-to-DDD authorization alignment', () => {
  describe('route contract equality (legacy decorator == DDD decorator)', () => {
    it.each([
      ['submitForReview', 'submitForReview', MinRole.SUPERVISOR],
      ['approve', 'approve', MinRole.IMAGING_DIRECTOR],
      ['reject', 'reject', MinRole.IMAGING_DIRECTOR],
      ['publish', 'publish', MinRole.IMAGING_DIRECTOR],
      ['archive', 'archive', MinRole.IMAGING_DIRECTOR],
      ['createRevision', 'revertToDraft', MinRole.IMAGING_DIRECTOR],
      ['rollback', 'rollback', MinRole.HOSPITAL_ADMIN],
    ])('legacy %s declares the same min role as DDD %s', (legacyMethod, dddMethod, expected) => {
      const legacy = legacyRoles(legacyMethod);
      const ddd = dddRoles(dddMethod);
      expect(legacy.length).toBeGreaterThan(0);
      expect(ddd.length).toBeGreaterThan(0);
      expect(legacy[0]).toBe(ddd[0]);
      expect(legacy[0]).toBe(expected);
    });

    it('legacy publishByUnit is raised to the DDD publish threshold (IMAGING_DIRECTOR)', () => {
      expect(legacyRoles('publishByUnit')[0]).toBe(MinRole.IMAGING_DIRECTOR);
    });

    it('legacy delete is raised to IMAGING_DIRECTOR and keeps the draft-only gate', () => {
      expect(legacyRoles('delete')[0]).toBe(MinRole.IMAGING_DIRECTOR);
      const src = Function.prototype.toString.call(SchedulesController.prototype.delete);
      expect(src).toMatch(/status\s*(?:!=|!==)\s*["']draft["']/);
      expect(src).toContain('Sadece taslak programlar silinebilir');
    });
  });

  describe('canApprove / canPublish decision helpers match the DDD contract', () => {
    it('approval echoes @Roles(IMAGING_DIRECTOR): supervisor can NO LONGER approve', () => {
      expect(canApprove('supervisor')).toBe(false);
      expect(canApprove('chief_technician')).toBe(false);
      expect(canApprove('project_manager')).toBe(false);
      expect(canApprove('imaging_director')).toBe(true);
      expect(canApprove('hospital_admin')).toBe(true);
      expect(canApprove('system_admin')).toBe(true);
    });

    it('publish is restricted to the DDD publish role set', () => {
      expect(canPublish('supervisor')).toBe(false);
      expect(canPublish('field_supervisor')).toBe(false);
      expect(canPublish('imaging_director')).toBe(true);
      expect(canPublish('hospital_admin')).toBe(true);
      expect(canPublish('system_admin')).toBe(true);
    });
  });

  describe('RolesGuard threshold behavior enforces the same effective gates', () => {
    it('field supervisor stays below every review/publish operation on legacy and DDD', () => {
      expect(hasMinRole('field_supervisor' as UserRole, MinRole.SUPERVISOR as UserRole)).toBe(false);
      expect(hasMinRole('field_supervisor' as UserRole, MinRole.IMAGING_DIRECTOR as UserRole)).toBe(false);
    });

    it('supervisor clears submit but not approve/publish/rollback', () => {
      expect(hasMinRole('supervisor' as UserRole, MinRole.SUPERVISOR as UserRole)).toBe(true);
      expect(hasMinRole('supervisor' as UserRole, MinRole.IMAGING_DIRECTOR as UserRole)).toBe(false);
      expect(hasMinRole('supervisor' as UserRole, MinRole.HOSPITAL_ADMIN as UserRole)).toBe(false);
    });

    it('imaging director clears review/publish but not hospital-admin rollback', () => {
      expect(hasMinRole('imaging_director' as UserRole, MinRole.IMAGING_DIRECTOR as UserRole)).toBe(true);
      expect(hasMinRole('imaging_director' as UserRole, MinRole.HOSPITAL_ADMIN as UserRole)).toBe(false);
    });
  });

  describe('single threshold source — no deprecated aliases in the legacy surface', () => {
    it('schedules.controller.ts references only canonical MinRole members', () => {
      const src = readFileSync(join(__dirname, '..', 'schedules.controller.ts'), 'utf8');
      expect(src).not.toMatch(/MinRole\.(HEAD_TECHNICIAN|PLANNER)\b/);
    });
  });
});