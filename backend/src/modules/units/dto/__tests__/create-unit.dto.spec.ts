import { validate } from 'class-validator';
import { CreateUnitDto } from '../create-unit.dto';
import { describe, it, expect } from 'vitest';

describe('CreateUnitDto', () => {
  it('should pass with valid data', async () => {
    const dto = new CreateUnitDto();
    dto.name = 'MR Servisi';
    dto.code = 'MR';
    dto.type = 'mr';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail without name', async () => {
    const dto = new CreateUnitDto();
    dto.code = 'MR';
    dto.type = 'mr';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('name');
  });

  it('should fail without code', async () => {
    const dto = new CreateUnitDto();
    dto.name = 'MR Servisi';
    dto.type = 'mr';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('code');
  });

  it('should fail without type', async () => {
    const dto = new CreateUnitDto();
    dto.name = 'MR Servisi';
    dto.code = 'MR';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('type');
  });

  it('should accept optional organizationId', async () => {
    const dto = new CreateUnitDto();
    dto.name = 'MR Servisi';
    dto.code = 'MR';
    dto.type = 'mr';
    dto.organizationId = 'org-1';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});
