import {
  SchedulingProblem,
  SchedulingProblemPersonnel,
  SchedulingProblemDevice,
  SchedulingProblemShiftDef,
  SchedulingProblemConfig,
} from '../../domain/optimization/scheduling-problem';
import { AssignmentCollection } from '../../domain/entities/assignment-collection';
import { Assignment } from '../../domain/entities/assignment.entity';

const DEFAULT_CONFIG: SchedulingProblemConfig = {
  fairnessMode: 'balanced',
  maxOvertime: 20,
  includeWeekends: false,
  includeNightShifts: false,
  minRestHours: 11,
  maxConsecutiveDays: 6,
  maxConsecutiveNights: 3,
};

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAYS = [1, 2, 3, 4, 5];

function makePersonnel(
  overrides: Partial<SchedulingProblemPersonnel> & { id: string; name: string },
): SchedulingProblemPersonnel {
  return {
    role: 'technician',
    skills: ['MRI'],
    deviceSkills: ['MRI'],
    nightShiftEligible: true,
    employmentStatus: 'active',
    offDays: [],
    maxWeeklyHours: 40,
    isActive: true,
    ...overrides,
  };
}

function makeDevice(
  overrides: Partial<SchedulingProblemDevice> & {
    id: string;
    code: string;
    name: string;
  },
): SchedulingProblemDevice {
  return {
    mode: 'continuous',
    requiredSkills: ['MRI'],
    workDays: WEEKDAYS,
    startHour: 8,
    endHour: 16,
    ...overrides,
  };
}

function makeProblem(
  overrides: {
    personnel?: SchedulingProblemPersonnel[];
    devices?: SchedulingProblemDevice[];
    shiftDefinitions?: SchedulingProblemShiftDef[];
    holidays?: Set<string>;
    config?: Partial<SchedulingProblemConfig>;
    existingAssignments?: AssignmentCollection;
    unitType?: string;
    serviceLine?: string;
  } = {},
): SchedulingProblem {
  const personnel = overrides.personnel || [
    makePersonnel({ id: 'p1', name: 'Ali' }),
    makePersonnel({ id: 'p2', name: 'Veli' }),
    makePersonnel({
      id: 'p3',
      name: 'Ayse',
      nightShiftEligible: false,
      offDays: [0, 6],
    }),
  ];

  const devices = overrides.devices || [
    makeDevice({ id: 'd1', code: 'MRI-1', name: 'MRI Scanner 1' }),
  ];

  const shiftDefinitions =
    overrides.shiftDefinitions ||
    devices.flatMap((d) =>
      d.workDays.includes(1)
        ? [
            {
              deviceId: d.id,
              shiftType: 'day',
              startTime: '08:00',
              endTime: '16:00',
              personnelType: 'technician',
            },
          ]
        : [],
    );

  return {
    scheduleId: 'test-schedule',
    unitId: 'unit-1',
    unitType: overrides.unitType || 'mr',
    serviceLine: overrides.serviceLine || 'IMAGING',
    year: 2026,
    month: 1,
    personnel,
    devices,
    shiftDefinitions,
    existingAssignments:
      overrides.existingAssignments || new AssignmentCollection(),
    holidays: overrides.holidays || new Set(['2026-01-01']),
    deviceOffDates: new Set(),
    configuration: { ...DEFAULT_CONFIG, ...overrides.config },
  };
}

export function scenarioA_simpleValidSchedule(): SchedulingProblem {
  return makeProblem();
}

export function scenarioB_personnelOverlap(): SchedulingProblem {
  const existing = new AssignmentCollection();
  existing.add(
    Assignment.create({
      scheduleId: 'test-schedule',
      personnelId: 'p1',
      deviceId: 'd1',
      unitId: 'unit-1',
      kind: 'device',
      date: '2026-01-05',
      shiftType: 'day',
      startTime: '08:00',
      endTime: '16:00',
      personnelType: 'technician',
    }),
  );
  return makeProblem({ existingAssignments: existing });
}

export function scenarioC_insufficientRest(): SchedulingProblem {
  const existing = new AssignmentCollection();
  existing.add(
    Assignment.create({
      scheduleId: 'test-schedule',
      personnelId: 'p1',
      deviceId: 'd1',
      unitId: 'unit-1',
      kind: 'device',
      date: '2026-01-05',
      shiftType: 'night',
      startTime: '22:00',
      endTime: '06:00',
      personnelType: 'technician',
    }),
  );
  return makeProblem({
    existingAssignments: existing,
    config: { includeNightShifts: true, includeWeekends: true },
  });
}

export function scenarioD_personnelUnavailable(): SchedulingProblem {
  return makeProblem({
    personnel: [
      makePersonnel({ id: 'p1', name: 'Ali', isActive: false }),
      makePersonnel({ id: 'p2', name: 'Veli' }),
    ],
  });
}

export function scenarioE_resourceOverlap(): SchedulingProblem {
  return makeProblem({
    devices: [makeDevice({ id: 'd1', code: 'MRI-1', name: 'MRI 1' })],
    personnel: [makePersonnel({ id: 'p1', name: 'Ali' })],
    config: { includeNightShifts: true },
  });
}

export function scenarioF_missingCompetency(): SchedulingProblem {
  return makeProblem({
    devices: [
      makeDevice({
        id: 'd1',
        code: 'MRI-1',
        name: 'MRI 1',
        requiredSkills: ['MRI', 'CT'],
      }),
    ],
    personnel: [
      makePersonnel({
        id: 'p1',
        name: 'Ali',
        skills: ['MRI'],
        deviceSkills: ['MRI'],
      }),
      makePersonnel({
        id: 'p2',
        name: 'Veli',
        skills: ['CT'],
        deviceSkills: ['CT'],
      }),
    ],
  });
}

export function scenarioG_unevenWorkload(): SchedulingProblem {
  const existing = new AssignmentCollection();
  for (let day = 1; day <= 10; day++) {
    const date = `2026-01-${String(day).padStart(2, '0')}`;
    if (new Date(date).getDay() === 0 || new Date(date).getDay() === 6)
      continue;
    existing.add(
      Assignment.create({
        scheduleId: 'test-schedule',
        personnelId: 'p1',
        deviceId: 'd1',
        unitId: 'unit-1',
        kind: 'device',
        date,
        shiftType: 'day',
        startTime: '08:00',
        endTime: '16:00',
        personnelType: 'technician',
      }),
    );
  }
  return makeProblem({
    existingAssignments: existing,
    personnel: [
      makePersonnel({ id: 'p1', name: 'Ali' }),
      makePersonnel({ id: 'p2', name: 'Veli' }),
    ],
  });
}

export function scenarioH_unevenNightDistribution(): SchedulingProblem {
  const existing = new AssignmentCollection();
  for (let day = 1; day <= 5; day++) {
    const date = `2026-01-${String(day).padStart(2, '0')}`;
    if (new Date(date).getDay() === 0 || new Date(date).getDay() === 6)
      continue;
    existing.add(
      Assignment.create({
        scheduleId: 'test-schedule',
        personnelId: 'p1',
        deviceId: 'd1',
        unitId: 'unit-1',
        kind: 'device',
        date,
        shiftType: 'night',
        startTime: '22:00',
        endTime: '06:00',
        personnelType: 'technician',
      }),
    );
  }
  return makeProblem({
    existingAssignments: existing,
    personnel: [
      makePersonnel({ id: 'p1', name: 'Ali' }),
      makePersonnel({ id: 'p2', name: 'Veli' }),
    ],
    config: { includeNightShifts: true },
  });
}

export function scenarioI_weekendImbalance(): SchedulingProblem {
  return makeProblem({
    personnel: [
      makePersonnel({ id: 'p1', name: 'Ali', offDays: [] }),
      makePersonnel({ id: 'p2', name: 'Veli', offDays: [0, 6] }),
    ],
    config: { includeWeekends: true },
  });
}

export function scenarioJ_mixedValidInvalid(): SchedulingProblem {
  const existing = new AssignmentCollection();
  existing.add(
    Assignment.create({
      scheduleId: 'test-schedule',
      personnelId: 'p1',
      deviceId: 'd1',
      unitId: 'unit-1',
      kind: 'device',
      date: '2026-01-02',
      shiftType: 'day',
      startTime: '08:00',
      endTime: '16:00',
      personnelType: 'technician',
    }),
  );
  return makeProblem({
    existingAssignments: existing,
    personnel: [
      makePersonnel({ id: 'p1', name: 'Ali' }),
      makePersonnel({ id: 'p2', name: 'Veli' }),
    ],
  });
}

export function scenarioK_imaging(): SchedulingProblem {
  return makeProblem({
    unitType: 'mr',
    serviceLine: 'IMAGING',
    devices: [
      makeDevice({
        id: 'd1',
        code: 'MRI-1',
        name: 'MRI 1',
        requiredSkills: ['MRI'],
      }),
      makeDevice({
        id: 'd2',
        code: 'CT-1',
        name: 'CT 1',
        requiredSkills: ['CT'],
      }),
    ],
    personnel: [
      makePersonnel({
        id: 'p1',
        name: 'Ali',
        skills: ['MRI'],
        deviceSkills: ['MRI'],
      }),
      makePersonnel({
        id: 'p2',
        name: 'Veli',
        skills: ['CT'],
        deviceSkills: ['CT'],
      }),
    ],
  });
}

export function scenarioL_radiationOncology(): SchedulingProblem {
  return makeProblem({
    unitType: 'onkoloji',
    serviceLine: 'RADIATION_ONCOLOGY',
    devices: [
      makeDevice({
        id: 'rt-1',
        code: 'LINAC-1',
        name: 'Linear Accelerator 1',
        requiredSkills: ['LINAC'],
      }),
    ],
    personnel: [
      makePersonnel({
        id: 'rt-p1',
        name: 'RT Tech 1',
        skills: ['LINAC'],
        deviceSkills: ['LINAC'],
      }),
    ],
  });
}

export function scenarioSmall(): SchedulingProblem {
  return makeProblem({
    personnel: Array.from({ length: 10 }, (_, i) =>
      makePersonnel({
        id: `p${i + 1}`,
        name: `Person ${i + 1}`,
        nightShiftEligible: i < 5,
      }),
    ),
    devices: [makeDevice({ id: 'd1', code: 'MRI-1', name: 'MRI 1' })],
  });
}

export function scenarioMedium(): SchedulingProblem {
  return makeProblem({
    personnel: Array.from({ length: 50 }, (_, i) =>
      makePersonnel({
        id: `p${i + 1}`,
        name: `Person ${i + 1}`,
        nightShiftEligible: i < 20,
      }),
    ),
    devices: Array.from({ length: 5 }, (_, i) =>
      makeDevice({
        id: `d${i + 1}`,
        code: `DEV-${i + 1}`,
        name: `Device ${i + 1}`,
      }),
    ),
  });
}

export function scenarioLarge(): SchedulingProblem {
  return makeProblem({
    personnel: Array.from({ length: 200 }, (_, i) =>
      makePersonnel({
        id: `p${i + 1}`,
        name: `Person ${i + 1}`,
        nightShiftEligible: i < 80,
      }),
    ),
    devices: Array.from({ length: 20 }, (_, i) =>
      makeDevice({
        id: `d${i + 1}`,
        code: `DEV-${i + 1}`,
        name: `Device ${i + 1}`,
      }),
    ),
  });
}
