import { Prisma } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';

export const tenantContext = new AsyncLocalStorage<{
  organizationId: string;
}>();

const TENANT_MODELS = new Set([
  'Schedule',
  'Assignment',
  'Personnel',
  'Device',
  'Unit',
  'ShiftTask',
  'HandoverNote',
  'DeviceIncident',
  'AttendanceRecord',
  'SwapRequest',
  'Notification',
  'Training',
  'Skill',
  'Shifts',
  'AssignmentSlot',
]);

const ORGANIZATION_ID_FIELD = 'organizationId';

export function createTenantMiddleware(): Prisma.Middleware {
  return async (
    params: Prisma.MiddlewareParams,
    next: (params: Prisma.MiddlewareParams) => Promise<unknown>,
  ): Promise<unknown> => {
    const store = tenantContext.getStore();
    if (!store) return next(params);

    const modelName = params.model as string;
    if (!modelName || !TENANT_MODELS.has(modelName)) return next(params);

    const { organizationId } = store;

    if (params.action === 'create') {
      if (!params.args) params.args = {};
      params.args.data = {
        ...params.args.data,
        [ORGANIZATION_ID_FIELD]: organizationId,
      };
      return next(params);
    }

    if (
      params.action === 'findUnique' ||
      params.action === 'findFirst' ||
      params.action === 'findMany' ||
      params.action === 'update' ||
      params.action === 'updateMany' ||
      params.action === 'delete' ||
      params.action === 'deleteMany' ||
      params.action === 'count' ||
      params.action === 'aggregate'
    ) {
      if (!params.args) params.args = {};
      if (!params.args.where) params.args.where = {};
      if (!params.args.where[ORGANIZATION_ID_FIELD]) {
        params.args.where[ORGANIZATION_ID_FIELD] = organizationId;
      }
    }

    return next(params);
  };
}
