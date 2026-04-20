import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RECORDER_EVENTS_CHANNEL } from 'src/common/constants/redis.constants';
import { RecorderLiveEvent } from 'src/common/types/recorder.types';
import {
  createRedisConnection,
  resolveRedisConfig,
  type RedisConnection,
} from 'src/common/utils/redis-connection';
import { RecorderEventsGateway } from './recorder-events.gateway';

@Injectable()
export class RecorderEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecorderEventsService.name);
  private readonly subscriber: RedisConnection;

  constructor(
    private readonly configService: ConfigService,
    private readonly recorderEventsGateway: RecorderEventsGateway,
  ) {
    const redisConfig = resolveRedisConfig(this.configService);
    this.subscriber = createRedisConnection(redisConfig, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      connectionName: 'cloudflow-recorder-events-subscriber',
    });
  }

  async onModuleInit() {
    await this.subscriber.subscribe(RECORDER_EVENTS_CHANNEL);
    this.subscriber.on('message', (channel, message) => {
      if (channel !== RECORDER_EVENTS_CHANNEL) {
        return;
      }

      try {
        const event = JSON.parse(message) as RecorderLiveEvent;
        this.recorderEventsGateway.emitRecorderEvent(event.sessionId, event);
      } catch (error) {
        this.logger.error(
          `Failed to parse recorder event: ${message}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    });
  }

  async onModuleDestroy() {
    await this.subscriber.unsubscribe(RECORDER_EVENTS_CHANNEL);
    await this.subscriber.quit();
  }
}
