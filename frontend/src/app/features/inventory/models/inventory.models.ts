export interface InventoryStock {
  catalogId: string;
  catalogCode: string;
  catalogName: string;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  minStock: number;
  maxStock: number;
  unit: string;
}

export interface InventoryTransfer {
  id: string;
  transferNumber: string;
  fromWarehouseName: string;
  toWarehouseName: string;
  catalogName: string;
  quantity: number;
  status: string;
  createdAt: string;
}

export interface ConsumptionRecord {
  id: string;
  catalogName: string;
  quantity: number;
  consumptionType: string;
  assetName?: string;
  examinationType?: string;
  recordedAt: string;
  cost?: number;
}

export interface InventoryCount {
  id: string;
  countNumber: string;
  warehouseName: string;
  catalogName: string;
  expectedQty: number;
  actualQty: number;
  difference: number;
  status: string;
  countedAt: string;
}

export interface WasteRecord {
  id: string;
  wasteNumber: string;
  catalogName: string;
  quantity: number;
  wasteType: string;
  reason: string;
  disposedAt: string;
  cost?: number;
}

export interface StockAlert {
  id: string;
  catalogName: string;
  alertType: string;
  currentValue: number;
  threshold: number;
  message: string;
  severity: string;
  isResolved: boolean;
}
