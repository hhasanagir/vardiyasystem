import { Prisma } from '@prisma/client';

type PrismaModel = { name: string } & Record<string, unknown>;

const SOFT_DELETABLE_MODELS = new Set(['NotificationRecipient']);

export function createSoftDeleteMiddleware(): Prisma.Middleware {
  return async (
    params: Prisma.MiddlewareParams,
    next: (params: Prisma.MiddlewareParams) => Promise<unknown>,
  ): Promise<unknown> => {
    const modelName = params.model as string;
    if (!modelName || !SOFT_DELETABLE_MODELS.has(modelName)) {
      return next(params);
    }

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
        data: { deletedAt: new Date(), updatedAt: new Date() },
      };
    }

    if (params.action === 'deleteMany') {
      params.action = 'updateMany';
      params.args = {
        ...params.args,
        data: { deletedAt: new Date(), updatedAt: new Date() },
      };
    }

    return next(params);
  };
}
