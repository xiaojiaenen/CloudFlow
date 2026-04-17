import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { readdir, stat } from 'fs/promises';
import path from 'path';
import { PrismaService } from 'src/prisma/prisma.service';
import { TaskArtifactStorageService } from './task-artifact-storage.service';

const CLEANUP_INTERVAL_MS = 1000 * 60 * 30;
const CLEANUP_BATCH_SIZE = 20;
const TERMINAL_STATUSES: TaskStatus[] = ['success', 'failed', 'cancelled'];
const ORPHAN_DIR_MIN_AGE_MS = 1000 * 60 * 60 * 6;

@Injectable()
export class TaskArtifactCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskArtifactCleanupService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly taskRuntimeBaseDir = process.env.TASK_RUNTIME_BASE_DIR
    ? path.resolve(process.env.TASK_RUNTIME_BASE_DIR)
    : path.resolve(process.cwd(), 'runtime', 'tasks');

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
      let deletedTaskCount = 0;
      let deletedScreenshotCount = 0;

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
          deletedScreenshotCount += 1;
        }

        await this.storageService.removeTaskTempDir(task.tempDir);
        await this.prismaService.task.delete({
          where: {
            id: task.id,
          },
        });
        deletedTaskCount += 1;
      }

      const orphanDirCount = await this.cleanupOrphanTaskDirs(cutoff);

      this.logger.log(
        `Cleanup finished: deleted ${deletedTaskCount} expired tasks, removed ${deletedScreenshotCount} screenshots, removed ${orphanDirCount} orphan runtime directories.`,
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

  private async cleanupOrphanTaskDirs(cutoff: Date) {
    const entries = await readdir(this.taskRuntimeBaseDir, {
      withFileTypes: true,
    }).catch(() => []);

    if (entries.length === 0) {
      return 0;
    }

    const keepTasks = await this.prismaService.task.findMany({
      where: {
        OR: [
          {
            status: {
              notIn: TERMINAL_STATUSES,
            },
          },
          {
            completedAt: {
              gte: cutoff,
            },
          },
        ],
        tempDir: {
          not: null,
        },
      },
      select: {
        tempDir: true,
      },
    });

    const keepDirSet = new Set(
      keepTasks
        .map((task) => task.tempDir)
        .filter((tempDir): tempDir is string => Boolean(tempDir))
        .map((tempDir) => path.resolve(tempDir)),
    );

    let removedCount = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const resolvedDir = path.resolve(this.taskRuntimeBaseDir, entry.name);
      if (keepDirSet.has(resolvedDir)) {
        continue;
      }

      const metadata = await stat(resolvedDir).catch(() => null);
      if (!metadata || Date.now() - metadata.mtimeMs < ORPHAN_DIR_MIN_AGE_MS) {
        continue;
      }

      await this.storageService.removeTaskTempDir(resolvedDir);
      removedCount += 1;
    }

    return removedCount;
  }
}
