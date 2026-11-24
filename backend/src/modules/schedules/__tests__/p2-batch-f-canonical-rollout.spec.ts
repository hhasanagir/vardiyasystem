import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Assignment } from '../domain/entities/assignment.entity';
import { AssignmentCollection } from '../domain/entities/assignment-collection';
import { ConstraintEngine } from '../domain/constraints/constraint-engine';
import {
  ALL_HARD_CONSTRAINTS,
  DeviceBookedConstraint,
  GroupReferenceConstraint,
  SameSlotConstraint,
  TemplateScopeConstraint,
} from '../domain/constraints/hard-constraints';
import type {
  AssignmentViolation,
  ConstraintContext,
  DeviceInfo,
  DeviceLookup,
  GroupInfo,
  GroupLookup,
  HardConstraint,
  PersonnelInfo,
  PersonnelLookup,
  ShiftTemplateInfo,
  ShiftTemplateLookup,
} from '../domain/constraints/constraint.interface';
import { FairnessSoftConstraint } from '../domain/constraints/soft-fairness';
import { VIOLATION_POLICY } from '../types/violation-policy';
import { initFeatureFlags, isFeatureEnabled } from '../../../config/feature-flags';
import { DDD_CANONICAL_SCHEDULING_FLAG, ScheduleDryRunService } from '../schedule-dry-run.service';
import type { PrismaService } from '../../../prisma.service';
import type { PersonnelAvailabilityService } from '../services/personnel-availability.service';

/**
 * Phase 5C.38 — Batch F regression pins.
 *
 * P2-01/02/03 require a single canonical DDD policy surface with a gradual,
 * read-only-first rollout. The six legacy-only rule codes must be BLOCKING and
 * non-overridable on BOTH surfaces; soft scoring must use real roster data; and
 * the new flag must only label the dry-run until DB/worker parity is proven.
 */
const SIX_LEGACY_RULES = [
  'DEVICE_BOOKED',
  'GROUP_NOT_FOUND',
  'GROUP_NOT_IN_UNIT',
  'TEMPLATE_NOT_IN_GROUP',
  'TEMPLATE_NOT_IN_UNIT',
  'SAME_SLOT',
] as const;

function personnel(id: string, overrides: Partial<PersonnelInfo> = {}): PersonnelInfo {
  return {
    id,
    name: id,
    isActive: true,
    employmentStatus: 'active',
    unitId: 'u-1',
    groupId: null,
    role: 'technician',
    skills: [],
    deviceSkills: [],
    nightShiftEligible: true,
    offDays: [],
    maxWeeklyHours: 40,
    ...overrides,
  };
}

const DEVICE: DeviceInfo = {
  id: 'd-1',
  code: 'D-1',
  name: 'Device 1',
  unitId: 'u-1',
  mode: 'continuous',
  requiredSkills: [],
  workDays: [0, 1, 2, 3, 4, 5, 6],
  isActive: true,
};

const GROUP: GroupInfo = { id: 'g-1', unitId: 'u-1', name: 'Group 1', code: 'G1', isActive: true };

const TEMPLATE: ShiftTemplateInfo = {
  id: 't-1',
  unitId: 'u-1',
  personnelGroupId: 'g-1',
  name: 'Day template',
  shiftType: 'day',
  startTime: '08:00',
  endTime: '16:00',
  isActive: true,
};

interface RuleCase {
  label: string;
  constraint: HardConstraint;
  expectedRule: (typeof SIX_LEGACY_RULES)[number];
  assignmentOverrides?: Record<string, unknown>;
  existing?: Assignment[];
  groups?: GroupInfo[];
  templates?: ShiftTemplateInfo[];
}

const EXISTING = Assignment.create({
  id: 'existing',
  scheduleId: 's-1',
  personnelId: 'p-1',
  deviceId: 'd-1',
  unitId: 'u-1',
  date: '2026-11-24',
  shiftType: 'day',
  startTime: '08:00',
  endTime: '16:00',
  personnelType: 'technician',
});

const RULE_CASES: RuleCase[] = [
  {
    label: 'DEVICE_BOOKED',
    constraint: new DeviceBookedConstraint(),
    expectedRule: 'DEVICE_BOOKED',
    existing: [EXISTING],
  },
  {
    label: 'GROUP_NOT_FOUND',
    constraint: new GroupReferenceConstraint(),
    expectedRule: 'GROUP_NOT_FOUND',
    assignmentOverrides: { personnelGroupId: 'g-missing' },
    groups: [],
  },
  {
    label: 'GROUP_NOT_IN_UNIT',
    constraint: new GroupReferenceConstraint(),
    expectedRule: 'GROUP_NOT_IN_UNIT',
    assignmentOverrides: { personnelGroupId: 'g-2' },
    groups: [{ ...GROUP, id: 'g-2', unitId: 'u-2' }],
  },
  {
    label: 'TEMPLATE_NOT_IN_GROUP',
    constraint: new TemplateScopeConstraint(),
    expectedRule: 'TEMPLATE_NOT_IN_GROUP',
    assignmentOverrides: { kind: 'person', deviceId: null, personnelGroupId: 'g-1', shiftTemplateId: 't-1' },
    templates: [{ ...TEMPLATE, personnelGroupId: 'g-2' }],
  },
  {
    label: 'TEMPLATE_NOT_IN_UNIT',
    constraint: new TemplateScopeConstraint(),
    expectedRule: 'TEMPLATE_NOT_IN_UNIT',
    assignmentOverrides: { kind: 'person', deviceId: null, personnelGroupId: 'g-1', shiftTemplateId: 't-1' },
    templates: [{ ...TEMPLATE, unitId: 'u-2' }],
  },
  {
    label: 'SAME_SLOT',
    constraint: new SameSlotConstraint(),
    expectedRule: 'SAME_SLOT',
    existing: [EXISTING],
  },
];

function evaluateRule(testCase: RuleCase): { violations: AssignmentViolation[]; hasBlocking: boolean } {
  const assignment = Assignment.create({
    id: 'candidate',
    scheduleId: 's-1',
    personnelId: 'p-1',
    deviceId: 'd-1',
    unitId: 'u-1',
    date: '2026-11-24',
    shiftType: 'day',
    startTime: '08:00',
    endTime: '16:00',
    personnelType: 'technician',
    ...testCase.assignmentOverrides,
  });
  const existing = new AssignmentCollection(testCase.existing ?? []);
  const people = [personnel('p-1', { groupId: testCase.assignmentOverrides?.personnelGroupId as string | null ?? null })];
  const personnelLookup: PersonnelLookup = {
    findById: id => people.find(p => p.id === id),
    all: () => people,
  };
  const deviceLookup: DeviceLookup = { findById: id => (id === DEVICE.id ? DEVICE : undefined) };
  const groups = testCase.groups ?? [GROUP];
  const templates = testCase.templates ?? [TEMPLATE];
  const groupLookup: GroupLookup = { findById: id => groups.find(g => g.id === id) };
  const templateLookup: ShiftTemplateLookup = { findById: id => templates.find(t => t.id === id) };

  const report = new ConstraintEngine([testCase.constraint]).validate(
    assignment,
    existing,
    personnelLookup,
    deviceLookup,
    new Set<string>(),
    new Set<string>(),
    templateLookup,
    groupLookup,
  );
  return { violations: report.violations, hasBlocking: report.hasBlocking };
}

describe('P2-01/02/03 — canonical DDD rollout', () => {
  it('registers every promoted legacy rule in the canonical engine with strictest-wins policy', () => {
    const codes = new Set(ALL_HARD_CONSTRAINTS.map(c => c.code));
    expect(codes.has('DEVICE_BOOKED')).toBe(true);
    expect(codes.has('GROUP_NOT_FOUND')).toBe(true);
    expect(codes.has('TEMPLATE_NOT_IN_GROUP')).toBe(true);
    expect(codes.has('SAME_SLOT')).toBe(true);
    expect(ALL_HARD_CONSTRAINTS.some(c => c instanceof GroupReferenceConstraint)).toBe(true);
    expect(ALL_HARD_CONSTRAINTS.some(c => c instanceof TemplateScopeConstraint)).toBe(true);

    for (const rule of SIX_LEGACY_RULES) {
      expect(VIOLATION_POLICY[rule], `${rule} must be authoritative`).toMatchObject({
        severity: 'BLOCKING',
        isOverrideAllowed: false,
      });
    }
  });

  it.each(RULE_CASES)('emits $label as BLOCKING and non-overridable from the shared engine', testCase => {
    const { violations, hasBlocking } = evaluateRule(testCase);
    const matched = violations.filter(v => v.rule === testCase.expectedRule);

    expect(hasBlocking).toBe(true);
    expect(matched.length).toBeGreaterThan(0);
    for (const violation of matched) {
      expect(violation.severity).toBe('BLOCKING');
      expect(violation.isOverrideAllowed).toBe(false);
    }
  });

  it('keeps the legacy manual validator aligned with the same six rule codes', () => {
    const legacySource = readFileSync(resolve(__dirname, '../schedules.service.ts'), 'utf-8');
    for (const rule of SIX_LEGACY_RULES) {
      expect(legacySource, `${rule} must remain emitted by the legacy validator`).toContain(`rule: '${rule}'`);
    }
  });
});

describe('P2-02 — soft fairness uses the real roster and real month length', () => {
  it('pins personnelCount, realPersonnelData and leap-safe monthDays in score metadata', () => {
    const roster = [
      personnel('p-1', { name: 'Zeynep', nightShiftEligible: true, maxWeeklyHours: 40 }),
      personnel('p-2', { name: 'Ali', nightShiftEligible: false, maxWeeklyHours: 32 }),
      personnel('p-3', { name: 'Ayse', nightShiftEligible: true, maxWeeklyHours: 48 }),
    ];
    const lookup: PersonnelLookup = {
      findById: id => roster.find(p => p.id === id),
      all: () => roster,
    };
    const context: ConstraintContext = {
      assignment: Assignment.create({
        scheduleId: 's-1',
        personnelId: 'p-1',
        deviceId: 'd-1',
        unitId: 'u-1',
        date: '2024-02-29',
        shiftType: 'day',
        startTime: '08:00',
        endTime: '16:00',
      }),
      existingAssignments: new AssignmentCollection([]),
      personnelLookup: lookup,
      deviceLookup: { findById: () => DEVICE },
      holidays: new Set<string>(),
      deviceOffDates: new Set<string>(),
      templates: { findById: () => TEMPLATE },
      groups: { findById: () => GROUP },
      now: new Date('2024-02-01T00:00:00Z'),
      year: 2024,
      month: 2,
    };

    const score = new FairnessSoftConstraint().evaluate(context);

    expect(score.constraintId).toBe('FAIRNESS');
    expect(score.metadata).toMatchObject({
      personnelCount: 3,
      realPersonnelData: true,
      monthDays: 29,
    });
    expect(score.metadata?.nightScore).toBe(100);
  });
});

const ORIGINAL_FLAG = process.env[DDD_CANONICAL_SCHEDULING_FLAG];

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env[DDD_CANONICAL_SCHEDULING_FLAG];
  else process.env[DDD_CANONICAL_SCHEDULING_FLAG] = ORIGINAL_FLAG;
  initFeatureFlags();
});

function executeDryRun(): Promise<{ metadata: { rolloutMode?: string } }> {
  const prisma = {
    unit: { findFirst: vi.fn(() => Promise.resolve({ id: 'u-1', organizationId: 'org-1' })) },
    schedule: { findFirst: vi.fn(() => Promise.resolve({ id: 's-1' })) },
    personnel: { findMany: vi.fn(() => Promise.resolve([])) },
    device: { findMany: vi.fn(() => Promise.resolve([])) },
    shifts: { findMany: vi.fn(() => Promise.resolve([])) },
    holiday: { findMany: vi.fn(() => Promise.resolve([])) },
    assignment: { findMany: vi.fn(() => Promise.resolve([])) },
    deviceOffDate: { findMany: vi.fn(() => Promise.resolve([])) },
    shiftDateOverride: { findMany: vi.fn(() => Promise.resolve([])) },
  };
  const availability = { resolveMonthBlockedDates: vi.fn(() => Promise.resolve(new Map())) };
  const service = new ScheduleDryRunService(
    prisma as unknown as PrismaService,
    availability as unknown as PersonnelAvailabilityService,
  );
  return service.execute({
    scheduleId: 's-1',
    unitType: 'imaging',
    year: 2026,
    month: 11,
  });
}

describe('P2-01/02/03 — feature-flagged read-only cutover', () => {
  it('defaults to false and labels dry-runs as legacy-migration', async () => {
    delete process.env[DDD_CANONICAL_SCHEDULING_FLAG];
    initFeatureFlags();

    expect(isFeatureEnabled(DDD_CANONICAL_SCHEDULING_FLAG)).toBe(false);
    expect((await executeDryRun()).metadata.rolloutMode).toBe('legacy-migration');
  });

  it('labels canonical mode only after the flag is explicitly enabled', async () => {
    process.env[DDD_CANONICAL_SCHEDULING_FLAG] = 'true';
    initFeatureFlags();

    expect(isFeatureEnabled(DDD_CANONICAL_SCHEDULING_FLAG)).toBe(true);
    expect((await executeDryRun()).metadata.rolloutMode).toBe('canonical');
  });
});
