export interface RadiationDosimeter {
  id: string;
  dosimeterNumber: string;
  type: string;
  status: string;
  assignedToId: string | null;
  assignedToName: string | null;
  department: string | null;
  calibrationDate: string | null;
  nextCalibrationDate: string | null;
  expiryDate: string | null;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface RadiationMeasurement {
  id: string;
  dosimeterId: string | null;
  dosimeterNumber: string | null;
  areaId: string | null;
  areaName: string | null;
  value: number;
  unit: string;
  measurementType: string;
  measuredById: string;
  measuredByName: string;
  notes: string | null;
  measuredAt: string;
  organizationId: string;
}

export interface RadiationArea {
  id: string;
  name: string;
  code: string;
  type: string;
  status: string;
  maxAllowedDose: number;
  currentDose: number;
  unit: string;
  location: string | null;
  responsiblePersonId: string | null;
  responsiblePersonName: string | null;
  lastMeasurementDate: string | null;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}
