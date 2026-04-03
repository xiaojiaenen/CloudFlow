import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { TaskArtifactStorageService } from './task-artifact-storage.service';

const CLEANUP_INTERVAL_MS = 1000 * 60 * 30;
const CLEANUP_BATCH_SIZE = 20;
const TERMINAL_STATUSES: TaskStatus[] = ['success', 'failed', 'cancelled'];

@Injectable()
export class TaskArtifactCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskArtifactCleanupService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly storageService: TaskArtifactStorageService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.runCleanup();
    }, CLEANUP_INTERVAL_MS);

    void this.runCleanup();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runCleanup() {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      const systemConfig = await this.prismaService.systemConfig.findFirst({
        orderBy: {
          updatedAt: 'desc',
        },
      });
      const retentionDays = Math.max(1, systemConfig?.taskRetentionDays ?? 30);
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      const expiredTasks = await this.prismaService.task.findMany({
        where: {
          status: {
            in: TERMINAL_STATUSES,
          },
          completedAt: {
            lt: cutoff,
          },
        },
        orderBy: {
          completedAt: 'asc',
        },
        take: CLEANUP_BATCH_SIZE,
        select: {
          id: true,
          tempDir: true,
          executionEvents: {
            where: {
              type: 'screenshot',
            },
            select: {
              storageProvider: true,
              storageBucket: true,
              storageKey: true,
              imageBase64: true,
            },
          },
        },
      });

      if (expiredTasks.length === 0) {
        return;
      }

      for (const task of expiredTasks) {
        for (const event of task.executionEvents) {
          await this.storageService.deleteScreenshot(event);
        }

        await this.storageService.removeTaskTempDir(task.tempDir);
        await this.prismaService.task.delete({
          where: {
            id: task.id,
          },
        });
      }

      this.logger.log(
        `Cleaned up ${expiredTasks.length} expired tasks and their historical screenshots.`,
      );
    } catch (error) {
      this.logger.error(
        'Failed to clean up expired task artifacts.',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
