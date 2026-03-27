import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { TASK_EXECUTION_JOB_NAME, TASK_QUEUE_NAME } from 'src/common/constants/redis.constants';
import { TaskQueuePayload } from 'src/common/types/execution-event.types';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queue: Queue<TaskQueuePayload>;
  private readonly connection: IORedis;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL', 'redis://127.0.0.1:6379');

    this.connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.queue = new Queue<TaskQueuePayload>(TASK_QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 1000,
      },
    });
  }

  async enqueueTask(payload: TaskQueuePayload) {
    const job = await this.queue.add(TASK_EXECUTION_JOB_NAME, payload);
    this.logger.log(`Task ${payload.taskId} enqueued as job ${job.id}`);
    return job;
  }

  async onModuleDestroy() {
    await this.queue.close();
    await this.connection.quit();
  }
}
