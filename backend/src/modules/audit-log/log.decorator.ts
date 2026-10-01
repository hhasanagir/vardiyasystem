import { SetMetadata } from '@nestjs/common';
import { AUDIT_METADATA_KEY, AuditMetadata } from './audit.constants';

export const Log = (metadata: AuditMetadata) =>
  SetMetadata(AUDIT_METADATA_KEY, metadata);
