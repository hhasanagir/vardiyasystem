export interface ProcurementRequest {
  id: string;
  requestNumber: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  requestedById: string;
  requestedByName: string;
  department: string;
  items: ProcurementRequestItem[];
  totalEstimatedCost: number | null;
  justification: string | null;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProcurementRequestItem {
  name: string;
  quantity: number;
  unit: string;
  estimatedUnitPrice: number | null;
}

export interface ProcurementOrder {
  id: string;
  orderNumber: string;
  requestId: string | null;
  supplierId: string | null;
  supplierName: string | null;
  title: string;
  status: string;
  totalAmount: number;
  currency: string;
  expectedDeliveryDate: string | null;
  actualDeliveryDate: string | null;
  items: ProcurementOrderItem[];
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProcurementOrderItem {
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}
