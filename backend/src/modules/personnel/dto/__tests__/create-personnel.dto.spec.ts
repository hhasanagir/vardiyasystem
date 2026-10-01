import { validate } from 'class-validator';
import { CreatePersonnelDto } from '../create-personnel.dto';
import { describe, it, expect } from 'vitest';

describe('CreatePersonnelDto', () => {
  it('should pass with valid data', async () => {
    const dto = new CreatePersonnelDto();
    dto.name = 'Ahmet Yılmaz';
    dto.unitId = 'unit-1';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail without name', async () => {
    const dto = new CreatePersonnelDto();
    dto.unitId = 'unit-1';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('name');
  });

  it('should fail without unitId', async () => {
    const dto = new CreatePersonnelDto();
    dto.name = 'Ahmet Yılmaz';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('unitId');
  });

  it('should accept optional fields', async () => {
    const dto = new CreatePersonnelDto();
    dto.name = 'Ahmet Yılmaz';
    dto.unitId = 'unit-1';
    dto.role = 'technician';
    dto.employeeNo = 'EMP-001';
    dto.email = 'ahmet@hospital.com';
    dto.phone = '+90-555-123-4567';
    dto.skills = ['MR', 'BT'];
    dto.seniority = 5;
    dto.specialization = 'MR';
    dto.experienceYears = 8;
    dto.certifications = ['Cert-A', 'Cert-B'];
    dto.deviceSkills = ['Dev-A'];
    dto.nightShiftEligible = true;
    dto.employmentStatus = 'active';
    dto.startDate = '2024-01-15';
    dto.notes = 'Test note';
    dto.offDays = [0, 6];
    dto.maxWeeklyHours = 40;
    dto.isActive = true;

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject invalid email format', async () => {
    const dto = new CreatePersonnelDto();
    dto.name = 'Ahmet Yılmaz';
    dto.unitId = 'unit-1';
    (dto as any).email = 12345;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject negative seniority', async () => {
    const dto = new CreatePersonnelDto();
    dto.name = 'Ahmet Yılmaz';
    dto.unitId = 'unit-1';
    (dto as any).seniority = -1;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject maxWeeklyHours over 168', async () => {
    const dto = new CreatePersonnelDto();
    dto.name = 'Ahmet Yılmaz';
    dto.unitId = 'unit-1';
    (dto as any).maxWeeklyHours = 200;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject non-array skills', async () => {
    const dto = new CreatePersonnelDto();
    dto.name = 'Ahmet Yılmaz';
    dto.unitId = 'unit-1';
    (dto as any).skills = 'not-an-array';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
