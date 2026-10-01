import { PrismaClient } from '@prisma/client';
import { AggregateRoot, EntityId, RepositoryPort } from '../../ddd';
import { DomainEvent } from '../../ddd/domain-event.base';
import { Logger } from '@nestjs/common';

export abstract class BaseRepository<
  TAggregate extends AggregateRoot<unknown>,
  TPrismaModel = Record<string, unknown>,
> implements RepositoryPort<TAggregate> {
  protected readonly logger: Logger;

  constructor(
    protected readonly prisma: PrismaClient,
    protected readonly modelName: string,
    contextName: string,
  ) {
    this.logger = new Logger(contextName);
  }

  abstract toDomain(record: TPrismaModel): TAggregate;
  abstract toPersistence(aggregate: TAggregate): Record<string, unknown>;

  async findById(id: EntityId): Promise<TAggregate | null> {
    const record = await (this.prisma as any)[this.modelName].findUnique({
      where: { id },
    });
    if (!record) return null;
    if (record.deletedAt) return null;
    return this.toDomain(record);
  }

  async findAll(filter?: Record<string, unknown>): Promise<TAggregate[]> {
    const records = await (this.prisma as any)[this.modelName].findMany({
      where: { ...filter, deletedAt: null },
    });
    return records.map((r: TPrismaModel) => this.toDomain(r));
  }

  async save(aggregate: TAggregate): Promise<void> {
    const events = aggregate.domainEvents;
    if (events.length > 0) {
      await this.publishEvents(events);
    }

    const existing = await (this.prisma as any)[this.modelName].findUnique({
      where: { id: aggregate.id },
    });

    if (existing) {
      await (this.prisma as any)[this.modelName].update({
        where: { id: aggregate.id, version: existing.version },
        data: { ...this.toPersistence(aggregate), version: { increment: 1 } },
      });
    } else {
      const data = this.toPersistence(aggregate) as any;
      await (this.prisma as any)[this.modelName].create({
        data: { ...data, id: aggregate.id, version: 1 },
      });
    }
  }

  async delete(id: EntityId): Promise<void> {
    await (this.prisma as any)[this.modelName].delete({ where: { id } });
  }

  async softDelete(id: EntityId): Promise<void> {
    await (this.prisma as any)[this.modelName].update({
      where: { id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
  }

  private async publishEvents(events: DomainEvent[]): Promise<void> {
    try {
      const eventBus = (this.prisma as any).__eventBus;
      if (eventBus) {
        for (const event of events) {
          await eventBus.publish(event);
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to publish domain events: ${(error as Error).message}`,
      );
    }
  }
}
