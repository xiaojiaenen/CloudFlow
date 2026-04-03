import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import IORedis from 'ioredis';
import { TASK_EVENTS_CHANNEL } from 'src/common/constants/redis.constants';
import {
  TaskExecutionEvent,
  TaskExtractPayload,
  TaskLogPayload,
  TaskScreenshotPayload,
  TaskStatusPayload,
} from 'src/common/types/execution-event.types';
import { NotificationService } from 'src/modules/notification/notification.service';
import { TaskArtifactStorageService } from 'src/modules/storage/task-artifact-storage.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { TaskEventsGateway } from 'src/ws/task-events.gateway';

@Injectable()
export class ExecutionEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExecutionEventsService.name);
  private readonly subscriber: IORedis;
  private readonly taskWriteChains = new Map<string, Promise<void>>();
  private readonly taskSequences = new Map<string, number>();
  private readonly lastPersistedScreenshotAt = new Map<string, number>();
  private screenshotPersistIntervalMsCache = 3000;
  private screenshotPersistIntervalCacheAt = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
    private readonly prismaService: PrismaService,
    private readonly taskEventsGateway: TaskEventsGateway,
    private readonly storageService: TaskArtifactStorageService,
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
        this.enqueuePersistence(event);
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

  private enqueuePersistence(event: TaskExecutionEvent) {
    const existingChain = this.taskWriteChains.get(event.taskId) ?? Promise.resolve();
    const nextChain = existingChain
      .catch(() => undefined)
      .then(async () => {
        if (!(await this.shouldPersistEvent(event))) {
          return;
        }

        const sequence = await this.getNextSequence(event.taskId);
        const persistencePayload = await this.buildPersistencePayload(event, sequence);
        await this.prismaService.taskExecutionEvent.create({
          data: persistencePayload,
        });

        if (
          event.type === 'status' &&
          ['success', 'failed', 'cancelled'].includes((event.data as TaskStatusPayload).status)
        ) {
          await this.notifyTaskIfNeeded(event.taskId);
          this.taskSequences.delete(event.taskId);
          this.lastPersistedScreenshotAt.delete(event.taskId);
        }
      })
      .catch((error) => {
        this.logger.error(
          `Failed to persist execution event for task ${event.taskId}`,
          error instanceof Error ? error.stack : String(error),
        );
      });

    this.taskWriteChains.set(event.taskId, nextChain);
    void nextChain.finally(() => {
      if (this.taskWriteChains.get(event.taskId) === nextChain) {
        this.taskWriteChains.delete(event.taskId);
      }
    });
  }

  private async getNextSequence(taskId: string) {
    const currentSequence = this.taskSequences.get(taskId);

    if (typeof currentSequence === 'number') {
      const nextSequence = currentSequence + 1;
      this.taskSequences.set(taskId, nextSequence);
      return nextSequence;
    }

    const latestEvent = await this.prismaService.taskExecutionEvent.findFirst({
      where: { taskId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });

    const nextSequence = (latestEvent?.sequence ?? 0) + 1;
    this.taskSequences.set(taskId, nextSequence);
    return nextSequence;
  }

  private async shouldPersistEvent(event: TaskExecutionEvent) {
    if (event.type !== 'screenshot') {
      return true;
    }

    const payload = event.data as TaskScreenshotPayload;

    if (payload.source === 'node') {
      return true;
    }

    const eventTime = new Date(payload.timestamp).getTime();
    const lastTime = this.lastPersistedScreenshotAt.get(event.taskId) ?? 0;
    const persistIntervalMs = await this.getScreenshotPersistIntervalMs();

    if (eventTime - lastTime < persistIntervalMs) {
      return false;
    }

    this.lastPersistedScreenshotAt.set(event.taskId, eventTime);
    return true;
  }

  private async buildPersistencePayload(event: TaskExecutionEvent, sequence: number) {
    if (event.type === 'log') {
      const payload = event.data as TaskLogPayload;
      return {
        taskId: event.taskId,
        type: event.type,
        sequence,
        level: payload.level,
        nodeId: payload.nodeId,
        message: payload.message,
        payload: payload as unknown as Prisma.InputJsonValue,
        createdAt: new Date(payload.timestamp),
      };
    }

    if (event.type === 'status') {
      const payload = event.data as TaskStatusPayload;
      return {
        taskId: event.taskId,
        type: event.type,
        sequence,
        message: payload.errorMessage ?? payload.status,
        status: payload.status,
        payload: payload as unknown as Prisma.InputJsonValue,
        createdAt: new Date(payload.timestamp),
      };
    }

    if (event.type === 'extract') {
      const payload = event.data as TaskExtractPayload;
      return {
        taskId: event.taskId,
        type: event.type,
        sequence,
        nodeId: payload.nodeId,
        message: payload.preview,
        payload: payload as unknown as Prisma.InputJsonValue,
        createdAt: new Date(payload.timestamp),
      };
    }

    const payload = event.data as TaskScreenshotPayload;
    const stored = await this.storageService.saveScreenshot(
      event.taskId,
      sequence,
      payload,
    );

    return {
      taskId: event.taskId,
      type: event.type,
      sequence,
      mimeType: payload.mimeType,
      imageBase64: null,
      storageProvider: stored.storageProvider,
      storageBucket: stored.storageBucket,
      storageKey: stored.storageKey,
      sizeBytes: stored.sizeBytes,
      payload: {
        mimeType: payload.mimeType,
        source: payload.source ?? 'stream',
        timestamp: payload.timestamp,
        storageProvider: stored.storageProvider,
        storageBucket: stored.storageBucket,
        storageKey: stored.storageKey,
        sizeBytes: stored.sizeBytes,
      } as Prisma.InputJsonValue,
      createdAt: new Date(payload.timestamp),
    };
  }

  private async getScreenshotPersistIntervalMs() {
    const now = Date.now();
    if (now - this.screenshotPersistIntervalCacheAt < 30_000) {
      return this.screenshotPersistIntervalMsCache;
    }

    const config = await this.prismaService.systemConfig.findFirst({
      orderBy: {
        updatedAt: 'desc',
      },
      select: {
        screenshotPersistIntervalMs: true,
      },
    });

    this.screenshotPersistIntervalMsCache = Math.max(
      500,
      config?.screenshotPersistIntervalMs ?? 3000,
    );
    this.screenshotPersistIntervalCacheAt = now;
    return this.screenshotPersistIntervalMsCache;
  }

  private async notifyTaskIfNeeded(taskId: string) {
    await this.notificationService.notifyTaskFinished(taskId);
  }
}
