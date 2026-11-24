import { Prisma } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';

export const tenantContext = new AsyncLocalStorage<{ organizationId: string }>();

const TENANT_MODELS = new Set([
  'Schedule', 'Assignment', 'Personnel', 'Device', 'Unit', 'ShiftTask',
  'HandoverNote', 'DeviceIncident', 'AttendanceRecord', 'SwapRequest',
  'Notification', 'Training', 'Skill', 'Shifts', 'AssignmentSlot',
]);

const ORGANIZATION_ID_FIELD = 'organizationId';

/**
 * Builds the set of tenant models that ACTUALLY own a direct `organizationId`
 * column in the Prisma data model.
 *
 * The middleware may only inject `organizationId` into the `where`/`data` of
 * models that declare the column. Models that do not own the column are
 * scoped through other means already enforced server-side at the guard and
 * service layer (e.g. ScheduleAccessGuard, per-user keys for ShiftTask, and
 * global catalog models such as Skill). Injecting the column blindly into
 * those models produces a PrismaClientValidationError and breaks every
 * tenant-scoped request.
 *
 * Deriving this from the generated DMMF (rather than a hardcoded list) keeps
 * the middleware correct if the schema changes.
 */
function collectOrgColumnModels(): ReadonlySet<string> {
  try {
    const models = Prisma.dmmf.datamodel.models;
    if (Array.isArray(models)) {
      const fieldNames = new Set(
        models.flatMap((m) => {
          const model = m as { name: string; fields: Array<{ name: string }> };
          return model.fields.map((f) => `${model.name}:${f.name}`);
        }),
      );
      return new Set(
        [...TENANT_MODELS].filter((name) => fieldNames.has(`${name}:${ORGANIZATION_ID_FIELD}`)),
      );
    }
  } catch {
    // Fall back to no injection (models without the column must not be corrupted).
  }
  return new Set<string>();
}

const ORG_COLUMN_MODELS: ReadonlySet<string> = collectOrgColumnModels();

export function createTenantMiddleware(): Prisma.Middleware {
  return async (
    params: Prisma.MiddlewareParams,
    next: (params: Prisma.MiddlewareParams) => Promise<unknown>,
  ): Promise<unknown> => {
    const store = tenantContext.getStore();
    if (!store) return next(params);

    const modelName = params.model as string;
    if (!modelName || !TENANT_MODELS.has(modelName)) return next(params);

    // Only inject the organizationId column for models that own it.
    if (!ORG_COLUMN_MODELS.has(modelName)) return next(params);

    const { organizationId } = store;

    // Prisma types `args` as `any`. Narrow it once here so every mutation below
    // is type-checked instead of propagating unsafe `any` member access.
    type TenantArgs = {
      data?: Record<string, unknown> | Record<string, unknown>[];
      where?: Record<string, unknown>;
      create?: Record<string, unknown>;
    };
    const args = (params.args ?? {}) as TenantArgs;
    params.args = args;

    if (params.action === 'create') {
      args.data = {
        ...((args.data ?? {}) as Record<string, unknown>),
        [ORGANIZATION_ID_FIELD]: organizationId,
      };
      return next(params);
    }

    // Bulk inserts bypass `create` entirely, so they must be stamped explicitly.
    // Without this, rows written via createMany end up with a NULL tenant and
    // become invisible to every tenant-scoped read (or, worse, cross-tenant).
    if (params.action === 'createMany' || params.action === 'createManyAndReturn') {
      const rows: Record<string, unknown>[] = Array.isArray(args.data)
        ? args.data
        : args.data
          ? [args.data as Record<string, unknown>]
          : [];
      args.data = rows.map((row) => ({
        ...row,
        [ORGANIZATION_ID_FIELD]: organizationId,
      }));
      return next(params);
    }

    if (
      params.action === 'findUnique' ||
      params.action === 'findUniqueOrThrow' ||
      params.action === 'findFirst' ||
      params.action === 'findFirstOrThrow' ||
      params.action === 'findMany' ||
      params.action === 'update' ||
      params.action === 'updateMany' ||
      params.action === 'delete' ||
      params.action === 'deleteMany' ||
      params.action === 'count' ||
      params.action === 'aggregate'
    ) {
      // Never let a caller-supplied predicate widen the scope: inside a tenant
      // request every query is pinned to the authenticated organization.
      args.where = {
        ...(args.where ?? {}),
        [ORGANIZATION_ID_FIELD]: organizationId,
      };
      return next(params);
    }

    if (params.action === 'upsert') {
      args.where = {
        ...(args.where ?? {}),
        [ORGANIZATION_ID_FIELD]: organizationId,
      };
      if (args.create) {
        args.create = {
          ...args.create,
          [ORGANIZATION_ID_FIELD]: organizationId,
        };
      }
    }

    return next(params);
  };
}
