import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScheduleValidationService } from '../schedule-validation.service';

const mockPrisma = {
  assignment: { findMany: vi.fn() },
  personnel: { findMany: vi.fn() },
  device: { findMany: vi.fn() },
  personShiftTemplate: { findMany: vi.fn() },
  personnelGroup: { findMany: vi.fn() },
  holiday: { findMany: vi.fn() },
  deviceOffDate: { findMany: vi.fn() },
};

function makeDevice(id = 'dev-1', overrides: Record<string, unknown> = {}) {
  return {
    id,
    code: 'DEV-1',
    name: 'DEV-1 Cihaz',
    unitId: 'u-1',
    mode: 'shared',
    requiredSkills: [],
    workDays: [1, 2, 3, 4, 5], // Mon-Fri
    isActive: true,
    ...overrides,
  };
}

const BASE_ASSIGNMENT = {
  scheduleId: 's-1',
  personnelId: 'p-1',
  deviceId: 'dev-1',
  unitId: null,
  personnelGroupId: null,
  shiftTemplateId: null,
  kind: 'device',
  date: '2026-08-10', // Monday, working day
  shiftType: 'day',
  startTime: '08:00',
  endTime: '16:00',
  personnelType: 'technician',
};

describe('ScheduleValidationService (engine path used by update/override/swap/apply)', () => {
  let service: ScheduleValidationService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.personnel.findMany.mockResolvedValue([
      { id: 'p-1', name: 'P', isActive: true, employmentStatus: 'active', unitId: 'u-1', groupId: null, role: 'technician', skills: [], deviceSkills: [], nightShiftEligible: true, offDays: [], maxWeeklyHours: 40 },
    ]);
    mockPrisma.device.findMany.mockResolvedValue([makeDevice()]);
    mockPrisma.personShiftTemplate.findMany.mockResolvedValue([]);
    mockPrisma.personnelGroup.findMany.mockResolvedValue([]);
    mockPrisma.holiday.findMany.mockResolvedValue([]);
    mockPrisma.deviceOffDate.findMany.mockResolvedValue([]);
    mockPrisma.assignment.findMany.mockResolvedValue([]);
    service = new ScheduleValidationService(mockPrisma as any);
  });

  it('update to Saturday on a Mon-Fri device is Blocking UNIT_CLOSED (self-exclusion works)', async () => {
    // existing assignment on Monday + candidate result on Saturday for same assignment id
    mockPrisma.assignment.findMany.mockResolvedValue([{ ...BASE_ASSIGNMENT, id: 'a-1', date: '2026-08-10' }]);
    const report = await service.validateAssignment(
      's-1',
      { ...BASE_ASSIGNMENT, date: '2026-08-15' }, // Saturday
      'a-1', // exclude self
    );
    const v = report.violations.find(x => x.rule === 'UNIT_CLOSED');
    expect(v).toBeDefined();
    expect(v!.severity).toBe('BLOCKING');
    expect(report.hasBlocking).toBe(true);
  });

  it('update to Sunday on a Mon-Fri device is Blocking UNIT_CLOSED', async () => {
    const report = await service.validateAssignment('s-1', { ...BASE_ASSIGNMENT, date: '2026-08-16' }, 'a-1');
    expect(report.violations.find(x => x.rule === 'UNIT_CLOSED')?.severity).toBe('BLOCKING');
    expect(report.hasBlocking).toBe(true);
  });

  it('PHASE 5C.25 — candidate on a personnel weekly-off day is Blocking PERSONNEL_AVAILABILITY_CONFLICT', async () => {
    mockPrisma.personnel.findMany.mockResolvedValue([
      { id: 'p-1', name: 'P', isActive: true, employmentStatus: 'active', unitId: 'u-1', groupId: null, role: 'technician', skills: [], deviceSkills: [], nightShiftEligible: true, offDays: [1], maxWeeklyHours: 40 },
    ]);
    mockPrisma.assignment.findMany.mockResolvedValue([]);
    // 2026-08-10 is Monday; offDays [1] resolves to a blocked date via the loader.
    const report = await service.validateAssignment('s-1', BASE_ASSIGNMENT);
    const v = report.violations.find(x => x.rule === 'PERSONNEL_AVAILABILITY_CONFLICT');
    expect(v).toBeDefined();
    expect(v!.severity).toBe('BLOCKING');
    expect(report.hasBlocking).toBe(true);
  });

  it('PHASE 5C.25 — an explicit AVAILABLE row (empty resolved map) overrides the weekly off-day', async () => {
    mockPrisma.personnel.findMany.mockResolvedValue([
      { id: 'p-1', name: 'P', isActive: true, employmentStatus: 'active', unitId: 'u-1', groupId: null, role: 'technician', skills: [], deviceSkills: [], nightShiftEligible: true, offDays: [1], maxWeeklyHours: 40 },
    ]);
    mockPrisma.assignment.findMany.mockResolvedValue([]);
    const availabilityService = { resolveMonthBlockedDates: vi.fn().mockResolvedValue(new Map()) };
    const svc = new ScheduleValidationService(mockPrisma as any, availabilityService as any);
    const report = await svc.validateAssignment('s-1', BASE_ASSIGNMENT);
    expect(report.violations.find(x => x.rule === 'PERSONNEL_AVAILABILITY_CONFLICT')).toBeUndefined();
  });

  it('update to valid working day succeeds on the SAME assignment (no self-conflict)', async () => {
    mockPrisma.assignment.findMany.mockResolvedValue([{ ...BASE_ASSIGNMENT, id: 'a-1', date: '2026-08-10' }]);
    const report = await service.validateAssignment('s-1', { ...BASE_ASSIGNMENT, date: '2026-08-12' }, 'a-1');
    expect(report.hasBlocking).toBe(false);
    expect(report.violations.find(x => x.rule === 'UNIT_CLOSED')).toBeUndefined();
  });

  it('active DeviceOffDate produces Blocking DEVICE_OFF_DATE', async () => {
    mockPrisma.deviceOffDate.findMany.mockResolvedValue([{ deviceId: 'dev-1', date: '2026-08-11' }]);
    const report = await service.validateAssignment('s-1', { ...BASE_ASSIGNMENT, date: '2026-08-11' }, 'a-1');
    const v = report.violations.find(x => x.rule === 'DEVICE_OFF_DATE');
    expect(v).toBeDefined();
    expect(v!.severity).toBe('BLOCKING');
    expect(report.hasBlocking).toBe(true);
  });

  it('inactive DeviceOffDate does NOT block (isActive filter)', async () => {
    // service only loads isActive:true via WHERE, so mock returns nothing
    const report = await service.validateAssignment('s-1', { ...BASE_ASSIGNMENT, date: '2026-08-11' }, 'a-1');
    expect(report.violations.find(x => x.rule === 'DEVICE_OFF_DATE')).toBeUndefined();
    expect(report.hasBlocking).toBe(false);
  });

  it('empty workDays retains existing semantics (no UNIT_CLOSED)', async () => {
    mockPrisma.device.findMany.mockResolvedValue([makeDevice('dev-1', { workDays: [] })]);
    const report = await service.validateAssignment('s-1', { ...BASE_ASSIGNMENT, date: '2026-08-15' }, 'a-1');
    expect(report.violations.find(x => x.rule === 'UNIT_CLOSED')).toBeUndefined();
  });

  it('validateWithOverride cannot override UNIT_CLOSED even if client claims it', async () => {
    const report = await service.validateWithOverride(
      's-1',
      { ...BASE_ASSIGNMENT, date: '2026-08-15' },
      ['UNIT_CLOSED'],
      'a-1',
    );
    expect(report.hasBlocking).toBe(true);
    expect(report.violations.find(x => x.rule === 'UNIT_CLOSED')).toBeDefined();
  });

  it('validateWithOverride cannot override DEVICE_OFF_DATE even if client claims it', async () => {
    mockPrisma.deviceOffDate.findMany.mockResolvedValue([{ deviceId: 'dev-1', date: '2026-08-11' }]);
    const report = await service.validateWithOverride(
      's-1',
      { ...BASE_ASSIGNMENT, date: '2026-08-11' },
      ['DEVICE_OFF_DATE'],
      'a-1',
    );
    expect(report.hasBlocking).toBe(true);
    expect(report.violations.find(x => x.rule === 'DEVICE_OFF_DATE')).toBeDefined();
  });
});
