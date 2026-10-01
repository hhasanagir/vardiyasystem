import { describe, it, expect } from 'vitest';
import { validateDeviceForAssignment } from '../domain/models/master-data';
import type { MasterDeviceRecord } from '../domain/models/master-data';

function makeDevice(
  overrides: Partial<MasterDeviceRecord> = {},
): MasterDeviceRecord {
  return {
    id: 'dev-1',
    code: 'MR-A',
    name: 'MR-A Cihaz',
    unitId: 'unit-1',
    workDays: [1, 2, 3, 4, 5],
    startHour: 8,
    endHour: 17,
    mode: 'shared',
    isActive: true,
    requiredSkills: [],
    isMaster: false,
    ...overrides,
  };
}

describe('WorkDays closure validation', () => {
  it('returns empty for active device on its work day', () => {
    const device = makeDevice({ workDays: [1, 2, 3, 4, 5] });
    const result = validateDeviceForAssignment(
      device,
      '2026-08-25',
      'morning',
      1,
    );
    expect(result).toHaveLength(0);
  });

  it('returns warning when device is off on Saturday (dow=6)', () => {
    const device = makeDevice({ workDays: [1, 2, 3, 4, 5] });
    const result = validateDeviceForAssignment(
      device,
      '2026-08-29',
      'morning',
      6,
    );
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].severity).toBe('WARNING');
    expect(result[0].isOverridable).toBe(true);
  });

  it('returns warning when device is off on Sunday (dow=0)', () => {
    const device = makeDevice({ workDays: [1, 2, 3, 4, 5] });
    const result = validateDeviceForAssignment(
      device,
      '2026-08-30',
      'morning',
      0,
    );
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].severity).toBe('WARNING');
  });

  it('returns empty when device works all 7 days including Saturday', () => {
    const device = makeDevice({ workDays: [0, 1, 2, 3, 4, 5, 6] });
    const result = validateDeviceForAssignment(
      device,
      '2026-08-29',
      'morning',
      6,
    );
    expect(result).toHaveLength(0);
  });

  it('returns empty when device works all 7 days including Sunday', () => {
    const device = makeDevice({ workDays: [0, 1, 2, 3, 4, 5, 6] });
    const result = validateDeviceForAssignment(
      device,
      '2026-08-30',
      'morning',
      0,
    );
    expect(result).toHaveLength(0);
  });

  it('returns warning when device works Mon/Wed/Fri and is queried for Tuesday', () => {
    const device = makeDevice({ workDays: [1, 3, 5] });
    const result = validateDeviceForAssignment(
      device,
      '2026-08-25',
      'morning',
      2,
    );
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].severity).toBe('WARNING');
  });

  it('returns empty when device works Mon/Wed/Fri and is queried for Monday', () => {
    const device = makeDevice({ workDays: [1, 3, 5] });
    const result = validateDeviceForAssignment(
      device,
      '2026-08-24',
      'morning',
      1,
    );
    expect(result).toHaveLength(0);
  });

  it('returns warning for every non-work day across a full week for MR workDays=[1,2,3,4,5]', () => {
    const device = makeDevice({ workDays: [1, 2, 3, 4, 5] });
    const warnings: number[] = [];
    const allDows = [0, 1, 2, 3, 4, 5, 6];
    for (const dow of allDows) {
      const result = validateDeviceForAssignment(
        device,
        '2026-08-25',
        'morning',
        dow,
      );
      if (result.length > 0) warnings.push(dow);
    }
    expect(warnings).toEqual([0, 6]);
  });

  it('returns empty for every day when workDays=[0,1,2,3,4,5,6]', () => {
    const device = makeDevice({ workDays: [0, 1, 2, 3, 4, 5, 6] });
    const warnings: number[] = [];
    const allDows = [0, 1, 2, 3, 4, 5, 6];
    for (const dow of allDows) {
      const result = validateDeviceForAssignment(
        device,
        '2026-08-25',
        'morning',
        dow,
      );
      if (result.length > 0) warnings.push(dow);
    }
    expect(warnings).toEqual([]);
  });

  it('does not mutate input device', () => {
    const device = makeDevice();
    const snapshot = JSON.stringify(device);
    validateDeviceForAssignment(device, '2026-08-29', 'morning', 6);
    expect(JSON.stringify(device)).toBe(snapshot);
  });
});
