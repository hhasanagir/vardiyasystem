import { SetMetadata } from '@nestjs/common';

export const UNIT_SCOPE_KEY = 'unit_scope';

export type UnitScopeEntity = 'personnel' | 'schedule' | 'device' | 'assignment' | 'swap';

/**
 * Declares how to resolve the TARGET unit for a route so that UnitScopeGuard
 * can enforce cross-unit access for strictly unit-scoped users (saha sorumlusu).
 *
 * - entityType + idParam: resolve the entity by the named route param (e.g. :id)
 *   and read its unit from the DB.
 * - entityType + entityBodyField: resolve the entity by an id supplied in the
 *   request body (e.g. { scheduleId }).
 * - unitBodyField: read the target unitId directly from body[unitBodyField].
 * - unitParam: read the target unitId from params[unitParam].
 */
export interface UnitScopeOptions {
  entityType?: UnitScopeEntity;
  idParam?: string;
  entityBodyField?: string;
  unitBodyField?: string;
  unitParam?: string;
}

export function UnitScope(options: UnitScopeOptions): MethodDecorator & ClassDecorator {
  return SetMetadata(UNIT_SCOPE_KEY, options);
}
