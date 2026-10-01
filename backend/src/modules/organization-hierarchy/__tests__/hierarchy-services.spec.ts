import { Test, TestingModule } from '@nestjs/testing';
import { HospitalGroupsService } from '../services/hospital-groups.service';
import { HospitalsService } from '../services/hospitals.service';
import { DirectoratesService } from '../services/directorates.service';
import { DepartmentsService } from '../services/departments.service';
import { AreasService } from '../services/areas.service';
import { RoomsService } from '../services/rooms.service';
import { AssignmentSlotsService } from '../services/assignment-slots.service';
import { PrismaService } from '../../../prisma.service';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AreaType,
  RoomType,
  ShiftType,
  AssignmentSlotStatus,
} from '@prisma/client';

describe('OrganizationHierarchyServices', () => {
  let hospitalGroupsService: HospitalGroupsService;
  let hospitalsService: HospitalsService;
  let directoratesService: DirectoratesService;
  let departmentsService: DepartmentsService;
  let areasService: AreasService;
  let roomsService: RoomsService;
  let assignmentSlotsService: AssignmentSlotsService;

  const mockPrisma = {
    hospitalGroup: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    hospital: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    directorate: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    department: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    area: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    room: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    assignmentSlot: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $queryRawUnsafe: vi.fn().mockResolvedValue(undefined),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HospitalGroupsService,
        HospitalsService,
        DirectoratesService,
        DepartmentsService,
        AreasService,
        RoomsService,
        AssignmentSlotsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    hospitalGroupsService = module.get(HospitalGroupsService);
    hospitalsService = module.get(HospitalsService);
    directoratesService = module.get(DirectoratesService);
    departmentsService = module.get(DepartmentsService);
    areasService = module.get(AreasService);
    roomsService = module.get(RoomsService);
    assignmentSlotsService = module.get(AssignmentSlotsService);
  });

  describe('HospitalGroupsService', () => {
    const fullRecord = {
      id: 'group-1',
      name: 'Test Group',
      code: 'TG',
      isActive: true,
    };
    const createdRecord = { id: 'group-1', name: 'Test Group', code: 'TG' };

    it('should create a hospital group and compute path', async () => {
      mockPrisma.hospitalGroup.create.mockResolvedValueOnce(createdRecord);
      mockPrisma.hospitalGroup.findUnique.mockResolvedValueOnce(fullRecord);

      const result = await hospitalGroupsService.create({
        name: 'Test Group',
        code: 'TG',
      });

      expect(result).toEqual(fullRecord);
      expect(mockPrisma.hospitalGroup.create).toHaveBeenCalledWith({
        data: { name: 'Test Group', code: 'TG' },
      });
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE hospital_groups'),
        'group-1',
      );
      expect(mockPrisma.hospitalGroup.findUnique).toHaveBeenCalledWith({
        where: { id: 'group-1' },
      });
    });

    it('should find all hospital groups ordered by name', async () => {
      mockPrisma.hospitalGroup.findMany.mockResolvedValueOnce([fullRecord]);

      const result = await hospitalGroupsService.findAll();

      expect(result).toEqual([fullRecord]);
      expect(mockPrisma.hospitalGroup.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
    });

    it('should find one hospital group by id', async () => {
      mockPrisma.hospitalGroup.findUnique.mockResolvedValueOnce(fullRecord);

      const result = await hospitalGroupsService.findOne('group-1');

      expect(result).toEqual(fullRecord);
      expect(mockPrisma.hospitalGroup.findUnique).toHaveBeenCalledWith({
        where: { id: 'group-1' },
      });
    });

    it('should return null when finding non-existent hospital group', async () => {
      mockPrisma.hospitalGroup.findUnique.mockResolvedValueOnce(null);

      const result = await hospitalGroupsService.findOne('non-existent');

      expect(result).toBeNull();
    });

    it('should update a hospital group', async () => {
      const updated = { ...fullRecord, name: 'Updated Group' };
      mockPrisma.hospitalGroup.update.mockResolvedValueOnce(updated);

      const result = await hospitalGroupsService.update('group-1', {
        name: 'Updated Group',
      });

      expect(result).toEqual(updated);
      expect(mockPrisma.hospitalGroup.update).toHaveBeenCalledWith({
        where: { id: 'group-1' },
        data: { name: 'Updated Group' },
      });
    });

    it('should soft delete a hospital group', async () => {
      const removed = { ...fullRecord, isActive: false };
      mockPrisma.hospitalGroup.update.mockResolvedValueOnce(removed);

      const result = await hospitalGroupsService.remove('group-1');

      expect(result).toEqual(removed);
      expect(mockPrisma.hospitalGroup.update).toHaveBeenCalledWith({
        where: { id: 'group-1' },
        data: { isActive: false },
      });
    });
  });

  describe('HospitalsService', () => {
    const fullRecord = {
      id: 'hospital-1',
      name: 'Test Hospital',
      code: 'TH',
      groupId: 'group-1',
      isActive: true,
      group: { id: 'group-1', name: 'Test Group' },
    };
    const createdRecord = {
      id: 'hospital-1',
      name: 'Test Hospital',
      code: 'TH',
      groupId: 'group-1',
    };

    it('should create a hospital with groupId and compute hierarchical path', async () => {
      mockPrisma.hospital.create.mockResolvedValueOnce(createdRecord);
      mockPrisma.hospital.findUnique.mockResolvedValueOnce(fullRecord);

      const result = await hospitalsService.create({
        name: 'Test Hospital',
        code: 'TH',
        groupId: 'group-1',
      });

      expect(result).toEqual(fullRecord);
      expect(mockPrisma.hospital.create).toHaveBeenCalledWith({
        data: { name: 'Test Hospital', code: 'TH', groupId: 'group-1' },
      });
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('hospital_groups'),
        'hospital-1',
      );
    });

    it('should create a hospital without groupId using root path', async () => {
      const noGroupCreated = {
        id: 'hospital-2',
        name: 'Solo Hospital',
        code: 'SH',
      };
      const noGroupFull = {
        id: 'hospital-2',
        name: 'Solo Hospital',
        code: 'SH',
        isActive: true,
      };
      mockPrisma.hospital.create.mockResolvedValueOnce(noGroupCreated);
      mockPrisma.hospital.findUnique.mockResolvedValueOnce(noGroupFull);

      const result = await hospitalsService.create({
        name: 'Solo Hospital',
        code: 'SH',
      });

      expect(result).toEqual(noGroupFull);
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('replace(lower(code)'),
        'hospital-2',
      );
    });

    it('should find all hospitals ordered by name', async () => {
      mockPrisma.hospital.findMany.mockResolvedValueOnce([fullRecord]);

      const result = await hospitalsService.findAll();

      expect(result).toEqual([fullRecord]);
      expect(mockPrisma.hospital.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
    });

    it('should find one hospital with group included', async () => {
      mockPrisma.hospital.findUnique.mockResolvedValueOnce(fullRecord);

      const result = await hospitalsService.findOne('hospital-1');

      expect(result).toEqual(fullRecord);
      expect(mockPrisma.hospital.findUnique).toHaveBeenCalledWith({
        where: { id: 'hospital-1' },
        include: { group: true },
      });
    });

    it('should update a hospital', async () => {
      const updated = { ...fullRecord, name: 'Updated Hospital' };
      mockPrisma.hospital.update.mockResolvedValueOnce(updated);

      const result = await hospitalsService.update('hospital-1', {
        name: 'Updated Hospital',
      });

      expect(result.name).toBe('Updated Hospital');
      expect(mockPrisma.hospital.update).toHaveBeenCalledWith({
        where: { id: 'hospital-1' },
        data: { name: 'Updated Hospital' },
      });
    });

    it('should soft delete a hospital', async () => {
      mockPrisma.hospital.update.mockResolvedValueOnce({
        ...fullRecord,
        isActive: false,
      });

      await hospitalsService.remove('hospital-1');

      expect(mockPrisma.hospital.update).toHaveBeenCalledWith({
        where: { id: 'hospital-1' },
        data: { isActive: false },
      });
    });
  });

  describe('DirectoratesService', () => {
    const fullRecord = {
      id: 'dir-1',
      name: 'Test Directorate',
      code: 'TD',
      hospitalId: 'hospital-1',
      isActive: true,
      hospital: { id: 'hospital-1', name: 'Test Hospital' },
    };
    const createdRecord = {
      id: 'dir-1',
      name: 'Test Directorate',
      code: 'TD',
      hospitalId: 'hospital-1',
    };

    it('should create a directorate and compute path from hospital', async () => {
      mockPrisma.directorate.create.mockResolvedValueOnce(createdRecord);
      mockPrisma.directorate.findUnique.mockResolvedValueOnce(fullRecord);

      const result = await directoratesService.create({
        name: 'Test Directorate',
        code: 'TD',
        hospitalId: 'hospital-1',
      });

      expect(result).toEqual(fullRecord);
      expect(mockPrisma.directorate.create).toHaveBeenCalledWith({
        data: {
          name: 'Test Directorate',
          code: 'TD',
          hospitalId: 'hospital-1',
        },
      });
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE directorates'),
        'dir-1',
      );
    });

    it('should find all directorates ordered by name', async () => {
      mockPrisma.directorate.findMany.mockResolvedValueOnce([fullRecord]);

      const result = await directoratesService.findAll();

      expect(result).toEqual([fullRecord]);
      expect(mockPrisma.directorate.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
    });

    it('should find one directorate with hospital included', async () => {
      mockPrisma.directorate.findUnique.mockResolvedValueOnce(fullRecord);

      const result = await directoratesService.findOne('dir-1');

      expect(result).toEqual(fullRecord);
      expect(mockPrisma.directorate.findUnique).toHaveBeenCalledWith({
        where: { id: 'dir-1' },
        include: { hospital: true },
      });
    });

    it('should update a directorate', async () => {
      mockPrisma.directorate.update.mockResolvedValueOnce({
        ...fullRecord,
        name: 'Updated Directorate',
      });

      const result = await directoratesService.update('dir-1', {
        name: 'Updated Directorate',
      });

      expect(result.name).toBe('Updated Directorate');
      expect(mockPrisma.directorate.update).toHaveBeenCalledWith({
        where: { id: 'dir-1' },
        data: { name: 'Updated Directorate' },
      });
    });

    it('should soft delete a directorate', async () => {
      mockPrisma.directorate.update.mockResolvedValueOnce({
        ...fullRecord,
        isActive: false,
      });

      await directoratesService.remove('dir-1');

      expect(mockPrisma.directorate.update).toHaveBeenCalledWith({
        where: { id: 'dir-1' },
        data: { isActive: false },
      });
    });
  });

  describe('DepartmentsService', () => {
    const createdRecord = {
      id: 'dept-1',
      name: 'Test Dept',
      code: 'TD',
      hospitalId: 'hospital-1',
      directorateId: 'dir-1',
    };
    const fullRecord = {
      ...createdRecord,
      isActive: true,
      hospital: { id: 'hospital-1' },
      directorate: { id: 'dir-1' },
    };

    it('should create a department with directorateId and compute path via directorates', async () => {
      mockPrisma.department.create.mockResolvedValueOnce(createdRecord);
      mockPrisma.department.findUnique.mockResolvedValueOnce(fullRecord);

      const result = await departmentsService.create({
        name: 'Test Dept',
        code: 'TD',
        hospitalId: 'hospital-1',
        directorateId: 'dir-1',
      });

      expect(result).toEqual(fullRecord);
      expect(mockPrisma.department.create).toHaveBeenCalledWith({
        data: {
          name: 'Test Dept',
          code: 'TD',
          hospitalId: 'hospital-1',
          directorateId: 'dir-1',
        },
      });
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('directorates dir'),
        'dept-1',
      );
    });

    it('should create a department with only hospitalId and compute path via hospitals', async () => {
      const hospOnlyCreated = {
        id: 'dept-2',
        name: 'Hospital Dept',
        code: 'HD',
        hospitalId: 'hospital-1',
      };
      const hospOnlyFull = {
        ...hospOnlyCreated,
        isActive: true,
        hospital: { id: 'hospital-1' },
        directorate: null,
      };
      mockPrisma.department.create.mockResolvedValueOnce(hospOnlyCreated);
      mockPrisma.department.findUnique.mockResolvedValueOnce(hospOnlyFull);

      const result = await departmentsService.create({
        name: 'Hospital Dept',
        code: 'HD',
        hospitalId: 'hospital-1',
      });

      expect(result).toEqual(hospOnlyFull);
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('hospitals h'),
        'dept-2',
      );
    });

    it('should create a department without parentIds using root path', async () => {
      const rootCreated = { id: 'dept-3', name: 'Root Dept', code: 'RD' };
      const rootFull = {
        ...rootCreated,
        isActive: true,
        hospital: null,
        directorate: null,
      };
      mockPrisma.department.create.mockResolvedValueOnce(rootCreated);
      mockPrisma.department.findUnique.mockResolvedValueOnce(rootFull);

      const result = await departmentsService.create({
        name: 'Root Dept',
        code: 'RD',
      });

      expect(result).toEqual(rootFull);
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('replace(lower(code)'),
        'dept-3',
      );
    });

    it('should find all departments ordered by name', async () => {
      mockPrisma.department.findMany.mockResolvedValueOnce([fullRecord]);

      const result = await departmentsService.findAll();

      expect(result).toEqual([fullRecord]);
      expect(mockPrisma.department.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
    });

    it('should find one department with hospital and directorate included', async () => {
      mockPrisma.department.findUnique.mockResolvedValueOnce(fullRecord);

      const result = await departmentsService.findOne('dept-1');

      expect(result).toEqual(fullRecord);
      expect(mockPrisma.department.findUnique).toHaveBeenCalledWith({
        where: { id: 'dept-1' },
        include: { hospital: true, directorate: true },
      });
    });

    it('should update a department', async () => {
      mockPrisma.department.update.mockResolvedValueOnce({
        ...fullRecord,
        name: 'Updated Dept',
      });

      const result = await departmentsService.update('dept-1', {
        name: 'Updated Dept',
      });

      expect(result.name).toBe('Updated Dept');
      expect(mockPrisma.department.update).toHaveBeenCalledWith({
        where: { id: 'dept-1' },
        data: { name: 'Updated Dept' },
      });
    });

    it('should soft delete a department', async () => {
      mockPrisma.department.update.mockResolvedValueOnce({
        ...fullRecord,
        isActive: false,
      });

      await departmentsService.remove('dept-1');

      expect(mockPrisma.department.update).toHaveBeenCalledWith({
        where: { id: 'dept-1' },
        data: { isActive: false },
      });
    });
  });

  describe('AreasService', () => {
    const createdRecord = {
      id: 'area-1',
      name: 'Test Area',
      code: 'TA',
      unitId: 'unit-1',
      type: AreaType.scanning,
    };
    const fullRecord = {
      ...createdRecord,
      isActive: true,
      unit: { id: 'unit-1' },
      rooms: [],
    };

    it('should create an area with default type scanning and compute path', async () => {
      mockPrisma.area.create.mockResolvedValueOnce(createdRecord);
      mockPrisma.area.findUnique.mockResolvedValueOnce(fullRecord);

      const result = await areasService.create({
        name: 'Test Area',
        code: 'TA',
        unitId: 'unit-1',
      });

      expect(result).toEqual(fullRecord);
      expect(mockPrisma.area.create).toHaveBeenCalledWith({
        data: {
          name: 'Test Area',
          code: 'TA',
          unitId: 'unit-1',
          type: AreaType.scanning,
        },
      });
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE areas'),
        'area-1',
      );
    });

    it('should create an area with explicit type', async () => {
      const explicitRecord = {
        id: 'area-2',
        name: 'Ctrl Area',
        code: 'CA',
        unitId: 'unit-1',
        type: AreaType.control,
      };
      const explicitFull = {
        ...explicitRecord,
        isActive: true,
        unit: { id: 'unit-1' },
        rooms: [],
      };
      mockPrisma.area.create.mockResolvedValueOnce(explicitRecord);
      mockPrisma.area.findUnique.mockResolvedValueOnce(explicitFull);

      const result = await areasService.create({
        name: 'Ctrl Area',
        code: 'CA',
        unitId: 'unit-1',
        type: AreaType.control,
      });

      expect(result).toEqual(explicitFull);
      expect(mockPrisma.area.create).toHaveBeenCalledWith({
        data: {
          name: 'Ctrl Area',
          code: 'CA',
          unitId: 'unit-1',
          type: AreaType.control,
        },
      });
    });

    it('should find all areas ordered by name', async () => {
      mockPrisma.area.findMany.mockResolvedValueOnce([fullRecord]);

      const result = await areasService.findAll();

      expect(result).toEqual([fullRecord]);
      expect(mockPrisma.area.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
    });

    it('should find one area with unit and rooms included', async () => {
      mockPrisma.area.findUnique.mockResolvedValueOnce(fullRecord);

      const result = await areasService.findOne('area-1');

      expect(result).toEqual(fullRecord);
      expect(mockPrisma.area.findUnique).toHaveBeenCalledWith({
        where: { id: 'area-1' },
        include: { unit: true, rooms: true },
      });
    });

    it('should update an area', async () => {
      mockPrisma.area.update.mockResolvedValueOnce({
        ...fullRecord,
        name: 'Updated Area',
      });

      const result = await areasService.update('area-1', {
        name: 'Updated Area',
      });

      expect(result.name).toBe('Updated Area');
      expect(mockPrisma.area.update).toHaveBeenCalledWith({
        where: { id: 'area-1' },
        data: { name: 'Updated Area' },
      });
    });

    it('should soft delete an area', async () => {
      mockPrisma.area.update.mockResolvedValueOnce({
        ...fullRecord,
        isActive: false,
      });

      await areasService.remove('area-1');

      expect(mockPrisma.area.update).toHaveBeenCalledWith({
        where: { id: 'area-1' },
        data: { isActive: false },
      });
    });
  });

  describe('RoomsService', () => {
    const createdRecord = {
      id: 'room-1',
      name: 'Test Room',
      code: 'TR',
      areaId: 'area-1',
      type: RoomType.patient_exam,
      capacity: 1,
    };
    const fullRecord = {
      ...createdRecord,
      isActive: true,
      area: { id: 'area-1' },
      devices: [],
    };

    it('should create a room with default type and capacity and compute path', async () => {
      mockPrisma.room.create.mockResolvedValueOnce(createdRecord);
      mockPrisma.room.findUnique.mockResolvedValueOnce(fullRecord);

      const result = await roomsService.create({
        name: 'Test Room',
        code: 'TR',
        areaId: 'area-1',
      });

      expect(result).toEqual(fullRecord);
      expect(mockPrisma.room.create).toHaveBeenCalledWith({
        data: {
          name: 'Test Room',
          code: 'TR',
          areaId: 'area-1',
          type: RoomType.patient_exam,
          capacity: 1,
        },
      });
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE rooms'),
        'room-1',
      );
    });

    it('should create a room with explicit type and capacity', async () => {
      const explicitRecord = {
        id: 'room-2',
        name: 'Equip Room',
        code: 'ER',
        areaId: 'area-1',
        type: RoomType.equipment,
        capacity: 3,
      };
      const explicitFull = {
        ...explicitRecord,
        isActive: true,
        area: { id: 'area-1' },
        devices: [],
      };
      mockPrisma.room.create.mockResolvedValueOnce(explicitRecord);
      mockPrisma.room.findUnique.mockResolvedValueOnce(explicitFull);

      const result = await roomsService.create({
        name: 'Equip Room',
        code: 'ER',
        areaId: 'area-1',
        type: RoomType.equipment,
        capacity: 3,
      });

      expect(result).toEqual(explicitFull);
      expect(mockPrisma.room.create).toHaveBeenCalledWith({
        data: {
          name: 'Equip Room',
          code: 'ER',
          areaId: 'area-1',
          type: RoomType.equipment,
          capacity: 3,
        },
      });
    });

    it('should find all rooms ordered by name', async () => {
      mockPrisma.room.findMany.mockResolvedValueOnce([fullRecord]);

      const result = await roomsService.findAll();

      expect(result).toEqual([fullRecord]);
      expect(mockPrisma.room.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
    });

    it('should find one room with area and devices included', async () => {
      mockPrisma.room.findUnique.mockResolvedValueOnce(fullRecord);

      const result = await roomsService.findOne('room-1');

      expect(result).toEqual(fullRecord);
      expect(mockPrisma.room.findUnique).toHaveBeenCalledWith({
        where: { id: 'room-1' },
        include: { area: true, devices: true },
      });
    });

    it('should update a room', async () => {
      mockPrisma.room.update.mockResolvedValueOnce({
        ...fullRecord,
        name: 'Updated Room',
      });

      const result = await roomsService.update('room-1', {
        name: 'Updated Room',
      });

      expect(result.name).toBe('Updated Room');
      expect(mockPrisma.room.update).toHaveBeenCalledWith({
        where: { id: 'room-1' },
        data: { name: 'Updated Room' },
      });
    });

    it('should soft delete a room', async () => {
      mockPrisma.room.update.mockResolvedValueOnce({
        ...fullRecord,
        isActive: false,
      });

      await roomsService.remove('room-1');

      expect(mockPrisma.room.update).toHaveBeenCalledWith({
        where: { id: 'room-1' },
        data: { isActive: false },
      });
    });
  });

  describe('AssignmentSlotsService', () => {
    const mockSlot = {
      id: 'slot-1',
      roomId: 'room-1',
      deviceId: null,
      date: '2024-03-15',
      startTime: '09:00',
      endTime: '17:00',
      shiftType: ShiftType.day,
      status: AssignmentSlotStatus.available,
      assignedTo: null,
      scheduleId: null,
      isActive: true,
    };

    it('should create an assignment slot with default status available', async () => {
      mockPrisma.assignmentSlot.create.mockResolvedValueOnce(mockSlot);

      const result = await assignmentSlotsService.create({
        date: '2024-03-15',
        startTime: '09:00',
        endTime: '17:00',
        shiftType: ShiftType.day,
        roomId: 'room-1',
      });

      expect(result).toEqual(mockSlot);
      expect(mockPrisma.assignmentSlot.create).toHaveBeenCalledWith({
        data: {
          date: '2024-03-15',
          startTime: '09:00',
          endTime: '17:00',
          shiftType: ShiftType.day,
          roomId: 'room-1',
          status: AssignmentSlotStatus.available,
        },
      });
    });

    it('should create an assignment slot with explicit status', async () => {
      const occupiedSlot = {
        ...mockSlot,
        status: AssignmentSlotStatus.occupied,
      };
      mockPrisma.assignmentSlot.create.mockResolvedValueOnce(occupiedSlot);

      const result = await assignmentSlotsService.create({
        date: '2024-03-15',
        startTime: '09:00',
        endTime: '17:00',
        shiftType: ShiftType.day,
        roomId: 'room-1',
        status: AssignmentSlotStatus.occupied,
      });

      expect(result.status).toBe(AssignmentSlotStatus.occupied);
      expect(mockPrisma.assignmentSlot.create).toHaveBeenCalledWith({
        data: {
          date: '2024-03-15',
          startTime: '09:00',
          endTime: '17:00',
          shiftType: ShiftType.day,
          roomId: 'room-1',
          status: AssignmentSlotStatus.occupied,
        },
      });
    });

    it('should find all assignment slots without filters', async () => {
      mockPrisma.assignmentSlot.findMany.mockResolvedValueOnce([mockSlot]);

      const result = await assignmentSlotsService.findAll();

      expect(result).toEqual([mockSlot]);
      expect(mockPrisma.assignmentSlot.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      });
    });

    it('should find all assignment slots with date filter', async () => {
      mockPrisma.assignmentSlot.findMany.mockResolvedValueOnce([mockSlot]);

      await assignmentSlotsService.findAll({ date: '2024-03-15' });

      expect(mockPrisma.assignmentSlot.findMany).toHaveBeenCalledWith({
        where: { date: '2024-03-15' },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      });
    });

    it('should find all assignment slots with status filter (uppercases input)', async () => {
      mockPrisma.assignmentSlot.findMany.mockResolvedValueOnce([mockSlot]);

      await assignmentSlotsService.findAll({ status: 'available' });

      expect(mockPrisma.assignmentSlot.findMany).toHaveBeenCalledWith({
        where: { status: 'AVAILABLE' },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      });
    });

    it('should find one assignment slot with room and device included', async () => {
      const slotWithIncludes = {
        ...mockSlot,
        room: { id: 'room-1' },
        device: null,
      };
      mockPrisma.assignmentSlot.findUnique.mockResolvedValueOnce(
        slotWithIncludes,
      );

      const result = await assignmentSlotsService.findOne('slot-1');

      expect(result).toEqual(slotWithIncludes);
      expect(mockPrisma.assignmentSlot.findUnique).toHaveBeenCalledWith({
        where: { id: 'slot-1' },
        include: { room: true, device: true },
      });
    });

    it('should update an assignment slot', async () => {
      const updated = { ...mockSlot, status: AssignmentSlotStatus.occupied };
      mockPrisma.assignmentSlot.update.mockResolvedValueOnce(updated);

      const result = await assignmentSlotsService.update('slot-1', {
        status: AssignmentSlotStatus.occupied,
      });

      expect(result.status).toBe(AssignmentSlotStatus.occupied);
      expect(mockPrisma.assignmentSlot.update).toHaveBeenCalledWith({
        where: { id: 'slot-1' },
        data: { status: AssignmentSlotStatus.occupied },
      });
    });

    it('should soft delete an assignment slot', async () => {
      mockPrisma.assignmentSlot.update.mockResolvedValueOnce({
        ...mockSlot,
        isActive: false,
      });

      await assignmentSlotsService.remove('slot-1');

      expect(mockPrisma.assignmentSlot.update).toHaveBeenCalledWith({
        where: { id: 'slot-1' },
        data: { isActive: false },
      });
    });

    it('should find slots by date', async () => {
      mockPrisma.assignmentSlot.findMany.mockResolvedValueOnce([mockSlot]);

      const result = await assignmentSlotsService.findByDate('2024-03-15');

      expect(result).toEqual([mockSlot]);
      expect(mockPrisma.assignmentSlot.findMany).toHaveBeenCalledWith({
        where: { date: '2024-03-15' },
        orderBy: { startTime: 'asc' },
      });
    });

    it('should find slots by room and date', async () => {
      mockPrisma.assignmentSlot.findMany.mockResolvedValueOnce([mockSlot]);

      const result = await assignmentSlotsService.findByRoom(
        'room-1',
        '2024-03-15',
      );

      expect(result).toEqual([mockSlot]);
      expect(mockPrisma.assignmentSlot.findMany).toHaveBeenCalledWith({
        where: { roomId: 'room-1', date: '2024-03-15' },
        orderBy: { startTime: 'asc' },
      });
    });

    it('should find slots by device and date', async () => {
      const deviceSlot = { ...mockSlot, roomId: null, deviceId: 'device-1' };
      mockPrisma.assignmentSlot.findMany.mockResolvedValueOnce([deviceSlot]);

      const result = await assignmentSlotsService.findByDevice(
        'device-1',
        '2024-03-15',
      );

      expect(result).toEqual([deviceSlot]);
      expect(mockPrisma.assignmentSlot.findMany).toHaveBeenCalledWith({
        where: { deviceId: 'device-1', date: '2024-03-15' },
        orderBy: { startTime: 'asc' },
      });
    });

    it('should return empty array when no slots found for date', async () => {
      mockPrisma.assignmentSlot.findMany.mockResolvedValueOnce([]);

      const result = await assignmentSlotsService.findByDate('2025-01-01');

      expect(result).toEqual([]);
    });
  });
});
