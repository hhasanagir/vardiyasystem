export interface EnterpriseAsset {
  id: string;
  assetNumber: string;
  barcode: string | null;
  qrCode: string | null;
  rfidTag: string | null;
  name: string;
  category: string;
  status: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  brand: string | null;
  yearOfManufacture: number | null;
  installationDate: string | null;
  acceptanceDate: string | null;
  commissioningDate: string | null;
  warrantyStart: string | null;
  warrantyEnd: string | null;
  expectedLifetimeYears: number | null;
  retirementDate: string | null;
  disposalReason: string | null;
  purchaseCost: number | null;
  currentValue: number | null;
  supplierId: string | null;
  contractNumber: string | null;
  invoiceNumber: string | null;
  purchaseOrderNumber: string | null;
  notes: string | null;
  departmentId: string | null;
  block: string | null;
  floor: string | null;
  roomId: string | null;
  unitId: string | null;
  hospitalId: string | null;
  ownerDepartmentId: string | null;
  responsibleEngineerId: string | null;
  organizationId: string | null;
  deviceId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  supplier?: { id: string; name: string };
  unit?: { id: string; name: string };
  department?: { id: string; name: string };
  hospital?: { id: string; name: string };
}

export interface AssetDashboard {
  totalAssets: number;
  activeCount: number;
  maintenanceCount: number;
  faultCount: number;
  outOfServiceCount: number;
  categoryDistribution: { category: string; _count: number }[];
  statusDistribution: { status: string; _count: number }[];
  assetsWithWarranty: number;
  assetsExpiringWarranty: number;
  assetsWithNoQR: number;
}

export interface AssetDetail extends EnterpriseAsset {
  documents: AssetDocument[];
  movements: AssetMovement[];
  maintenanceRecords: MaintenanceRecordSummary[];
  calibrationRecords: CalibrationRecordSummary[];
  lifecycleEvents: LifecycleEventSummary[];
  serviceContracts: ServiceContractSummary[];
  consumables: ConsumableSummary[];
  qualityRecords: QualityRecordSummary[];
  radiationMeasurements: RadiationMeasurementSummary[];
  consumptionRecords: ConsumptionRecordSummary[];
  device?: { id: string; code: string; name: string };
  room?: { id: string; name: string };
  ownerDepartment?: { id: string; name: string };
}

export interface AssetDocument {
  id: string;
  type: string;
  title: string;
  description: string | null;
  fileUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  notes: string | null;
  createdAt: string;
}

export interface AssetMovement {
  id: string;
  fromLocation: string | null;
  toLocation: string;
  fromBlock: string | null;
  toBlock: string | null;
  fromFloor: string | null;
  toFloor: string | null;
  reason: string;
  authorizedBy: string | null;
  performedBy: string | null;
  notes: string | null;
  movedAt: string;
}

export interface MaintenanceRecordSummary {
  id: string;
  type: string;
  priority: string;
  status: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  cost: number | null;
  createdAt: string;
}

export interface CalibrationRecordSummary {
  id: string;
  calibrationNumber: string;
  type: string;
  status: string;
  scheduledDate: string;
  completedDate: string | null;
  certificateRef: string | null;
  nextCalibrationDate: string | null;
  cost: number | null;
}

export interface LifecycleEventSummary {
  id: string;
  eventType: string;
  eventDate: string;
  completedDate: string | null;
  title: string;
  description: string | null;
  referenceNumber: string | null;
  locationFrom: string | null;
  locationTo: string | null;
}

export interface ServiceContractSummary {
  id: string;
  contractNumber: string;
  type: string;
  vendorId: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface ConsumableSummary {
  id: string;
  code: string;
  name: string;
  manufacturer: string | null;
}

export interface QualityRecordSummary {
  id: string;
  recordNumber: string;
  type: string;
  status: string;
  createdAt: string;
}

export interface RadiationMeasurementSummary {
  id: string;
  measurementDate: string;
  doseValue: number;
  unit: string;
}

export interface ConsumptionRecordSummary {
  id: string;
  quantity: number;
  createdAt: string;
}

export interface QRCodeResult {
  qrCode: string;
  qrPayload: string;
  qrHash: string;
  assetNumber: string;
}

export interface WarrantyStatus {
  active: number;
  expiringSoon: number;
  expired: number;
  noWarranty: number;
  byMonth: { month: string; count: number }[];
}

export interface DeviceInfo {
  id: string;
  code: string;
  name: string;
  unitId: string;
  mode: string;
  requiredSkills: string[];
  isActive: boolean;
  unit?: string;
}
