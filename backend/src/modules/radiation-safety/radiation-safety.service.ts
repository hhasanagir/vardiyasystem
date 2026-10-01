import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class RadiationSafetyService {
  constructor(private prisma: PrismaService) {}

  async listDosimeters(filters?: { status?: string; assignedToId?: string }) {
    const where: Prisma.RadiationDosimeterWhereInput = {};

    if (filters?.status) where.status = filters.status;
    if (filters?.assignedToId) where.assignedToId = filters.assignedToId;

    return this.prisma.radiationDosimeter.findMany({
      where,
      include: {
        personnel: { select: { id: true, name: true, employeeNo: true } },
        _count: { select: { measurements: true } },
      },
      orderBy: { dosimeterNumber: 'asc' },
    });
  }

  async createDosimeter(data: any) {
    return this.prisma.radiationDosimeter.create({
      data: {
        dosimeterNumber: data.dosimeterNumber,
        type: data.type,
        assignedToId: data.assignedToId,
        issueDate: data.issueDate ? new Date(data.issueDate) : new Date(),
        status: data.status || 'active',
        initialReading: data.initialReading,
        currentReading: data.currentReading,
        annualLimit: data.annualLimit ?? 20,
        monthlyAlertThreshold: data.monthlyAlertThreshold ?? 16,
        notes: data.notes,
        isActive: data.isActive ?? true,
      },
      include: {
        personnel: { select: { id: true, name: true } },
      },
    });
  }

  async listMeasurements(filters?: {
    dosimeterId?: string;
    type?: string;
    result?: string;
  }) {
    const where: Prisma.RadiationMeasurementWhereInput = {};

    if (filters?.dosimeterId) where.dosimeterId = filters.dosimeterId;
    if (filters?.type) where.type = filters.type as any;
    if (filters?.result) where.result = filters.result;

    return this.prisma.radiationMeasurement.findMany({
      where,
      include: {
        dosimeter: { select: { id: true, dosimeterNumber: true } },
        asset: { select: { id: true, name: true, assetNumber: true } },
      },
      orderBy: { measurementDate: 'desc' },
    });
  }

  async createMeasurement(data: any) {
    return this.prisma.radiationMeasurement.create({
      data: {
        dosimeterId: data.dosimeterId,
        assetId: data.assetId,
        type: data.type,
        measurementDate: data.measurementDate
          ? new Date(data.measurementDate)
          : new Date(),
        value: data.value,
        unit: data.unit || 'mSv',
        location: data.location,
        performedById: data.performedById,
        laboratoryRef: data.laboratoryRef,
        result: data.result,
        notes: data.notes,
      },
      include: {
        dosimeter: { select: { id: true, dosimeterNumber: true } },
        asset: { select: { id: true, name: true } },
      },
    });
  }

  async listAreas(filters?: { type?: string; departmentId?: string }) {
    const where: Prisma.RadiationAreaWhereInput = {};

    if (filters?.type) where.type = filters.type;
    if (filters?.departmentId) where.departmentId = filters.departmentId;

    return this.prisma.radiationArea.findMany({
      where,
      orderBy: { code: 'asc' },
    });
  }
}
