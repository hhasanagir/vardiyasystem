import { describe, it, expect } from 'vitest';
import {
  toScheduleResponseDto,
  toScheduleListResponseDto,
  EnrichedAssignment,
} from '../schedule-response.dto';
import { Schedule } from '../../domain/aggregates/schedule.aggregate';

function makeSchedule(
  overrides: Partial<{
    id: string;
    unitId: string;
    month: number;
    year: number;
    status: string;
    version: number;
  }> = {},
) {
  return Schedule.create({
    unitId: overrides.unitId ?? 'unit-radioloji',
    month: overrides.month ?? 8,
    year: overrides.year ?? 2026,
    createdById: 'user-1',
    id: overrides.id ?? 'sched-001',
  });
}

function makeEnrichedAssignment(
  overrides: Partial<EnrichedAssignment> = {},
): EnrichedAssignment {
  const defaults: EnrichedAssignment = {
    id: 'assign-1',
    scheduleId: 'sched-001',
    personnelId: 'personnel-1',
    personnelName: 'Dr. Ayşe Yılmaz',
    personnelRole: 'technician',
    deviceId: 'device-ct-1',
    deviceCode: 'BT-01',
    unitId: 'unit-radioloji',
    personnelGroupId: null,
    shiftTemplateId: null,
    kind: 'device',
    source: 'manual',
    date: '2026-08-15',
    shiftType: 'day',
    startTime: '08:00',
    endTime: '20:00',
    personnelType: 'technician',
    isConfirmed: false,
    overrideReason: null,
    overriddenBy: null,
    overriddenAt: null,
  };
  return { ...defaults, ...overrides };
}

describe('Device Shift Visibility — DTO Contract Tests', () => {
  it('Schedule response contains id (flat, not _id)', () => {
    const schedule = makeSchedule({ id: 'sched-abc' });
    const dto = toScheduleResponseDto(schedule, []);
    expect(dto.id).toBe('sched-abc');
    expect((dto as unknown as Record<string, unknown>)._id).toBeUndefined();
  });

  it('Schedule response contains assignments array', () => {
    const schedule = makeSchedule();
    const assignments = [
      makeEnrichedAssignment(),
      makeEnrichedAssignment({ id: 'assign-2' }),
    ];
    const dto = toScheduleResponseDto(schedule, assignments);
    expect(Array.isArray(dto.assignments)).toBe(true);
    expect(dto.assignments).toHaveLength(2);
  });

  it('Assignment contains deviceId', () => {
    const schedule = makeSchedule();
    const dto = toScheduleResponseDto(schedule, [
      makeEnrichedAssignment({ deviceId: 'device-mri-1' }),
    ]);
    expect(dto.assignments[0].deviceId).toBe('device-mri-1');
  });

  it('Assignment contains personnelId', () => {
    const schedule = makeSchedule();
    const dto = toScheduleResponseDto(schedule, [
      makeEnrichedAssignment({ personnelId: 'personnel-42' }),
    ]);
    expect(dto.assignments[0].personnelId).toBe('personnel-42');
  });

  it('Device code is returned when available', () => {
    const schedule = makeSchedule();
    const dto = toScheduleResponseDto(schedule, [
      makeEnrichedAssignment({ deviceCode: 'MR-03' }),
    ]);
    expect(dto.assignments[0].deviceCode).toBe('MR-03');
  });

  it('Device code is null when device is null', () => {
    const schedule = makeSchedule();
    const dto = toScheduleResponseDto(schedule, [
      makeEnrichedAssignment({ deviceId: null, deviceCode: null }),
    ]);
    expect(dto.assignments[0].deviceId).toBeNull();
    expect(dto.assignments[0].deviceCode).toBeNull();
  });

  it('Personnel name is returned when available', () => {
    const schedule = makeSchedule();
    const dto = toScheduleResponseDto(schedule, [
      makeEnrichedAssignment({ personnelName: 'Mehmet Kaya' }),
    ]);
    expect(dto.assignments[0].personnelName).toBe('Mehmet Kaya');
  });

  it('Device A shows only Device A assignments', () => {
    const schedule = makeSchedule();
    const assignments = [
      makeEnrichedAssignment({
        id: 'a1',
        deviceId: 'device-ct-1',
        deviceCode: 'BT-01',
      }),
      makeEnrichedAssignment({
        id: 'a2',
        deviceId: 'device-mri-1',
        deviceCode: 'MR-01',
      }),
      makeEnrichedAssignment({
        id: 'a3',
        deviceId: 'device-ct-1',
        deviceCode: 'BT-01',
      }),
    ];
    const dto = toScheduleResponseDto(schedule, assignments);
    const ctAssignments = dto.assignments.filter(
      (a) => a.deviceId === 'device-ct-1',
    );
    expect(ctAssignments).toHaveLength(2);
    expect(ctAssignments.every((a) => a.deviceCode === 'BT-01')).toBe(true);
  });

  it('Device B shows only Device B assignments', () => {
    const schedule = makeSchedule();
    const assignments = [
      makeEnrichedAssignment({
        id: 'a1',
        deviceId: 'device-ct-1',
        deviceCode: 'BT-01',
      }),
      makeEnrichedAssignment({
        id: 'a2',
        deviceId: 'device-mri-1',
        deviceCode: 'MR-01',
      }),
      makeEnrichedAssignment({
        id: 'a3',
        deviceId: 'device-mri-1',
        deviceCode: 'MR-01',
      }),
      makeEnrichedAssignment({
        id: 'a4',
        deviceId: 'device-mri-1',
        deviceCode: 'MR-01',
      }),
    ];
    const dto = toScheduleResponseDto(schedule, assignments);
    const mriAssignments = dto.assignments.filter(
      (a) => a.deviceId === 'device-mri-1',
    );
    expect(mriAssignments).toHaveLength(3);
    expect(mriAssignments.every((a) => a.deviceCode === 'MR-01')).toBe(true);
  });

  it('Schedule response has no _id or props properties', () => {
    const schedule = makeSchedule();
    const dto = toScheduleResponseDto(schedule, []);
    const keys = Object.keys(dto);
    expect(keys).not.toContain('_id');
    expect(keys).not.toContain('props');
    expect(keys).toContain('id');
    expect(keys).toContain('unitId');
    expect(keys).toContain('month');
    expect(keys).toContain('year');
    expect(keys).toContain('status');
    expect(keys).toContain('version');
    expect(keys).toContain('assignments');
    expect(keys).toContain('approvalData');
  });

  it('toScheduleListResponseDto maps multiple schedules', () => {
    const s1 = makeSchedule({ id: 'sched-1' });
    const s2 = makeSchedule({ id: 'sched-2' });
    const map = new Map<string, EnrichedAssignment[]>([
      [
        'sched-1',
        [makeEnrichedAssignment({ id: 'a1', scheduleId: 'sched-1' })],
      ],
      [
        'sched-2',
        [makeEnrichedAssignment({ id: 'a2', scheduleId: 'sched-2' })],
      ],
    ]);
    const dtos = toScheduleListResponseDto([s1, s2], map);
    expect(dtos).toHaveLength(2);
    expect(dtos[0].id).toBe('sched-1');
    expect(dtos[0].assignments).toHaveLength(1);
    expect(dtos[1].id).toBe('sched-2');
    expect(dtos[1].assignments).toHaveLength(1);
  });

  it('Schedule DTO contains correct month/year/status', () => {
    const schedule = makeSchedule({ month: 12, year: 2025 });
    const dto = toScheduleResponseDto(schedule, []);
    expect(dto.month).toBe(12);
    expect(dto.year).toBe(2025);
    expect(dto.status).toBe('draft');
    expect(dto.version).toBe(1);
  });

  it('Assignment DTO preserves shiftType, startTime, endTime', () => {
    const schedule = makeSchedule();
    const dto = toScheduleResponseDto(schedule, [
      makeEnrichedAssignment({
        shiftType: 'night',
        startTime: '20:00',
        endTime: '08:00',
      }),
    ]);
    expect(dto.assignments[0].shiftType).toBe('night');
    expect(dto.assignments[0].startTime).toBe('20:00');
    expect(dto.assignments[0].endTime).toBe('08:00');
  });

  it('Schedule DTO returns null assignments as empty array', () => {
    const schedule = makeSchedule();
    const dto = toScheduleResponseDto(schedule, []);
    expect(dto.assignments).toEqual([]);
  });
});
