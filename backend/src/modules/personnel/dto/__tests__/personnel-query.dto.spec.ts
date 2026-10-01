import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PersonnelQueryDto } from '../personnel-query.dto';
import { describe, it, expect } from 'vitest';

describe('PersonnelQueryDto', () => {
  it('should pass with empty query', async () => {
    const dto = new PersonnelQueryDto();
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should pass with unitId', async () => {
    const dto = new PersonnelQueryDto();
    dto.unitId = 'unit-1';
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should pass with organizationId', async () => {
    const dto = new PersonnelQueryDto();
    dto.organizationId = 'org-1';
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should transform isActive string to boolean', async () => {
    const plain = { isActive: 'true' };
    const dto = plainToInstance(PersonnelQueryDto, plain);
    expect(typeof dto.isActive).toBe('boolean');
    expect(dto.isActive).toBe(true);
  });

  it('should pass with search string', async () => {
    const dto = new PersonnelQueryDto();
    dto.search = 'ahmet';
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});
