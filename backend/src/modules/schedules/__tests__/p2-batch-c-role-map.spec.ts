import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import {
  ScheduleStatusEnum,
  SCHEDULE_APPROVER_ROLES,
  SCHEDULE_SUBMIT_ROLES,
  UserRole,
  canApprove,
  canPublish,
  canRoleTransition,
  canSubmitForReview,
} from '../../../models/schedule-status';
import { ROLE_PERMISSIONS, hasMinRole, type RolePermissions } from '../../../guards/role-guards';
import { MinRole } from '../../../guards/min-role';
import { Schedule } from '../domain/aggregates/schedule.aggregate';

/**
 * Phase 5C.35 — Batch C / P2-04 ("en kısıtlayıcı yönde").
 *
 * Pins the single strictest role map across the legacy state machine, the DDD
 * aggregate and ROLE_PERMISSIONS. This spec only narrows behaviour; it never
 * relaxes the four-eyes, tenant or published/archived immutability gates that
 * are covered by their own specs.
 */
describe('P2-04 — canonical strictest schedule workflow role map', () => {
  const submitRoles = [...SCHEDULE_SUBMIT_ROLES];
  const approverRoles = [...SCHEDULE_APPROVER_ROLES];

  describe('canonical sets', () => {
    it('submit = supervisor+ (only roles already accepted on a surface)', () => {
      expect(submitRoles).toEqual([
        UserRole.SUPERVISOR,
        UserRole.IMAGING_DIRECTOR,
        UserRole.HOSPITAL_ADMIN,
        UserRole.SYSTEM_ADMIN,
      ]);
      expect(canSubmitForReview('field_supervisor')).toBe(false);
      expect(canSubmitForReview('medical_engineer')).toBe(false);
      expect(canSubmitForReview('senior_technician')).toBe(false);
      expect(canSubmitForReview('chief_technician')).toBe(false);
      expect(canSubmitForReview('project_manager')).toBe(false);
    });

    it('approve/reject/publish = imaging_director+ (strictest effective set)', () => {
      expect(approverRoles).toEqual([
        UserRole.IMAGING_DIRECTOR,
        UserRole.HOSPITAL_ADMIN,
        UserRole.SYSTEM_ADMIN,
      ]);
      expect(canApprove('supervisor')).toBe(false);
      expect(canApprove('chief_technician')).toBe(false);
      expect(canApprove('project_manager')).toBe(false);
      expect(canPublish('field_supervisor')).toBe(false);
    });

    it('does not lower the controller thresholds', () => {
      expect(hasMinRole(UserRole.FIELD_SUPERVISOR, MinRole.SUPERVISOR)).toBe(false);
      expect(hasMinRole(UserRole.SUPERVISOR, MinRole.IMAGING_DIRECTOR)).toBe(false);
    });
  });

  describe('legacy state machine (VALID_TRANSITIONS / canRoleTransition)', () => {
    it('draft → under_review only for the canonical submit set', () => {
      for (const role of submitRoles) {
        expect(canRoleTransition(ScheduleStatusEnum.DRAFT, ScheduleStatusEnum.UNDER_REVIEW, role)).toBe(true);
      }
      for (const role of ['field_supervisor', 'medical_engineer', 'senior_technician']) {
        expect(canRoleTransition(ScheduleStatusEnum.DRAFT, ScheduleStatusEnum.UNDER_REVIEW, role)).toBe(false);
      }
    });

    it('under_review → approved/rejected only for the canonical approver set', () => {
      for (const role of approverRoles) {
        expect(canRoleTransition(ScheduleStatusEnum.UNDER_REVIEW, ScheduleStatusEnum.APPROVED, role)).toBe(true);
        expect(canRoleTransition(ScheduleStatusEnum.UNDER_REVIEW, ScheduleStatusEnum.REJECTED, role)).toBe(true);
      }
      for (const role of ['supervisor', 'field_supervisor', 'chief_technician', 'project_manager']) {
        expect(canRoleTransition(ScheduleStatusEnum.UNDER_REVIEW, ScheduleStatusEnum.APPROVED, role)).toBe(false);
        expect(canRoleTransition(ScheduleStatusEnum.UNDER_REVIEW, ScheduleStatusEnum.REJECTED, role)).toBe(false);
      }
    });

    it('rejected → draft follows the submit set', () => {
      expect(canRoleTransition(ScheduleStatusEnum.REJECTED, ScheduleStatusEnum.DRAFT, 'supervisor')).toBe(true);
      expect(canRoleTransition(ScheduleStatusEnum.REJECTED, ScheduleStatusEnum.DRAFT, 'field_supervisor')).toBe(false);
    });

    it('published/archived stay closed to non-approver roles and archived has no exit', () => {
      for (const role of ['supervisor', 'field_supervisor', 'medical_engineer', 'senior_technician']) {
        expect(canRoleTransition(ScheduleStatusEnum.PUBLISHED, ScheduleStatusEnum.ARCHIVED, role)).toBe(false);
      }
      for (const role of approverRoles) {
        expect(canRoleTransition(ScheduleStatusEnum.ARCHIVED, ScheduleStatusEnum.DRAFT, role)).toBe(false);
      }
    });
  });

  describe('DDD aggregate uses the same map', () => {
    function createSchedule(): Schedule {
      return Schedule.create({ unitId: 'unit-1', month: 8, year: 2026, createdById: 'user-1' });
    }

    it('supervisor may submit but may not approve/reject/publish', () => {
      const s = createSchedule();
      expect(() => s.submitForReview('u-1', 'Supervisor', 'supervisor')).not.toThrow();
      expect(() => s.approve('u-1', 'Supervisor', 'supervisor')).toThrow();
      expect(() => s.reject('u-1', 'Supervisor', 'supervisor', 'reason')).toThrow();
      expect(() => s.publish('u-1', 'Supervisor', 'supervisor')).toThrow();
    });

    it.each(['field_supervisor', 'medical_engineer', 'senior_technician'])(
      '%s can no longer submit in the DDD aggregate',
      (role) => {
        const s = createSchedule();
        expect(() => s.submitForReview('u-1', role, role)).toThrow();
      },
    );

    it('imaging_director and hospital/system admins may approve', () => {
      for (const role of approverRoles) {
        const s = createSchedule();
        s.submitForReview('u-1', 'Submitter', 'supervisor');
        expect(() => s.approve('u-2', role, role)).not.toThrow();
      }
    });

    it('re-opening a rejected draft uses the submit set', () => {
      const s = createSchedule();
      s.submitForReview('u-1', 'Submitter', 'supervisor');
      s.reject('u-2', 'Director', 'imaging_director', 'revise');
      expect(() => s.revertToDraft('u-1', 'Supervisor', 'supervisor')).not.toThrow();
      s.submitForReview('u-1', 'Supervisor', 'supervisor');
      s.reject('u-2', 'Director', 'imaging_director', 'revise');
      expect(() => s.revertToDraft('u-3', 'Field', 'field_supervisor')).toThrow();
    });
  });

  describe('ROLE_PERMISSIONS matches the canonical helpers', () => {
    const workflowFlags: Array<[keyof RolePermissions, (role: string) => boolean]> = [
      ['canSubmit', canSubmitForReview],
      ['canApprove', canApprove],
      ['canReject', canApprove],
      ['canPublish', canPublish],
      ['canArchive', canPublish],
      ['canCreateRevision', canApprove],
      ['canRollback', (role) => hasMinRole(role as UserRole, UserRole.HOSPITAL_ADMIN)],
    ];

    for (const role of Object.keys(ROLE_PERMISSIONS) as UserRole[]) {
      it(`${role} workflow flags are derived from the single source`, () => {
        const permissions = ROLE_PERMISSIONS[role]!;
        for (const [flag, expected] of workflowFlags) {
          expect(permissions[flag], `${role}.${flag}`).toBe(expected(role));
        }
      });
    }
  });
});
