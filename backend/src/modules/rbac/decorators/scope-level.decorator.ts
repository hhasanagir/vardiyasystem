import { SetMetadata } from '@nestjs/common';
import { HierarchyScopeLevel } from '../interfaces/rbac.types';

export const SCOPE_LEVEL_KEY = 'scope_level';
export const ScopeLevel = (level: HierarchyScopeLevel) =>
  SetMetadata(SCOPE_LEVEL_KEY, level);
