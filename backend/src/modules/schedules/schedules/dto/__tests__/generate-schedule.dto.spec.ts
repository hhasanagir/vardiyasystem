import { validate } from 'class-validator';
import { ApplyGeneratedScheduleDto } from '../generate-schedule.dto';
import { describe, it, expect } from 'vitest';

describe('ApplyGeneratedScheduleDto', () => {
  const pipeOptions = { whitelist: true, forbidNonWhitelisted: true };

  it('should pass with scheduleId and assignments array', async () => {
    const dto = new ApplyGeneratedScheduleDto();
    dto.scheduleId = 'schedule-1';
    dto.assignments = [
      {
        personnelId: 'p1',
        deviceId: 'd1',
        date: '2026-08-04',
        shiftType: 'day',
        startTime: '08:00',
        endTime: '20:00',
        personnelName: 'Ahmet',
      },
    ];

    const errors = await validate(dto, pipeOptions);
    expect(errors.length).toBe(0);
  });

  it('should reject missing scheduleId', async () => {
    const dto = new ApplyGeneratedScheduleDto();
    dto.assignments = [];

    const errors = await validate(dto, pipeOptions);
    expect(errors.some((e) => e.property === 'scheduleId')).toBe(true);
  });

  it('should reject non-array assignments', async () => {
    const dto = new ApplyGeneratedScheduleDto();
    dto.scheduleId = 'schedule-1';
    (dto as any).assignments = 'not-an-array';

    const errors = await validate(dto, pipeOptions);
    expect(errors.some((e) => e.property === 'assignments')).toBe(true);
  });

  it('should not flag assignments as a non-whitelisted property', async () => {
    const dto = new ApplyGeneratedScheduleDto();
    dto.scheduleId = 'schedule-1';
    dto.assignments = [
      {
        personnelId: 'p1',
        deviceId: 'd1',
        date: '2026-08-04',
        shiftType: 'day',
        startTime: '08:00',
        endTime: '20:00',
      },
    ];

    const errors = await validate(dto, pipeOptions);
    const messages = errors
      .map((e) => Object.values(e.constraints || {}).join('; '))
      .join('; ');
    expect(messages).not.toMatch(/should not exist/i);
  });
});
