import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import {
  TASK_CANCEL_CHANNEL,
  TASK_CANCEL_KEY_PREFIX,
  TASK_EVENTS_CHANNEL,
  TASK_EXECUTION_JOB_NAME,
  TASK_QUEUE_NAME,
} from 'src/common/constants/redis.constants';
import {
  TaskExecutionEvent,
  TaskExecutionStatus,
  TaskLogLevel,
  TaskQueuePayload,
} from 'src/common/types/execution-event.types';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queue: Queue<TaskQueuePayload>;
  private readonly connection: IORedis;
  private readonly publisher: IORedis;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL', 'redis://127.0.0.1:6379');

    this.connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.publisher = new IORedis(redisUrl, {
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
    const job = await this.queue.add(TASK_EXECUTION_JOB_NAME, payload, {
      jobId: payload.taskId,
    });
    this.logger.log(`Task ${payload.taskId} enqueued as job ${job.id}`);
    return job;
  }

  async cancelPendingTask(taskId: string) {
    const job = await this.queue.getJob(taskId);

    if (!job) {
      return false;
    }

    const state = await job.getState();

    if (state === 'active' || state === 'completed' || state === 'failed') {
      return false;
    }

    await job.remove();
    return true;
  }

  async requestTaskCancellation(taskId: string) {
    await this.publisher.set(this.getCancellationKey(taskId), '1', 'EX', 60 * 60 * 24);
    await this.publisher.publish(TASK_CANCEL_CHANNEL, JSON.stringify({ taskId }));
  }

  async clearTaskCancellation(taskId: string) {
    await this.publisher.del(this.getCancellationKey(taskId));
  }

  async publishEvent(event: TaskExecutionEvent) {
    await this.publisher.publish(TASK_EVENTS_CHANNEL, JSON.stringify(event));
  }

  async publishLog(
    taskId: string,
    message: string,
    level: TaskLogLevel = 'info',
    nodeId?: string,
  ) {
    await this.publishEvent({
      taskId,
      type: 'log',
      data: {
        message,
        level,
        nodeId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  async publishStatus(taskId: string, status: TaskExecutionStatus, errorMessage?: string) {
    await this.publishEvent({
      taskId,
      type: 'status',
      data: {
        status,
        errorMessage,
        timestamp: new Date().toISOString(),
      },
    });
  }

  private getCancellationKey(taskId: string) {
    return `${TASK_CANCEL_KEY_PREFIX}${taskId}`;
  }

  async onModuleDestroy() {
    await this.queue.close();
    await this.publisher.quit();
    await this.connection.quit();
  }
}
