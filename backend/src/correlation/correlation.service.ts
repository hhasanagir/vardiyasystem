import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface CorrelationContext {
  correlationId: string;
  userId?: string;
  organizationId?: string;
}

@Injectable()
export class CorrelationService implements OnModuleDestroy {
  private readonly storage = new AsyncLocalStorage<CorrelationContext>();

  run(context: CorrelationContext, cb: () => void) {
    this.storage.run(context, cb);
  }

  getCorrelationId(): string {
    return this.storage.getStore()?.correlationId || 'system';
  }

  getContext(): CorrelationContext | undefined {
    return this.storage.getStore();
  }

  onModuleDestroy() {
    this.storage.disable();
  }
}
