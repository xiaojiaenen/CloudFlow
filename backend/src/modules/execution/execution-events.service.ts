import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import { TASK_EVENTS_CHANNEL } from 'src/common/constants/redis.constants';
import { TaskExecutionEvent } from 'src/common/types/execution-event.types';
import { TaskEventsGateway } from 'src/ws/task-events.gateway';

@Injectable()
export class ExecutionEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExecutionEventsService.name);
  private readonly subscriber: IORedis;

  constructor(
    private readonly configService: ConfigService,
    private readonly taskEventsGateway: TaskEventsGateway,
  ) {
    const redisUrl = this.configService.get<string>('REDIS_URL', 'redis://127.0.0.1:6379');

    this.subscriber = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }

  async onModuleInit() {
    await this.subscriber.subscribe(TASK_EVENTS_CHANNEL);
    this.subscriber.on('message', (channel, message) => {
      if (channel !== TASK_EVENTS_CHANNEL) {
        return;
      }

      try {
        const event = JSON.parse(message) as TaskExecutionEvent;
        this.taskEventsGateway.emitTaskEvent(event.taskId, event);
      } catch (error) {
        this.logger.error(`Failed to parse execution event: ${message}`, error as Error);
      }
    });

    this.logger.log(`Subscribed to Redis channel ${TASK_EVENTS_CHANNEL}`);
  }

  async onModuleDestroy() {
    await this.subscriber.unsubscribe(TASK_EVENTS_CHANNEL);
    await this.subscriber.quit();
  }
}
