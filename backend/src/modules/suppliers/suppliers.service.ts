import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters?: {
    category?: string;
    search?: string;
    isActive?: boolean;
  }) {
    const where: Prisma.SupplierWhereInput = {};

    if (filters?.category) where.category = filters.category;
    if (filters?.isActive !== undefined) where.isActive = filters.isActive;

    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { code: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.supplier.findMany({
      where,
      include: {
        _count: {
          select: { procurementOrders: true, serviceContracts: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        serviceContracts: { orderBy: { createdAt: 'desc' }, take: 10 },
        procurementOrders: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    return supplier;
  }

  async create(data: any) {
    return this.prisma.supplier.create({
      data: {
        code: data.code,
        name: data.name,
        category: data.category,
        contactPerson: data.contactPerson,
        email: data.email,
        phone: data.phone,
        mobile: data.mobile,
        address: data.address,
        city: data.city,
        country: data.country,
        taxOffice: data.taxOffice,
        taxNumber: data.taxNumber,
        website: data.website,
        notes: data.notes,
        isActive: data.isActive ?? true,
      },
    });
  }

  async update(id: string, data: any) {
    const existing = await this.prisma.supplier.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Supplier not found');
    }

    const updateData: Prisma.SupplierUpdateInput = {};

    if (data.code !== undefined) updateData.code = data.code;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.contactPerson !== undefined)
      updateData.contactPerson = data.contactPerson;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.mobile !== undefined) updateData.mobile = data.mobile;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.city !== undefined) updateData.city = data.city;
    if (data.country !== undefined) updateData.country = data.country;
    if (data.taxOffice !== undefined) updateData.taxOffice = data.taxOffice;
    if (data.taxNumber !== undefined) updateData.taxNumber = data.taxNumber;
    if (data.website !== undefined) updateData.website = data.website;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    return this.prisma.supplier.update({
      where: { id },
      data: updateData,
    });
  }
}
