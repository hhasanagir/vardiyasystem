export interface ConsumableCatalog {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  description: string | null;
  minStock: number;
  maxStock: number;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConsumableStock {
  id: string;
  catalogId: string;
  catalogName: string;
  catalogCode: string;
  quantity: number;
  minStock: number;
  maxStock: number;
  unit: string;
  location: string | null;
  lastUpdated: string;
}

export interface ConsumableTransaction {
  id: string;
  catalogId: string;
  catalogName: string;
  type: string;
  quantity: number;
  unitPrice: number | null;
  referenceNumber: string | null;
  performedBy: string;
  notes: string | null;
  createdAt: string;
}
