import { AggregateRoot } from './aggregate-root.base';
import { EntityId } from './entity.base';

export interface RepositoryPort<TAggregate extends AggregateRoot<unknown>> {
  findById(id: EntityId): Promise<TAggregate | null>;
  findAll(filter?: Record<string, unknown>): Promise<TAggregate[]>;
  save(aggregate: TAggregate): Promise<void>;
  delete(id: EntityId): Promise<void>;
  softDelete(id: EntityId): Promise<void>;
}
