import { Global, Module, Provider } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { EventBusService } from './event-bus.service';
import { EventStoreService, REDIS_CLIENT } from './event-store.service';
import { EventMonitoringService } from './event-monitoring.service';
import { DeadLetterQueueService } from './dead-letter-queue.service';
import { EventReplayService } from './event-replay.service';
import { EventsConsumer } from './handlers/events.consumer';

function createRedisProvider(configService: ConfigService): Redis {
  const redisUrl = configService.get<string>('REDIS_URL');
  if (redisUrl) {
    return new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return new Redis({
    host: 'localhost',
    port: 6379,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

const redisClientProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: (configService: ConfigService) =>
    createRedisProvider(configService),
  inject: [ConfigService],
};

@Global()
@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        return {
          connection: redisUrl
            ? { url: redisUrl }
            : { host: 'localhost', port: 6379 },
        };
      },
      inject: [ConfigService],
    }),
    BullModule.registerQueue({ name: 'events' }, { name: 'dead-letter' }),
  ],
  providers: [
    redisClientProvider,
    EventBusService,
    EventStoreService,
    EventMonitoringService,
    DeadLetterQueueService,
    EventReplayService,
    EventsConsumer,
  ],
  exports: [
    REDIS_CLIENT,
    EventBusService,
    EventStoreService,
    EventMonitoringService,
    DeadLetterQueueService,
    EventReplayService,
    EventsConsumer,
  ],
})
export class EventBusModule {}
