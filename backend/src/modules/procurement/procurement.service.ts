import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class ProcurementService {
  constructor(private prisma: PrismaService) {}

  async listRequests(filters?: { status?: string; departmentId?: string }) {
    const where: Prisma.ProcurementRequestWhereInput = {};

    if (filters?.status) where.status = filters.status as any;
    if (filters?.departmentId) where.departmentId = filters.departmentId;

    return this.prisma.procurementRequest.findMany({
      where,
      include: {
        items: true,
        orders: { select: { id: true, orderNumber: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createRequest(data: any) {
    const { items, ...requestData } = data;

    return this.prisma.procurementRequest.create({
      data: {
        requestNumber: requestData.requestNumber,
        title: requestData.title,
        description: requestData.description,
        requestedById: requestData.requestedById,
        departmentId: requestData.departmentId,
        priority: requestData.priority || 'normal',
        status: requestData.status || 'draft',
        estimatedCost: requestData.estimatedCost,
        currency: requestData.currency || 'TRY',
        justification: requestData.justification,
        notes: requestData.notes,
        items: items
          ? {
              create: items.map((item: any) => ({
                lineNumber: item.lineNumber,
                description: item.description,
                category: item.category,
                catalogId: item.catalogId,
                quantity: item.quantity || 1,
                unitOfMeasure: item.unitOfMeasure || 'piece',
                estimatedUnitCost: item.estimatedUnitCost,
                estimatedTotalCost:
                  item.estimatedUnitCost && item.quantity
                    ? item.estimatedUnitCost * item.quantity
                    : undefined,
                requiredDate: item.requiredDate
                  ? new Date(item.requiredDate)
                  : undefined,
                notes: item.notes,
              })),
            }
          : undefined,
      },
      include: {
        items: true,
      },
    });
  }

  async listOrders(filters?: { status?: string; supplierId?: string }) {
    const where: Prisma.ProcurementOrderWhereInput = {};

    if (filters?.status) where.status = filters.status as any;
    if (filters?.supplierId) where.supplierId = filters.supplierId;

    return this.prisma.procurementOrder.findMany({
      where,
      include: {
        items: true,
        supplier: { select: { id: true, name: true } },
        request: { select: { id: true, requestNumber: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createOrder(data: any) {
    const { items, ...orderData } = data;

    return this.prisma.procurementOrder.create({
      data: {
        orderNumber: orderData.orderNumber,
        requestId: orderData.requestId,
        supplierId: orderData.supplierId,
        title: orderData.title,
        status: orderData.status || 'draft',
        expectedDate: orderData.expectedDate
          ? new Date(orderData.expectedDate)
          : undefined,
        totalCost: orderData.totalCost,
        currency: orderData.currency || 'TRY',
        deliveryTerms: orderData.deliveryTerms,
        paymentTerms: orderData.paymentTerms,
        notes: orderData.notes,
        items: items
          ? {
              create: items.map((item: any) => ({
                lineNumber: item.lineNumber,
                description: item.description,
                catalogId: item.catalogId,
                quantity: item.quantity || 1,
                unitOfMeasure: item.unitOfMeasure || 'piece',
                unitCost: item.unitCost,
                totalCost:
                  item.unitCost && item.quantity
                    ? item.unitCost * item.quantity
                    : undefined,
                expectedDate: item.expectedDate
                  ? new Date(item.expectedDate)
                  : undefined,
                notes: item.notes,
              })),
            }
          : undefined,
      },
      include: {
        items: true,
        supplier: { select: { id: true, name: true } },
      },
    });
  }

  async getRequest(id: string) {
    const request = await this.prisma.procurementRequest.findUnique({
      where: { id },
      include: {
        items: true,
        orders: { select: { id: true, orderNumber: true, status: true } },
      },
    });

    if (!request) {
      throw new NotFoundException(
        `Procurement request with ID ${id} not found`,
      );
    }

    return request;
  }

  async approveRequest(id: string, approvedById: string) {
    await this.getRequest(id);

    return this.prisma.procurementRequest.update({
      where: { id },
      data: { status: 'approved', approvedById, approvedAt: new Date() },
      include: { items: true },
    });
  }

  async rejectRequest(id: string, reason: string) {
    await this.getRequest(id);

    return this.prisma.procurementRequest.update({
      where: { id },
      data: { status: 'rejected', notes: reason },
      include: { items: true },
    });
  }

  async updateRequestStatus(id: string, status: string) {
    await this.getRequest(id);

    return this.prisma.procurementRequest.update({
      where: { id },
      data: { status: status as any },
      include: { items: true },
    });
  }

  async getOrder(id: string) {
    const order = await this.prisma.procurementOrder.findUnique({
      where: { id },
      include: {
        items: true,
        supplier: { select: { id: true, name: true } },
        request: { select: { id: true, requestNumber: true, title: true } },
      },
    });

    if (!order) {
      throw new NotFoundException(`Procurement order with ID ${id} not found`);
    }

    return order;
  }

  async receiveOrder(id: string) {
    await this.getOrder(id);

    return this.prisma.procurementOrder.update({
      where: { id },
      data: { status: 'received', receivedDate: new Date() },
      include: {
        items: true,
        supplier: { select: { id: true, name: true } },
      },
    });
  }

  async updateOrderStatus(id: string, status: string) {
    await this.getOrder(id);

    return this.prisma.procurementOrder.update({
      where: { id },
      data: { status: status as any },
      include: {
        items: true,
        supplier: { select: { id: true, name: true } },
      },
    });
  }
}
