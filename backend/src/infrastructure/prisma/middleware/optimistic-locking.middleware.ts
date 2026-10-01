import { Prisma, PrismaClient } from '@prisma/client';

const VERSIONED_MODELS = new Set(['Schedule', 'Assignment', 'Personnel']);

interface VersionedRecord {
  version: number;
  [key: string]: unknown;
}

export function createOptimisticLockingMiddleware(): Prisma.Middleware {
  return async (
    params: Prisma.MiddlewareParams,
    next: (params: Prisma.MiddlewareParams) => Promise<unknown>,
  ): Promise<unknown> => {
    const modelName = params.model as string;
    if (!modelName || !VERSIONED_MODELS.has(modelName)) {
      return next(params);
    }

    if (params.action === 'update') {
      const whereVersion = params.args?.where?.version;
      if (whereVersion !== undefined) {
        params.args.where.version = whereVersion;
        params.args.data.version = { increment: 1 };
      }
    }

    return next(params);
  };
}
