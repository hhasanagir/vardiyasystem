/**
 * PHASE 5C.26 P1-A2 — ScheduleCoverageService.
 *
 * The SINGLE Prisma-backed loader + evaluator for minimum-coverage staffing
 * requirements. Every enforcing surface (ScheduleValidationService, the legacy
 * publish gate in SchedulesWorkflowService, and the generator) calls the same
 * calculation; all slot enumeration/counting lives in CoverageEngine.
 *
 * All loads are batched (no N+1). Scope is strictly per unit, mirroring the
 * generator's loaders, so coverage can never leak across organizations.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma.service';
import { CoverageEngine } from '../domain/coverage/coverage-engine';
import {
  CoverageInput,
  CoverageResult,
  CoverageAssignmentInput,
  CoverageDeviceSpec,
  CoverageShiftDefSpec,
} from '../domain/coverage/coverage-types';
import { Conflict, ConflictCode, ConflictSeverity, createConflict } from '../domain/models/conflict';
import { PersonnelAvailabilityService } from './personnel-availability.service';

export interface ScheduleCoverageQuery {
  unitId: string;
  scheduleId?: string;
  year: number;
  month: number;
  includeWeekends?: boolean;
  includeNightShifts?: boolean;
}

@Injectable()
export class ScheduleCoverageService {
  private readonly engine = new CoverageEngine();

  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService?: PersonnelAvailabilityService,
  ) {}

  /**
   * Default staffing horizon for persisted-schedule enforcement. WorkDays
   * gating already keeps weekend days inert for weekday-only devices, so
   * weekend inclusion only ever extends requirements to devices that declare
   * weekend work.
   *
   * PHASE 5C.28 P1-1 — `extraAssignments` overlays a not-yet-persisted candidate
   * set (e.g. the exact batch ScheduleAutoGeneratorService.apply() is about to
   * write) onto the schedule's persisted assignments, so the merged proposal is
   * judged by the identical authoritative engine before any row is created.
   */
  async evaluateScheduleCoverage(
    query: ScheduleCoverageQuery,
    extraAssignments?: CoverageAssignmentInput[],
  ): Promise<CoverageResult> {
    const { unitId, scheduleId, year, month } = query;
    const includeWeekends = query.includeWeekends ?? true;
    const includeNightShifts = query.includeNightShifts ?? true;

    const startDate = `${year}-${pad2(month)}-01`;
    const endDate = `${year}-${pad2(month)}-31`;

    const [
      deviceRecords,
      shiftRecords,
      deviceOffRecords,
      overrideRecords,
      holidayRecords,
      personnelRecords,
      assignmentRecords,
    ] = await Promise.all([
      this.prisma.device.findMany({
        where: { unitId, isActive: true },
        select: { id: true, name: true, mode: true, workDays: true },
      }),
      this.prisma.shifts.findMany({
        where: { unitId, isActive: true, deviceId: { not: null } },
        select: {
          id: true,
          deviceId: true,
          type: true,
          startTime: true,
          endTime: true,
          personnelType: true,
          blockId: true,
          optionalOnWeekends: true,
          optionalOnHolidays: true,
        },
      }),
      this.prisma.deviceOffDate.findMany({
        where: { device: { unitId }, isActive: true, date: { gte: startDate, lte: endDate } },
        select: { deviceId: true, date: true },
      }),
      this.prisma.shiftDateOverride.findMany({
        where: { date: { gte: startDate, lte: endDate }, isEnabled: true },
        select: { shiftId: true, date: true },
      }),
      this.prisma.holiday.findMany({
        where: { year },
        select: { date: true },
      }),
      this.prisma.personnel.findMany({
        where: { unitId, isActive: true },
        select: { id: true, role: true, offDays: true },
      }),
      scheduleId
        ? this.prisma.assignment.findMany({
            where: { scheduleId },
            select: {
              personnelId: true,
              deviceId: true,
              date: true,
              shiftType: true,
              personnelType: true,
            },
          })
        : Promise.resolve<{ personnelId: string; deviceId: string; date: string; shiftType: string; personnelType: string }[]>([]),
    ]);

    const devices: CoverageDeviceSpec[] = deviceRecords.map(r => ({
      id: r.id,
      name: r.name,
      mode: r.mode || 'continuous',
      workDays: r.workDays || [1, 2, 3, 4, 5],
    }));

    const shiftDefs: CoverageShiftDefSpec[] = shiftRecords
      .filter(r => r.deviceId !== null)
      .map(r => ({
        id: r.id,
        deviceId: r.deviceId!,
        shiftType: r.type,
        startTime: r.startTime || undefined,
        endTime: r.endTime || undefined,
        personnelType: r.personnelType || 'technician',
        blockId: r.blockId,
        optionalOnWeekends: r.optionalOnWeekends,
        optionalOnHolidays: r.optionalOnHolidays,
      }));

    const personnelRefs = personnelRecords.map(p => ({ id: p.id, offDays: p.offDays || [] }));
    const blockedPersonnelDates = this.availabilityService
      ? await this.availabilityService.resolveMonthBlockedDates(personnelRefs, year, month)
      : PersonnelAvailabilityService.blockedByWeeklyOffDays(personnelRefs, year, month);

    const pendingAssignments: CoverageAssignmentInput[] = extraAssignments
      ? extraAssignments
          .filter(a => Boolean(a.deviceId))
          .map(a => ({
            personnelId: a.personnelId,
            deviceId: a.deviceId!,
            date: a.date,
            shiftType: a.shiftType,
            personnelType: a.personnelType || 'technician',
          }))
      : [];

    const assignments: CoverageAssignmentInput[] = [
      ...assignmentRecords
        .filter((a): a is typeof a & { deviceId: string } => a.deviceId !== null)
        .map(a => ({
          personnelId: a.personnelId,
          deviceId: a.deviceId,
          date: a.date,
          shiftType: a.shiftType,
          personnelType: a.personnelType || 'technician',
        })),
      ...pendingAssignments,
    ];

    const input: CoverageInput = {
      year,
      month,
      includeWeekends,
      includeNightShifts,
      devices,
      shiftDefs,
      holidays: new Set(holidayRecords.map(h => h.date)),
      deviceOffDates: new Set(deviceOffRecords.map(r => `${r.deviceId}:${r.date}`)),
      shiftDateOverrides: new Set(overrideRecords.map(r => `${r.shiftId}|${r.date}`)),
      technicianPersonnelCount: personnelRecords.filter(r => isTechnicianRole(r.role)).length,
      assistantPersonnelCount: personnelRecords.filter(r => r.role === 'assistant_technician').length,
      supervisorPersonnelCount: personnelRecords.filter(r => r.role === 'supervisor').length,
      assignments,
      blockedPersonnelDates,
    };

    return this.engine.evaluateCoverage(input);
  }

  /**
   * Direct evaluation over an already-reduced, pure CoverageInput — used by the
   * legacy generator (which holds every context in memory) so its proposal is
   * judged by the exact same Calculation as validation/publish.
   */
  evaluateCoverage(input: CoverageInput): CoverageResult {
    return this.engine.evaluateCoverage(input);
  }

  /**
   * Builds ERROR-severity, non-overridable COVERAGE_MISSING conflicts from an
   * under-covered result, reusing the canonical conflict code (never a new
   * code/severity model). Note: this method is a convenience — the violation
   * shape follows Conflict; every enforcing consumer uses it.
   */
  buildCoverageConflicts(result: CoverageResult): Conflict[] {
    return result.underCoverage.map(line => {
      const context: Record<string, unknown> = {
        date: line.date,
        shiftType: line.shiftType,
        startTime: '',
        endTime: '',
        deviceId: line.deviceId,
        deviceName: line.deviceName,
        unitId: undefined,
      };
      (context as any).requiredCoverage = line.required;
      (context as any).assignedCoverage = line.assigned;
      (context as any).shortfall = line.shortfall;
      (context as any).personnelType = line.personnelType;
      return createConflict({
        code: ConflictCode.COVERAGE_MISSING,
        severity: ConflictSeverity.ERROR,
        message: `Minimum kadro karşılanmıyor: ${line.deviceName} ${line.date} ${line.shiftType} (${line.personnelType}) — gerekli ${line.required}, atanmış ${line.assigned}.`,
        context: context as any,
        isHardConstraint: true,
        isOverridable: false,
      });
    });
  }
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function isTechnicianRole(role?: string): boolean {
  if (!role || role === 'technician' || role === 'senior_technician') return true;
  return role.startsWith('technician_');
}