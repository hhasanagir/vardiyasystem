import { ConstraintContext } from '../constraints/constraint.interface';
import { ConstraintScore } from '../constraints/soft-constraint.interface';

export interface SchedulingContext {
  unitType: string;
  serviceLine: ServiceLine;
  context: ConstraintContext;
}

export enum ServiceLine {
  IMAGING = 'IMAGING',
  RADIATION_ONCOLOGY = 'RADIATION_ONCOLOGY',
}

export interface SchedulingStrategy {
  serviceLine: ServiceLine;
  getExtraHardConstraints(): string[];
  getExtraSoftConstraints(): string[];
  evaluateDomainSpecific(context: SchedulingContext): ConstraintScore[];
  validateCandidate(context: SchedulingContext): boolean;
}

export class ImagingSchedulingStrategy implements SchedulingStrategy {
  serviceLine = ServiceLine.IMAGING;

  getExtraHardConstraints(): string[] {
    return ['IMAGING_MODALITY_MATCH', 'IMAGING_DEVICE_CAPABILITY'];
  }

  getExtraSoftConstraints(): string[] {
    return ['IMAGING_MODALITY_ROTATION', 'IMAGING_DEVICE_FAMILIARITY'];
  }

  evaluateDomainSpecific(context: SchedulingContext): ConstraintScore[] {
    return [];
  }

  validateCandidate(context: SchedulingContext): boolean {
    return true;
  }
}

export class RadiationOncologySchedulingStrategy implements SchedulingStrategy {
  serviceLine = ServiceLine.RADIATION_ONCOLOGY;

  getExtraHardConstraints(): string[] {
    return [
      'RT_DOSE_LIMIT',
      'RT_MACHINE_QUALIFICATION',
      'RT_TREATMENT_PROTOCOL',
    ];
  }

  getExtraSoftConstraints(): string[] {
    return ['RT_PATIENT_CONTINUITY', 'RT_MACHINE_UTILIZATION'];
  }

  evaluateDomainSpecific(context: SchedulingContext): ConstraintScore[] {
    return [];
  }

  validateCandidate(context: SchedulingContext): boolean {
    return true;
  }
}

export function createSchedulingStrategy(
  serviceLine: ServiceLine,
): SchedulingStrategy {
  switch (serviceLine) {
    case ServiceLine.IMAGING:
      return new ImagingSchedulingStrategy();
    case ServiceLine.RADIATION_ONCOLOGY:
      return new RadiationOncologySchedulingStrategy();
    default:
      return new ImagingSchedulingStrategy();
  }
}
