import { validate } from 'class-validator';
import { CreateHolidayDto } from '../create-holiday.dto';
import { describe, it, expect } from 'vitest';

describe('CreateHolidayDto', () => {
  it('should pass with valid data', async () => {
    const dto = new CreateHolidayDto();
    dto.date = '2026-01-01';
    dto.name = 'Yılbaşı';
    dto.type = 'national';
    dto.year = 2026;

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail without date', async () => {
    const dto = new CreateHolidayDto();
    dto.name = 'Yılbaşı';
    dto.type = 'national';
    dto.year = 2026;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail with year below 2020', async () => {
    const dto = new CreateHolidayDto();
    dto.date = '2019-01-01';
    dto.name = 'Test';
    dto.type = 'national';
    (dto as any).year = 2019;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail with year above 2100', async () => {
    const dto = new CreateHolidayDto();
    dto.date = '2101-01-01';
    dto.name = 'Test';
    dto.type = 'national';
    (dto as any).year = 2101;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
