import { SetMetadata } from '@nestjs/common';

export type DataClassification =
  | 'UNCLASSIFIED'
  | 'PERSONAL'
  | 'SENSITIVE_PERSONAL'
  | 'HEALTH'
  | 'FINANCIAL'
  | 'SYSTEM';

export const CLASSIFICATION_KEY = 'data:classification';

export const Classify = (classification: DataClassification) =>
  SetMetadata(CLASSIFICATION_KEY, classification);
