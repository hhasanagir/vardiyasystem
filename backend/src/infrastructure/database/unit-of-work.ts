import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';
import { PrismaService } from '../../prisma.service';

export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');

export interface UnitOfWork {
  tx: Prisma.TransactionClient;
}

@Injectable()
export class UnitOfWorkService {
  private readonly logger = new Logger(UnitOfWorkService.name);
  private readonly storage = new AsyncLocalStorage<UnitOfWork>();

  constructor(private readonly prisma: PrismaService) {}

  getTransaction(): UnitOfWork | undefined {
    return this.storage.getStore();
  }

  getClient(): Prisma.TransactionClient | PrismaClient {
    const uow = this.getTransaction();
    return uow ? uow.tx : this.prisma;
  }

  async run<T>(
    fn: (uow: UnitOfWork) => Promise<T>,
    options?: { timeout?: number },
  ): Promise<T> {
    const existing = this.getTransaction();
    if (existing) {
      return fn(existing);
    }

    return this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const uow: UnitOfWork = { tx };
        return this.storage.run(uow, () => fn(uow));
      },
      { timeout: options?.timeout ?? 30000 },
    );
  }

  async runInIsolation<T>(fn: (uow: UnitOfWork) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const uow: UnitOfWork = { tx };
        return this.storage.run(uow, () => fn(uow));
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
