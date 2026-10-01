import { Prisma } from '@prisma/client';
import { AggregateRoot, EntityId, RepositoryPort } from '../../ddd';
import { Logger } from '@nestjs/common';
import { UnitOfWorkService } from './unit-of-work';

export abstract class BaseRepository<
  TAggregate extends AggregateRoot<unknown>,
  TPrismaModel = Record<string, unknown>,
> implements RepositoryPort<TAggregate> {
  protected readonly logger: Logger;

  constructor(
    protected readonly uow: UnitOfWorkService,
    protected readonly modelName: string,
    contextName: string,
  ) {
    this.logger = new Logger(contextName);
  }

  abstract toDomain(record: TPrismaModel): TAggregate;
  abstract toPersistence(aggregate: TAggregate): Record<string, unknown>;

  protected get client():
    | Prisma.TransactionClient
    | import('@prisma/client').PrismaClient {
    return this.uow.getClient();
  }

  private get delegate(): any {
    return (this.client as any)[this.modelName];
  }

  async findById(id: EntityId): Promise<TAggregate | null> {
    const record = await this.delegate.findUnique({ where: { id } });
    if (!record) return null;
    if (record.deletedAt) return null;
    return this.toDomain(record);
  }

  async findAll(filter?: Record<string, unknown>): Promise<TAggregate[]> {
    const records = await this.delegate.findMany({
      where: { ...filter, deletedAt: null },
    });
    return records.map((r: TPrismaModel) => this.toDomain(r));
  }

  async findOne(filter: Record<string, unknown>): Promise<TAggregate | null> {
    const record = await this.delegate.findFirst({
      where: { ...filter, deletedAt: null },
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async exists(filter: Record<string, unknown>): Promise<boolean> {
    const count = await this.delegate.count({
      where: { ...filter, deletedAt: null },
    });
    return count > 0;
  }

  async save(aggregate: TAggregate): Promise<void> {
    const existing = await this.delegate.findUnique({
      where: { id: aggregate.id },
    });

    if (existing) {
      await this.delegate.update({
        where: { id: aggregate.id, version: existing.version },
        data: {
          ...this.toPersistence(aggregate),
          version: { increment: 1 },
          updatedAt: new Date(),
        },
      });
    } else {
      const data = this.toPersistence(aggregate) as any;
      await this.delegate.create({
        data: {
          ...data,
          id: aggregate.id,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }
  }

  async update(
    id: EntityId,
    data: Partial<Record<string, unknown>>,
  ): Promise<void> {
    await this.delegate.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
    });
  }

  async delete(id: EntityId): Promise<void> {
    await this.delegate.delete({ where: { id } });
  }

  async softDelete(id: EntityId): Promise<void> {
    await this.delegate.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        version: { increment: 1 },
        updatedAt: new Date(),
      },
    });
  }
}
