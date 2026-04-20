import { mkdir, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { Page } from 'playwright';
import { TaskScreenshotPayload } from '../../src/common/types/execution-event.types';

const RESOURCE_MONITOR_INTERVAL_MS = 2_000;
const ACTIVE_SCREENSHOT_INTERVAL_MS = 300;
const IDLE_SCREENSHOT_INTERVAL_MS = 800;
const SCREENSHOT_ACTIVITY_WINDOW_MS = 1_500;
const SCREENSHOT_DIFF_SAMPLE_COUNT = 48;
const SCREENSHOT_DIFF_THRESHOLD = 0.12;
const cpuCoreCount =
  typeof os.availableParallelism === 'function'
    ? Math.max(1, os.availableParallelism())
    : Math.max(1, os.cpus().length);

interface ResourceSnapshot {
  memoryRssMb: number;
  heapUsedMb: number;
  cpuPercent: number;
}

export function createTaskResourceManager(prisma: PrismaClient, taskRuntimeBaseDir: string) {
  async function ensureTaskTempDir(taskId: string) {
    const tempDir = path.join(taskRuntimeBaseDir, taskId);
    await mkdir(tempDir, { recursive: true });
    return tempDir;
  }

  function startResourceMonitor(taskId: string) {
    let previousCpuUsage = process.cpuUsage();
    let previousTimestamp = process.hrtime.bigint();
    let peakMemoryRssMb = 0;
    let peakHeapUsedMb = 0;
    let peakCpuPercent = 0;
    let flushing = false;

    const flush = async () => {
      if (flushing) {
        return;
      }

      flushing = true;

      try {
        const nextSample = createResourceSnapshot(previousCpuUsage, previousTimestamp);
        previousCpuUsage = nextSample.cpuUsage;
        previousTimestamp = nextSample.timestamp;
        peakMemoryRssMb = Math.max(peakMemoryRssMb, nextSample.snapshot.memoryRssMb);
        peakHeapUsedMb = Math.max(peakHeapUsedMb, nextSample.snapshot.heapUsedMb);
        peakCpuPercent = Math.max(peakCpuPercent, nextSample.snapshot.cpuPercent);

        await prisma.task.update({
          where: { id: taskId },
          data: {
            workerPid: process.pid,
            resourceHeartbeatAt: new Date(),
            memoryRssMb: nextSample.snapshot.memoryRssMb,
            peakMemoryRssMb,
            heapUsedMb: nextSample.snapshot.heapUsedMb,
            peakHeapUsedMb,
            cpuPercent: nextSample.snapshot.cpuPercent,
            peakCpuPercent,
          },
        });
      } catch {
        // Ignore transient sampling failures so execution can continue.
      } finally {
        flushing = false;
      }
    };

    void flush();

    const interval = setInterval(() => {
      void flush();
    }, RESOURCE_MONITOR_INTERVAL_MS);

    return async () => {
      clearInterval(interval);
      await flush();
    };
  }

  function startScreenshotStream(
    taskId: string,
    page: Page,
    _intervalMs: number,
    tempDir: string,
    publishScreenshot: (
      taskId: string,
      payload: TaskScreenshotPayload,
    ) => Promise<unknown>,
  ) {
    let capturing = false;
    let stopped = false;
    let timer: NodeJS.Timeout | null = null;
    let previousBuffer: Buffer | null = null;
    let lastActivityAt = 0;

    const scheduleNextCapture = (delayMs: number) => {
      if (stopped) {
        return;
      }

      timer = setTimeout(() => {
        void capture();
      }, Math.max(0, delayMs));
    };

    const capture = async () => {
      if (stopped || capturing || page.isClosed()) {
        return;
      }

      capturing = true;

      try {
        const buffer = await page.screenshot({
          type: 'jpeg',
          quality: 60,
        });
        const isActive =
          !previousBuffer || estimateScreenshotDiff(previousBuffer, buffer) >= SCREENSHOT_DIFF_THRESHOLD;

        previousBuffer = buffer;

        if (isActive) {
          lastActivityAt = Date.now();
        }

        await writeFile(path.join(tempDir, 'latest-stream.jpg'), buffer).catch(() => undefined);

        await publishScreenshot(taskId, {
          imageBase64: buffer.toString('base64'),
          mimeType: 'image/jpeg',
          source: 'stream',
          timestamp: new Date().toISOString(),
        });
      } catch {
        // Ignore transient screenshot failures when pages are navigating.
      } finally {
        capturing = false;

        if (stopped || page.isClosed()) {
          return;
        }

        const nextDelayMs =
          Date.now() - lastActivityAt <= SCREENSHOT_ACTIVITY_WINDOW_MS
            ? ACTIVE_SCREENSHOT_INTERVAL_MS
            : IDLE_SCREENSHOT_INTERVAL_MS;

        scheduleNextCapture(nextDelayMs);
      }
    };

    scheduleNextCapture(0);

    return () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }

  return {
    ensureTaskTempDir,
    startResourceMonitor,
    startScreenshotStream,
  };
}

function toMb(bytes: number) {
  return Number((bytes / 1024 / 1024).toFixed(2));
}

function estimateScreenshotDiff(previousBuffer: Buffer, currentBuffer: Buffer) {
  const previousLength = previousBuffer.length;
  const currentLength = currentBuffer.length;
  const maxLength = Math.max(previousLength, currentLength, 1);
  const minLength = Math.min(previousLength, currentLength);
  const lengthDiffRatio = Math.abs(previousLength - currentLength) / maxLength;

  if (minLength === 0) {
    return 1;
  }

  const sampleCount = Math.min(SCREENSHOT_DIFF_SAMPLE_COUNT, minLength);
  let sampledDiff = 0;

  for (let index = 0; index < sampleCount; index += 1) {
    const offset =
      sampleCount === 1 ? 0 : Math.floor((index * (minLength - 1)) / (sampleCount - 1));
    sampledDiff += Math.abs(previousBuffer[offset] - currentBuffer[offset]) / 255;
  }

  const sampledDiffRatio = sampledDiff / sampleCount;
  return Math.max(lengthDiffRatio, sampledDiffRatio);
}

function createResourceSnapshot(
  previousCpuUsage: NodeJS.CpuUsage,
  previousTimestamp: bigint,
): { snapshot: ResourceSnapshot; cpuUsage: NodeJS.CpuUsage; timestamp: bigint } {
  const memory = process.memoryUsage();
  const currentCpuUsage = process.cpuUsage();
  const currentTimestamp = process.hrtime.bigint();
  const elapsedMicroseconds = Math.max(1, Number(currentTimestamp - previousTimestamp) / 1000);
  const cpuDeltaUser = currentCpuUsage.user - previousCpuUsage.user;
  const cpuDeltaSystem = currentCpuUsage.system - previousCpuUsage.system;
  const cpuPercent = Math.min(
    100,
    Number((((cpuDeltaUser + cpuDeltaSystem) / (elapsedMicroseconds * cpuCoreCount)) * 100).toFixed(2)),
  );

  return {
    snapshot: {
      memoryRssMb: toMb(memory.rss),
      heapUsedMb: toMb(memory.heapUsed),
      cpuPercent: Number.isFinite(cpuPercent) ? cpuPercent : 0,
    },
    cpuUsage: currentCpuUsage,
    timestamp: currentTimestamp,
  };
}
