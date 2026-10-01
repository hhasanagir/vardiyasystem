import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { CreateCalibrationDto } from './dto/calibration/create-calibration.dto';
import { UpdateCalibrationDto } from './dto/calibration/update-calibration.dto';
import { CompleteCalibrationDto } from './dto/calibration/complete-calibration.dto';

@Injectable()
export class CalibrationService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters?: {
    assetId?: string;
    status?: string;
    type?: string;
  }) {
    const where: Prisma.CalibrationRecordWhereInput = {};
    if (filters?.assetId) where.assetId = filters.assetId;
    if (filters?.status) where.status = filters.status;
    if (filters?.type) where.type = filters.type;

    return this.prisma.calibrationRecord.findMany({
      where,
      include: {
        asset: { select: { id: true, name: true, assetNumber: true } },
        performedBy: { select: { id: true, name: true } },
        vendor: { select: { id: true, name: true } },
      },
      orderBy: { scheduledDate: 'desc' },
    });
  }

  async findById(id: string) {
    const record = await this.prisma.calibrationRecord.findUnique({
      where: { id },
      include: {
        asset: { select: { id: true, name: true, assetNumber: true } },
        performedBy: { select: { id: true, name: true } },
        vendor: { select: { id: true, name: true } },
      },
    });
    if (!record) throw new NotFoundException('Calibration record not found');
    return record;
  }

  async create(dto: CreateCalibrationDto) {
    let calibrationNumber = dto.calibrationNumber;
    if (!calibrationNumber) {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const count = await this.prisma.calibrationRecord.count({
        where: {
          createdAt: { gte: new Date(new Date().toISOString().slice(0, 10)) },
        },
      });
      calibrationNumber = `CAL-${today}-${String(count + 1).padStart(4, '0')}`;
    }

    return this.prisma.calibrationRecord.create({
      data: {
        assetId: dto.assetId,
        calibrationNumber,
        type: dto.type,
        status: dto.status || 'scheduled',
        scheduledDate: new Date(dto.scheduledDate),
        completedDate: dto.completedDate
          ? new Date(dto.completedDate)
          : undefined,
        performedById: dto.performedById,
        vendorId: dto.vendorId,
        standard: dto.standard,
        results: dto.results,
        measurementValues: dto.measurementValues,
        certificateRef: dto.certificateRef,
        nextCalibrationDate: dto.nextCalibrationDate
          ? new Date(dto.nextCalibrationDate)
          : undefined,
        intervalDays: dto.intervalDays,
        cost: dto.cost,
        notes: dto.notes,
      },
      include: {
        asset: { select: { id: true, name: true, assetNumber: true } },
      },
    });
  }

  async update(id: string, dto: UpdateCalibrationDto) {
    const existing = await this.prisma.calibrationRecord.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Calibration record not found');

    const data: Prisma.CalibrationRecordUncheckedUpdateInput = {};
    if (dto.assetId !== undefined) data.assetId = dto.assetId;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.scheduledDate !== undefined)
      data.scheduledDate = new Date(dto.scheduledDate);
    if (dto.completedDate !== undefined)
      data.completedDate = new Date(dto.completedDate);
    if (dto.performedById !== undefined) data.performedById = dto.performedById;
    if (dto.vendorId !== undefined) data.vendorId = dto.vendorId;
    if (dto.standard !== undefined) data.standard = dto.standard;
    if (dto.results !== undefined) data.results = dto.results;
    if (dto.measurementValues !== undefined)
      data.measurementValues = dto.measurementValues;
    if (dto.certificateRef !== undefined)
      data.certificateRef = dto.certificateRef;
    if (dto.nextCalibrationDate !== undefined)
      data.nextCalibrationDate = new Date(dto.nextCalibrationDate);
    if (dto.intervalDays !== undefined) data.intervalDays = dto.intervalDays;
    if (dto.cost !== undefined) data.cost = dto.cost;
    if (dto.notes !== undefined) data.notes = dto.notes;

    return this.prisma.calibrationRecord.update({
      where: { id },
      data,
      include: {
        asset: { select: { id: true, name: true, assetNumber: true } },
      },
    });
  }

  async complete(id: string, dto: CompleteCalibrationDto) {
    const existing = await this.prisma.calibrationRecord.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Calibration record not found');

    return this.prisma.calibrationRecord.update({
      where: { id },
      data: {
        status: 'completed',
        results: dto.results,
        completedDate: new Date(dto.completedDate),
        measurementValues: dto.measurementValues,
        certificateRef: dto.certificateRef,
        notes: dto.notes,
        nextCalibrationDate: dto.nextCalibrationDate
          ? new Date(dto.nextCalibrationDate)
          : undefined,
        intervalDays: dto.intervalDays,
        cost: dto.cost,
      },
      include: {
        asset: { select: { id: true, name: true, assetNumber: true } },
      },
    });
  }

  async getDue() {
    const now = new Date();
    return this.prisma.calibrationRecord.findMany({
      where: {
        status: { in: ['scheduled', 'overdue'] },
        OR: [
          { nextCalibrationDate: { lte: now } },
          { scheduledDate: { lte: now } },
        ],
      },
      include: {
        asset: { select: { id: true, name: true, assetNumber: true } },
      },
      orderBy: { scheduledDate: 'asc' },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.calibrationRecord.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Calibration record not found');
    await this.prisma.calibrationRecord.delete({ where: { id } });
    return { success: true };
  }
}
