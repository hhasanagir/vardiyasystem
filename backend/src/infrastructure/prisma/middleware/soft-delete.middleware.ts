import { Prisma } from '@prisma/client';

type PrismaModel = { name: string } & Record<string, unknown>;

const SOFT_DELETABLE_MODELS = new Set([
  'NotificationRecipient',
]);

/**
 * Models that soft-delete but have no `updatedAt` column. Injecting one produced
 * a PrismaClientValidationError, so every delete/deleteMany against such a model
 * failed. The set is derived from the generated DMMF so it stays correct when the
 * schema changes.
 */
function withoutUpdatedAt(models: ReadonlySet<string>): ReadonlySet<string> {
  try {
    const datamodel = Prisma.dmmf.datamodel;
    if (ArrayModelGuard(datamodel)) {
      return new Set(
        [...models].filter((name) => {
          const model = datamodel.models.find((m) => m.name === name);
          return Boolean(model) && !model!.fields.some((f) => f.name === 'updatedAt');
        }),
      );
    }
  } catch {
    // Fall back to the empty set: never inject a column we cannot verify.
  }
  return new Set<string>();
}

function ArrayModelGuard(datamodel: unknown): datamodel is { models: Array<{ name: string; fields: Array<{ name: string }> }> } {
  return typeof datamodel === 'object'
    && datamodel !== null
    && Array.isArray((datamodel as { models?: unknown }).models);
}

const MODELS_WITHOUT_UPDATED_AT = withoutUpdatedAt(SOFT_DELETABLE_MODELS);

export function createSoftDeleteMiddleware(): Prisma.Middleware {
  return async (
    params: Prisma.MiddlewareParams,
    next: (params: Prisma.MiddlewareParams) => Promise<unknown>,
  ): Promise<unknown> => {
    const modelName = params.model as string;
    if (!modelName || !SOFT_DELETABLE_MODELS.has(modelName)) {
      return next(params);
    }

    const softDeleteData = () => (
      MODELS_WITHOUT_UPDATED_AT.has(modelName)
        ? { deletedAt: new Date() }
        : { deletedAt: new Date(), updatedAt: new Date() }
    );

    if (params.action === 'findUnique') {
      params.action = 'findFirst';
      params.args = {
        ...params.args,
        where: { ...params.args?.where, deletedAt: null },
      };
    }

    if (params.action === 'findMany' || params.action === 'findFirst') {
      if (!params.args) params.args = {};
      if (!params.args.where) params.args.where = {};
      if (params.args.where.deletedAt === undefined) {
        params.args.where.deletedAt = null;
      }
    }

    if (params.action === 'update' || params.action === 'updateMany') {
      if (!params.args) params.args = {};
      if (!params.args.where) params.args.where = {};
      if (params.args.where.deletedAt === undefined) {
        params.args.where.deletedAt = null;
      }
    }

    if (params.action === 'delete') {
      params.action = 'update';
      params.args = {
        ...params.args,
        data: { ...(params.args?.data as object | undefined), ...softDeleteData() },
      };
    }

    if (params.action === 'deleteMany') {
      params.action = 'updateMany';
      params.args = {
        ...params.args,
        data: softDeleteData(),
      };
    }

    return next(params);
  };
}
